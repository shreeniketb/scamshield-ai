using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Encodings.Web;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Threading;
using System.Threading.Tasks;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using NAudio.Wave;
using NAudio.Wave.SampleProviders;

namespace ScamDetector
{
    public partial class MainWindow : Window
    {
        private static readonly HttpClient _http = new HttpClient { Timeout = TimeSpan.FromMinutes(2) };

        private const int ChunkSeconds     = 30;
        private const int TargetSampleRate = 16000;

        // ── Recording ─────────────────────────────────────────────────────────
        private WaveInEvent?           _micIn;
        private WasapiLoopbackCapture? _loopbackIn;
        private WasapiOut?             _silencePlayer;
        private WaveFileWriter?        _micWriter;
        private WaveFileWriter?        _loopbackWriter;
        private WaveFormat?            _micFormat;
        private WaveFormat?            _loopbackFormat;
        private readonly object        _writerLock = new();

        private TaskCompletionSource<bool>? _micStoppedTcs;
        private TaskCompletionSource<bool>? _loopbackStoppedTcs;

        // ── Chunking ──────────────────────────────────────────────────────────
        private System.Threading.Timer? _chunkTimer;
        private readonly SemaphoreSlim  _chunkLock = new(1, 1);
        private int                     _chunkNumber;
        private volatile bool           _isRecording;
        private DateTime                _chunkStart;
        private DateTime                _sessionStart;

        private string _assemblyKey = "";
        private string _grokKey     = "";

        // ── Grok ──────────────────────────────────────────────────────────────
        private int           _grokRequestCounter;
        private int           _latestAppliedGrok;
        private ScamVerdict?  _latestVerdict;
        private bool          _highAlertShown;
        private readonly List<Task>   _pendingGrok    = new();
        private readonly List<object> _verdictHistory = new();

        // ── Call monitor popup ────────────────────────────────────────────────
        private CallMonitorWindow? _monitor;
        private bool               _autoStarted;
        private object?            _callInfo;
        private volatile bool      _discardSession;

        // ── Call watcher ──────────────────────────────────────────────────────
        private CallWatcher? _callWatcher;


        // ── Paths ─────────────────────────────────────────────────────────────
        private static readonly string _baseDir = AppDomain.CurrentDomain.BaseDirectory;
        private static readonly string _workDir = Path.Combine(_baseDir, "audio");
        private readonly string _micPath         = Path.Combine(_workDir, "mic_live.wav");
        private readonly string _loopbackPath    = Path.Combine(_workDir, "loopback_live.wav");
        private readonly string _grokPayloadPath = Path.Combine(_baseDir, "grok_payload_latest.json");
        private readonly string _grokVerdictPath = Path.Combine(_baseDir, "grok_verdict_latest.json");

        private static readonly string _settingsDir = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "ScamDetector");
        private readonly string _assemblyKeyPath = Path.Combine(_settingsDir, "key_assembly.txt");
        private readonly string _grokKeyPath     = Path.Combine(_settingsDir, "key_grok.txt");
        private bool _loadingKeys;

        // ── Session data ──────────────────────────────────────────────────────
        private readonly List<object>           _sessionChunks     = new();
        private readonly List<ConversationLine> _conversation      = new();
        private readonly List<string>           _transcriptionGaps = new();

        // AI voice: keep a running average across chunks so the result stabilises over time
        private double _aiProbSum;
        private int    _aiProbCount;
        private readonly List<object> _aiChunkResults = new();

        private static readonly JsonSerializerOptions _jsonOptions = new()
        {
            WriteIndented          = true,
            Encoder                = JavaScriptEncoder.UnsafeRelaxedJsonEscaping,
            DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull
        };

        public MainWindow()
        {
            InitializeComponent();
            LoadSavedKeys();
            StartCallWatcher();
        }

        // ── KEY SAVE/LOAD ─────────────────────────────────────────────────────
        private void LoadSavedKeys()
        {
            _loadingKeys = true;
            try
            {
                bool a = LoadKey(TxtAssemblyKey, ChkSaveAssembly, _assemblyKeyPath);
                bool g = LoadKey(TxtGrokKey,     ChkSaveGrok,     _grokKeyPath);
                if (a || g)
                    TxtStatus.Text = $"Status: Loaded saved key(s) ✓{(a ? " AssemblyAI" : "")}{(g ? " Grok" : "")}";
            }
            catch (Exception ex) { TxtStatus.Text = $"Status: Could not load saved keys ({ex.Message})"; }
            finally { _loadingKeys = false; }
        }

        private static bool LoadKey(PasswordBox box, CheckBox check, string path)
        {
            if (!File.Exists(path)) return false;
            string saved = File.ReadAllText(path).Trim();
            if (saved.Length == 0) return false;
            box.Password    = saved;
            check.IsChecked = true;
            return true;
        }

        private void AssemblyKey_Changed(object sender, RoutedEventArgs e)
        {
            if (_loadingKeys) return;
            SaveKeyIfWanted(ChkSaveAssembly, TxtAssemblyKey, _assemblyKeyPath, "AssemblyAI", true);
        }

        private void GrokKey_Changed(object sender, RoutedEventArgs e)
        {
            if (_loadingKeys) return;
            SaveKeyIfWanted(ChkSaveGrok, TxtGrokKey, _grokKeyPath, "Grok", true);
        }

        private void SaveAllKeys()
        {
            SaveKeyIfWanted(ChkSaveAssembly, TxtAssemblyKey, _assemblyKeyPath, "AssemblyAI", false);
            SaveKeyIfWanted(ChkSaveGrok,     TxtGrokKey,     _grokKeyPath,     "Grok",       false);
        }

        private void SaveKeyIfWanted(CheckBox? check, PasswordBox? box, string path, string name, bool showStatus)
        {
            if (check == null || box == null) return;
            try
            {
                string key = box.Password.Trim();
                if (check.IsChecked == true && key.Length > 0)
                {
                    Directory.CreateDirectory(_settingsDir);
                    File.WriteAllText(path, key);
                    if (showStatus && TxtStatus != null) TxtStatus.Text = $"Status: {name} key saved ✓";
                }
                else if (check.IsChecked != true)
                {
                    if (File.Exists(path)) File.Delete(path);
                    if (showStatus && TxtStatus != null) TxtStatus.Text = $"Status: {name} key will not be saved";
                }
            }
            catch (Exception ex)
            {
                if (TxtStatus != null) TxtStatus.Text = $"Status: Could not save {name} key ({ex.Message})";
            }
        }

        protected override void OnClosing(System.ComponentModel.CancelEventArgs e)
        {
            SaveAllKeys();
            _callWatcher?.Dispose();
            _monitor?.Close();
            base.OnClosing(e);
        }

        // ── START RECORDING ───────────────────────────────────────────────────
        private void BtnRecord_Click(object sender, RoutedEventArgs e)
        {
            if (string.IsNullOrWhiteSpace(TxtAssemblyKey.Password))
            {
                MessageBox.Show("Please enter your AssemblyAI key before recording.");
                return;
            }

            try
            {
                SaveAllKeys();
                _assemblyKey = TxtAssemblyKey.Password.Trim();
                _grokKey     = TxtGrokKey.Password.Trim();
                Directory.CreateDirectory(_workDir);

                _chunkNumber    = 0;
                _highAlertShown = false;
                _aiProbSum      = 0;
                _aiProbCount    = 0;
                lock (_aiChunkResults) _aiChunkResults.Clear();
                _autoStarted    = false;
                _discardSession = false;
                _callInfo       = null;

                lock (_sessionChunks) _sessionChunks.Clear();
                lock (_conversation) { _conversation.Clear(); _transcriptionGaps.Clear(); }
                lock (_verdictHistory)
                {
                    _verdictHistory.Clear();
                    _latestVerdict      = null;
                    _grokRequestCounter = 0;
                    _latestAppliedGrok  = 0;
                }
                lock (_pendingGrok) _pendingGrok.Clear();

                TxtOutput.AppendText("\n==================================================\n");

                string listeningMessage = _grokKey.Length > 0
                    ? "Scam risk: listening..."
                    : "Scam risk: Grok key not entered — transcription only";
                ResetVerdictPanel(listeningMessage);

                _micStoppedTcs      = new TaskCompletionSource<bool>();
                _loopbackStoppedTcs = new TaskCompletionSource<bool>();

                _micIn      = new WaveInEvent { WaveFormat = new WaveFormat(TargetSampleRate, 16, 1) };
                _loopbackIn = new WasapiLoopbackCapture();
                _micFormat      = _micIn.WaveFormat;
                _loopbackFormat = _loopbackIn.WaveFormat;

                lock (_writerLock)
                {
                    _micWriter      = new WaveFileWriter(_micPath, _micFormat);
                    _loopbackWriter = new WaveFileWriter(_loopbackPath, _loopbackFormat);
                }

                _micIn.DataAvailable += (s, a) =>
                {
                    lock (_writerLock) _micWriter?.Write(a.Buffer, 0, a.BytesRecorded);
                };
                _loopbackIn.DataAvailable += (s, a) =>
                {
                    lock (_writerLock) _loopbackWriter?.Write(a.Buffer, 0, a.BytesRecorded);
                };

                _micIn.RecordingStopped += (s, a) =>
                {
                    lock (_writerLock) { _micWriter?.Dispose(); _micWriter = null; }
                    _micIn?.Dispose(); _micIn = null;
                    _micStoppedTcs?.TrySetResult(true);
                };
                _loopbackIn.RecordingStopped += (s, a) =>
                {
                    lock (_writerLock) { _loopbackWriter?.Dispose(); _loopbackWriter = null; }
                    _loopbackIn?.Dispose(); _loopbackIn = null;
                    _loopbackStoppedTcs?.TrySetResult(true);
                };

                _silencePlayer = new WasapiOut();
                _silencePlayer.Init(new SilenceProvider(_loopbackFormat));
                _silencePlayer.Play();

                _micIn.StartRecording();
                _loopbackIn.StartRecording();
                _isRecording  = true;
                _chunkStart   = DateTime.Now;
                _sessionStart = _chunkStart;

                _chunkTimer = new System.Threading.Timer(
                    _ => _ = SafeProcessChunkAsync(), null,
                    TimeSpan.FromSeconds(ChunkSeconds),
                    TimeSpan.FromSeconds(ChunkSeconds));

                BtnRecord.IsEnabled = false;
                BtnStop.IsEnabled   = true;
                TxtStatus.Text      = "Status: 🔴 Recording...";
                TxtChunkStatus.Text = $"Next analysis in {ChunkSeconds} seconds...";

                Log("=== SESSION STARTED ===");
                Log($"Time: {DateTime.Now:yyyy-MM-dd HH:mm:ss}");
                Log($"Waiting for first {ChunkSeconds}-second chunk...\n");

                OpenCallMonitor(listeningMessage);
            }
            catch (Exception ex)
            {
                _isRecording = false;
                MessageBox.Show($"Recording error:\n{ex.Message}");
            }
        }

        // ── STOP RECORDING ────────────────────────────────────────────────────
        private async void BtnStop_Click(object sender, RoutedEventArgs e)
        {
            await StopRecordingAsync(discard: false);
        }

        private async Task StopRecordingAsync(bool discard)
        {
            if (!_isRecording) return;

            BtnStop.IsEnabled = false;
            TxtStatus.Text    = "Status: Stopping...";

            _autoStarted    = false;
            _isRecording    = false;
            _discardSession = discard;
            _chunkTimer?.Dispose();
            _chunkTimer = null;

            if (!discard)
                _monitor?.MarkRecordingStopped("Recording stopped. Finishing the analysis...");

            _micIn?.StopRecording();
            _loopbackIn?.StopRecording();

            var waits = new List<Task>();
            if (_micStoppedTcs      != null) waits.Add(_micStoppedTcs.Task);
            if (_loopbackStoppedTcs != null) waits.Add(_loopbackStoppedTcs.Task);
            await Task.WhenAll(waits);

            _silencePlayer?.Stop();
            _silencePlayer?.Dispose();
            _silencePlayer = null;

            if (discard)
            {
                await _chunkLock.WaitAsync();
                _chunkLock.Release();

                TryDelete(_micPath);
                TryDelete(_loopbackPath);
                TryDelete(_grokPayloadPath);
                TryDelete(_grokVerdictPath);
                lock (_sessionChunks) _sessionChunks.Clear();
                lock (_conversation) { _conversation.Clear(); _transcriptionGaps.Clear(); }
                lock (_verdictHistory) { _verdictHistory.Clear(); _latestVerdict = null; }
                _callInfo = null;

                TxtOutput.AppendText("\n=== Recording stopped: you recognized the caller. Nothing from this call was saved. ===\n");
                ResetVerdictPanel("Scam risk: not running");
                BtnRecord.IsEnabled = true;
                TxtStatus.Text      = "Status: Stopped (caller recognized).";
                TxtChunkStatus.Text = "Ready";
                return;
            }

            TxtStatus.Text = "Status: Processing final chunk...";
            await ProcessChunkAsync(isFinal: true, waitForLock: true);

            Task[] pending;
            lock (_pendingGrok) pending = _pendingGrok.ToArray();
            if (pending.Length > 0)
            {
                TxtStatus.Text = "Status: Waiting for Grok's final verdict...";
                await Task.WhenAll(pending);
            }

            OutputSessionJson();

            _monitor?.SetRecordingState("Recording stopped. Final result below.");

            BtnRecord.IsEnabled = true;
            TxtStatus.Text      = "Status: ✅ Done. Full session JSON printed below.";
            TxtChunkStatus.Text = "Session complete.";
        }

        // ── PROCESS ONE CHUNK ─────────────────────────────────────────────────
        private async Task SafeProcessChunkAsync()
        {
            try { await ProcessChunkAsync(isFinal: false, waitForLock: false); }
            catch (Exception ex) { Log($"[Error] {ex.Message}"); }
        }

        private async Task ProcessChunkAsync(bool isFinal, bool waitForLock)
        {
            if (waitForLock) await _chunkLock.WaitAsync();
            else if (!await _chunkLock.WaitAsync(0))
            {
                Log("(Previous chunk still processing — this audio rolls into the next chunk)");
                return;
            }

            int    thisChunk  = ++_chunkNumber;
            string micSnap    = Path.Combine(_workDir, $"chunk{thisChunk}_mic.wav");
            string loopSnap   = Path.Combine(_workDir, $"chunk{thisChunk}_loopback.wav");
            string stereoSnap = Path.Combine(_workDir, $"chunk{thisChunk}_stereo.wav");

            DateTime start = _chunkStart;
            DateTime end   = DateTime.Now;
            _chunkStart    = end;

            string chunkCallTime = $"{FormatCallTime(start - _sessionStart)} - {FormatCallTime(end - _sessionStart)}";

            try
            {
                SetStatus($"Status: Analyzing chunk {thisChunk}...",
                          $"Transcribing chunk {thisChunk} (call time {chunkCallTime})...");
                Log($"\n--- CHUNK {thisChunk} | call time {chunkCallTime} ({start:HH:mm:ss} → {end:HH:mm:ss}) ---");

                SnapshotAndRestartWriters(micSnap, loopSnap);

                // Save a copy of the loopback (caller-only audio) for AI voice analysis
                string aiSnap = Path.Combine(_workDir, $"chunk{thisChunk}_ai.wav");
                if (File.Exists(loopSnap)) File.Copy(loopSnap, aiSnap, true);

                TimeSpan duration = BuildStereoChunk(micSnap, loopSnap, stereoSnap);
                if (duration < TimeSpan.FromSeconds(1))
                {
                    Log("(Less than 1 second of audio — skipped)");
                    _chunkNumber--;
                    return;
                }

                TimeSpan callOffset = start - _sessionStart;

                // Run transcription and AI voice detection in parallel
                var transcribeTask = TranscribeWithAssemblyAI(stereoSnap, callOffset);
                // deleteAfter: false temporarily so you can inspect the WAV
                var aiVoiceTask    = File.Exists(aiSnap)
                    ? AiVoiceDetector.AnalyzeAsync(aiSnap, deleteAfter: false)
                    : Task.FromResult(new AiVoiceDetector.DetectorResult(0, 0, "UNKNOWN", "Unknown", "No caller audio captured."));

                await Task.WhenAll(transcribeTask, aiVoiceTask);

                var result        = transcribeTask.Result;
                var aiVoiceResult = aiVoiceTask.Result;

                if (_discardSession) return;

                // Update the rolling average and show it in the popup
                if (aiVoiceResult.Error == null)
                {
                    _aiProbSum   += aiVoiceResult.AiProbability;
                    _aiProbCount++;
                    double avgProb  = _aiProbSum / _aiProbCount;
                    string avgLabel = avgProb >= 0.7 ? "High" : avgProb >= 0.4 ? "Medium" : "Low";
                    var avgResult   = aiVoiceResult with { AiProbability = Math.Round(avgProb, 4), RiskLabel = avgLabel };
                    string aiJson = System.Text.Json.JsonSerializer.Serialize(new
                    {
                        prediction       = aiVoiceResult.Prediction,
                        ai_probability   = aiVoiceResult.AiProbability,
                        real_probability = aiVoiceResult.RealProbability,
                        threshold        = 0.5,
                        model            = "AASIST"
                    }, _jsonOptions);
                    Log($"[AI voice] chunk {thisChunk} raw result:\n{aiJson}");
                    Log($"[AI voice] running avg: AI={avgProb * 100:F1}% ({avgLabel})");
                    _monitor?.Dispatcher.Invoke(() => _monitor?.ShowAiVoiceResult(avgResult));
                    lock (_aiChunkResults) _aiChunkResults.Add(new { chunk = thisChunk, ai_probability = aiVoiceResult.AiProbability, risk_label = aiVoiceResult.RiskLabel, running_avg = Math.Round(avgProb, 4) });
                }
                else
                {
                    Log($"[AI voice] chunk {thisChunk} error: {aiVoiceResult.Error}");
                    _monitor?.Dispatcher.Invoke(() => _monitor?.ShowAiVoiceError(aiVoiceResult.Error!));
                }

                var chunk = new
                {
                    chunk            = thisChunk,
                    call_time        = chunkCallTime,
                    timestamp_start  = start.ToString("HH:mm:ss"),
                    timestamp_end    = end.ToString("HH:mm:ss"),
                    duration_seconds = Math.Round(duration.TotalSeconds, 1),
                    is_final_chunk   = isFinal,
                    transcription    = result.Transcript,
                    speaker_segments = result.Speakers,
                    error            = result.Error
                };
                lock (_sessionChunks) _sessionChunks.Add(chunk);

                bool hasConversation;
                lock (_conversation)
                {
                    if (result.Error != null) _transcriptionGaps.Add(chunkCallTime);
                    _conversation.AddRange(result.Lines);
                    hasConversation = _conversation.Count > 0;
                }

                Log("[Chunk debug]");
                Log(JsonSerializer.Serialize(chunk, _jsonOptions));

                string callTimeSoFar = FormatCallTime(end - _sessionStart);
                string payloadJson   = JsonSerializer.Serialize(BuildGrokPayload(callTimeSoFar, thisChunk), _jsonOptions);
                File.WriteAllText(_grokPayloadPath, payloadJson);

                Log($"\n[Grok payload — saved to {Path.GetFileName(_grokPayloadPath)}]");
                Log(payloadJson);

                if (_grokKey.Length > 0 && hasConversation && result.Lines.Count > 0)
                {
                    int requestId = Interlocked.Increment(ref _grokRequestCounter);
                    Task grokTask = AnalyzeWithGrokAsync(payloadJson, requestId, thisChunk, callTimeSoFar);
                    lock (_pendingGrok) _pendingGrok.Add(grokTask);
                }

                if (_isRecording)
                    SetStatus("Status: 🔴 Recording...",
                              $"Chunk {thisChunk} transcribed. Next in {ChunkSeconds}s...");
            }
            catch (Exception ex) { Log($"[Chunk {thisChunk} error] {ex.Message}"); }
            finally
            {
                TryDelete(micSnap);
                TryDelete(loopSnap);
                TryDelete(stereoSnap);
                _chunkLock.Release();
            }
        }

        // ── WRITERS ───────────────────────────────────────────────────────────
        private void SnapshotAndRestartWriters(string micSnap, string loopSnap)
        {
            lock (_writerLock)
            {
                _micWriter?.Dispose(); _micWriter = null;
                _loopbackWriter?.Dispose(); _loopbackWriter = null;

                if (File.Exists(_micPath))      File.Move(_micPath,      micSnap,  true);
                if (File.Exists(_loopbackPath)) File.Move(_loopbackPath, loopSnap, true);

                if (_isRecording && _micFormat != null && _loopbackFormat != null)
                {
                    _micWriter      = new WaveFileWriter(_micPath,      _micFormat);
                    _loopbackWriter = new WaveFileWriter(_loopbackPath, _loopbackFormat);
                }
            }
        }

        // ── AUDIO MIXING ──────────────────────────────────────────────────────
        private static TimeSpan BuildStereoChunk(string micPath, string loopbackPath, string outputPath)
        {
            var readers = new List<AudioFileReader>();
            try
            {
                ISampleProvider? user   = OpenAsMono16k(micPath, readers);
                ISampleProvider? caller = OpenAsMono16k(loopbackPath, readers);

                if (readers.Count == 0) return TimeSpan.Zero;

                TimeSpan duration = readers.Max(r => r.TotalTime);
                user   ??= Silence(duration);
                caller ??= Silence(duration);

                var stereo = new MultiplexingSampleProvider(new[] { user, caller }, 2);
                WaveFileWriter.CreateWaveFile16(outputPath, stereo);
                return duration;
            }
            finally { foreach (var r in readers) r.Dispose(); }
        }

        private static ISampleProvider? OpenAsMono16k(string path, List<AudioFileReader> readers)
        {
            if (!File.Exists(path)) return null;
            AudioFileReader reader;
            try { reader = new AudioFileReader(path); } catch { return null; }
            if (reader.TotalTime < TimeSpan.FromMilliseconds(100)) { reader.Dispose(); return null; }
            readers.Add(reader);

            ISampleProvider source = reader;
            if (source.WaveFormat.Channels == 2)
                source = new StereoToMonoSampleProvider(source);
            else if (source.WaveFormat.Channels > 2)
                source = new MultiplexingSampleProvider(new[] { source }, 1);
            if (source.WaveFormat.SampleRate != TargetSampleRate)
                source = new WdlResamplingSampleProvider(source, TargetSampleRate);
            return source;
        }

        private static ISampleProvider Silence(TimeSpan duration) =>
            new SilenceProvider(WaveFormat.CreateIeeeFloatWaveFormat(TargetSampleRate, 1))
                .ToSampleProvider().Take(duration);

        // ── ASSEMBLYAI ────────────────────────────────────────────────────────
        private record AssemblyResult(
            string Transcript, List<object> Speakers, List<ConversationLine> Lines, string? Error)
        {
            public static AssemblyResult Fail(string error) => new("", new(), new(), error);
        }

        private record ConversationLine(
            [property: JsonPropertyName("time")]       string  Time,
            [property: JsonPropertyName("speaker")]    string  Speaker,
            [property: JsonPropertyName("text")]       string  Text,
            [property: JsonPropertyName("confidence")] double? Confidence);

        private static string SpeakerFor(JsonElement el)
        {
            string? id = null;
            if (el.TryGetProperty("channel", out var ch) && ch.ValueKind != JsonValueKind.Null)
                id = ch.ValueKind == JsonValueKind.String ? ch.GetString() : ch.ToString();
            if (string.IsNullOrEmpty(id) &&
                el.TryGetProperty("speaker", out var sp) && sp.ValueKind != JsonValueKind.Null)
                id = sp.ValueKind == JsonValueKind.String ? sp.GetString() : sp.ToString();
            return id switch { "1" => "user", "2" => "caller", _ => "unknown" };
        }

        private async Task<AssemblyResult> TranscribeWithAssemblyAI(string filePath, TimeSpan callOffset)
        {
            try
            {
                using var uploadReq = new HttpRequestMessage(HttpMethod.Post, "https://api.assemblyai.com/v2/upload");
                uploadReq.Headers.Add("Authorization", _assemblyKey);
                uploadReq.Content = new ByteArrayContent(await File.ReadAllBytesAsync(filePath));
                uploadReq.Content.Headers.ContentType = new MediaTypeHeaderValue("application/octet-stream");

                using var uploadResp = await _http.SendAsync(uploadReq);
                string uploadBody = await uploadResp.Content.ReadAsStringAsync();
                if (!uploadResp.IsSuccessStatusCode)
                    return AssemblyResult.Fail($"Upload failed ({(int)uploadResp.StatusCode}): {Short(uploadBody)}");

                string uploadUrl;
                using (var doc = JsonDocument.Parse(uploadBody))
                    uploadUrl = doc.RootElement.GetProperty("upload_url").GetString()!;

                using var submitReq = new HttpRequestMessage(HttpMethod.Post, "https://api.assemblyai.com/v2/transcript");
                submitReq.Headers.Add("Authorization", _assemblyKey);
                submitReq.Content = new StringContent(JsonSerializer.Serialize(new
                {
                    audio_url    = uploadUrl,
                    multichannel = true
                }), Encoding.UTF8, "application/json");

                using var submitResp = await _http.SendAsync(submitReq);
                string submitBody = await submitResp.Content.ReadAsStringAsync();
                if (!submitResp.IsSuccessStatusCode)
                    return AssemblyResult.Fail($"Submit failed ({(int)submitResp.StatusCode}): {Short(submitBody)}");

                string id;
                using (var doc = JsonDocument.Parse(submitBody))
                    id = doc.RootElement.GetProperty("id").GetString()!;

                string pollUrl = $"https://api.assemblyai.com/v2/transcript/{id}";
                string finalBody = "";
                bool completed = false;

                for (int i = 0; i < 60 && !completed; i++)
                {
                    await Task.Delay(1500);
                    using var pollReq = new HttpRequestMessage(HttpMethod.Get, pollUrl);
                    pollReq.Headers.Add("Authorization", _assemblyKey);
                    using var pollResp = await _http.SendAsync(pollReq);
                    finalBody = await pollResp.Content.ReadAsStringAsync();

                    using var pollDoc = JsonDocument.Parse(finalBody);
                    string status = pollDoc.RootElement.GetProperty("status").GetString()!;
                    if (status == "completed") completed = true;
                    else if (status == "error")
                    {
                        string msg = pollDoc.RootElement.TryGetProperty("error", out var err)
                            ? err.GetString() ?? "unknown" : "unknown";
                        return AssemblyResult.Fail($"AssemblyAI error: {msg}");
                    }
                }

                if (!completed) return AssemblyResult.Fail("AssemblyAI timed out.");

                using var finalDoc = JsonDocument.Parse(finalBody);
                var root = finalDoc.RootElement;

                var speakers     = new List<object>();
                var lines        = new List<string>();
                var conversation = new List<ConversationLine>();

                if (root.TryGetProperty("utterances", out var utterances) &&
                    utterances.ValueKind == JsonValueKind.Array)
                {
                    foreach (var u in utterances.EnumerateArray().OrderBy(u => u.GetProperty("start").GetInt64()))
                    {
                        string who     = SpeakerFor(u);
                        string text    = u.GetProperty("text").GetString() ?? "";
                        long   startMs = u.GetProperty("start").GetInt64();
                        long   endMs   = u.GetProperty("end").GetInt64();

                        string callStart = FormatCallTime(callOffset + TimeSpan.FromMilliseconds(startMs));
                        string callEnd   = FormatCallTime(callOffset + TimeSpan.FromMilliseconds(endMs));

                        double? confidence = u.TryGetProperty("confidence", out var c)
                            ? Math.Round(c.GetDouble(), 3) : null;

                        speakers.Add(new { speaker = who, text, call_time = $"{callStart} - {callEnd}", start_ms = startMs, end_ms = endMs, confidence });
                        conversation.Add(new ConversationLine(callStart, who, text, confidence));
                        string label = who == "caller" ? "Caller" : who == "user" ? "User" : "Unknown";
                        lines.Add($"[{callStart}] {label}: {text}");
                    }
                }

                string transcript = lines.Count > 0 ? string.Join("\n", lines)
                    : (root.TryGetProperty("text", out var t) && t.ValueKind == JsonValueKind.String
                        ? t.GetString() ?? "" : "");

                return new AssemblyResult(transcript, speakers, conversation, null);
            }
            catch (Exception ex) { return AssemblyResult.Fail($"AssemblyAI exception: {ex.Message}"); }
        }

        // ── GROK PAYLOAD ──────────────────────────────────────────────────────
        private object BuildGrokPayload(string callTimeSoFar, int chunksAnalyzed)
        {
            lock (_conversation)
            {
                return new
                {
                    call_time_so_far = $"0:00 - {callTimeSoFar}",
                    chunks_analyzed  = chunksAnalyzed,
                    speakers = new { user = "Person using the app", caller = "Person on the other end of the call" },
                    transcription_gaps = _transcriptionGaps.Count > 0 ? new List<string>(_transcriptionGaps) : null,
                    call_info          = _callInfo,
                    ai_voice           = _aiProbCount > 0 ? new { running_avg_ai_probability = Math.Round(_aiProbSum / _aiProbCount, 4), chunks_analyzed = _aiProbCount, note = "AASIST model; treat as supporting signal only — not definitive proof of AI voice" } : null,
                    conversation       = new List<ConversationLine>(_conversation)
                };
            }
        }

        // ── GROK ──────────────────────────────────────────────────────────────
        private async Task AnalyzeWithGrokAsync(string payloadJson, int requestId, int afterChunk, string callTime)
        {
            try
            {
                SetChunkStatus($"Asking Grok about the call so far (0:00 - {callTime})...");

                var (verdict, error) = await AskGrokAsync(payloadJson);
                if (_discardSession) return;

                bool isNewest;
                lock (_verdictHistory)
                {
                    _verdictHistory.Add(new { after_chunk = afterChunk, call_time = $"0:00 - {callTime}", verdict, error });
                    isNewest = requestId > _latestAppliedGrok;
                    if (isNewest && verdict != null) { _latestAppliedGrok = requestId; _latestVerdict = verdict; }
                }

                if (error != null || verdict == null)
                {
                    Log($"\n[Grok error after chunk {afterChunk}] {error}");
                    if (isNewest) ShowGrokError(error ?? "Unknown error");
                    return;
                }

                if (!isNewest) return;

                string verdictJson = JsonSerializer.Serialize(verdict, _jsonOptions);
                File.WriteAllText(_grokVerdictPath, verdictJson);
                Log($"\n[Grok verdict after chunk {afterChunk} | call time 0:00 - {callTime}]");
                Log(verdictJson);

                ShowVerdict(verdict, callTime);

                Log($"[Grok result] risk_level={verdict.RiskLevel} scam_likelihood={verdict.ScamLikelihood} enough_info={verdict.EnoughInformation}");

                // No extra window: the monitor pop-up already shows the verdict.
                // Just play a sound the first time the call turns high-risk.
                if (verdict.RiskLevel == "high" && !_highAlertShown)
                {
                    _highAlertShown = true;
                    Dispatcher.Invoke(() => System.Media.SystemSounds.Exclamation.Play());
                }



                if (_isRecording) SetChunkStatus($"Grok checked 0:00 - {callTime}. Listening...");
            }
            catch (Exception ex) { Log($"\n[Grok error] {ex.Message}"); }
        }

        private async Task<(ScamVerdict? verdict, string? error)> AskGrokAsync(string payloadJson)
        {
            try
            {
                var body = new
                {
                    model    = GrokPrompt.Model,
                    messages = new object[]
                    {
                        new { role = "system", content = GrokPrompt.SystemPrompt },
                        new { role = "user",   content = GrokPrompt.BuildUserMessage(payloadJson) }
                    },
                    response_format = new
                    {
                        type        = "json_schema",
                        json_schema = new { name = "scam_assessment", strict = true, schema = GrokPrompt.Schema }
                    }
                };

                using var req = new HttpRequestMessage(HttpMethod.Post, GrokPrompt.Endpoint);
                req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", _grokKey);
                req.Content = new StringContent(JsonSerializer.Serialize(body), Encoding.UTF8, "application/json");

                using var resp = await _http.SendAsync(req);
                string respBody = await resp.Content.ReadAsStringAsync();
                if (!resp.IsSuccessStatusCode)
                    return (null, $"Grok request failed ({(int)resp.StatusCode}): {Short(respBody)}");

                string content;
                using (var doc = JsonDocument.Parse(respBody))
                    content = doc.RootElement.GetProperty("choices")[0].GetProperty("message").GetProperty("content").GetString() ?? "";

                var verdict = JsonSerializer.Deserialize<ScamVerdict>(StripCodeFences(content));
                if (verdict == null) return (null, "Grok returned an empty answer.");

                verdict.ScamLikelihood = Math.Clamp(verdict.ScamLikelihood, 0, 100);
                verdict.RiskLevel      = (verdict.RiskLevel ?? "low").Trim().ToLowerInvariant();
                return (verdict, null);
            }
            catch (Exception ex) { return (null, $"Grok exception: {ex.Message}"); }
        }

        private static string StripCodeFences(string s)
        {
            s = s.Trim();
            if (!s.StartsWith("```")) return s;
            int firstNewline = s.IndexOf('\n');
            int lastFence    = s.LastIndexOf("```", StringComparison.Ordinal);
            return firstNewline >= 0 && lastFence > firstNewline
                ? s.Substring(firstNewline + 1, lastFence - firstNewline - 1).Trim() : s;
        }

        // ── VERDICT DISPLAY ───────────────────────────────────────────────────
        private static readonly Color RiskHigh   = Color.FromRgb(220, 53, 69);
        private static readonly Color RiskMedium = Color.FromRgb(255, 193, 7);
        private static readonly Color RiskLow    = Color.FromRgb(40, 167, 69);
        private static readonly Color RiskNone   = Color.FromRgb(120, 120, 120);

        private void ResetVerdictPanel(string message)
        {
            RiskBorder.BorderBrush  = new SolidColorBrush(RiskNone);
            TxtRiskLevel.Text       = message;
            TxtRiskLevel.Foreground = new SolidColorBrush(Color.FromRgb(170, 170, 170));
            TxtRiskSummary.Text     = "";
            TxtRiskAction.Text      = "";
            ActionBox.Visibility    = Visibility.Collapsed;
            TxtRiskReasons.Text     = "";
            _monitor?.ShowListening(message);
        }

        private void ShowVerdict(ScamVerdict v, string callTime)
        {
            Dispatcher.Invoke(() =>
            {
                (string label, Color color) = v.RiskLevel switch
                {
                    "high"   => ("HIGH RISK — likely scam", RiskHigh),
                    "medium" => ("MEDIUM RISK — be cautious", RiskMedium),
                    _        => (v.EnoughInformation ? "LOW RISK" : "LOW RISK — still listening", RiskLow)
                };

                string levelText = $"{label}  ({v.ScamLikelihood}/100)";
                string summary   = $"As of {callTime}: {v.Summary}";
                string reasons   = FormatReasons(v);
                string action    = (v.RecommendedAction ?? "").Trim();

                RiskBorder.BorderBrush  = new SolidColorBrush(color);
                TxtRiskLevel.Text       = levelText;
                TxtRiskLevel.Foreground = new SolidColorBrush(color);
                TxtRiskSummary.Text     = summary;
                TxtRiskReasons.Text     = reasons;
                TxtRiskAction.Text      = action;
                ActionBox.BorderBrush   = new SolidColorBrush(color);
                ActionBox.Visibility    = action.Length > 0 ? Visibility.Visible : Visibility.Collapsed;

                _monitor?.ShowVerdict(levelText, color, summary, reasons, action);
            });
        }

        private void ShowGrokError(string error)
        {
            Dispatcher.Invoke(() =>
            {
                string note = $"⚠ Latest Grok check failed: {Short(error)}";
                TxtRiskSummary.Text = string.IsNullOrEmpty(TxtRiskSummary.Text) ? note : TxtRiskSummary.Text + "\n" + note;
                _monitor?.AppendNote(note);
            });
        }

        private static string FormatReasons(ScamVerdict v)
        {
            var sb = new StringBuilder();
            foreach (var r in v.Reasons)
            {
                sb.AppendLine($"• {PrettyCategory(r.Category)}: {r.Explanation}");
                foreach (var ev in r.Evidence)
                    sb.AppendLine($"    [{ev.Time}] \"{ev.Quote}\"");
            }
            return sb.ToString().TrimEnd();
        }

        private static string PrettyCategory(string category)
        {
            string s = (category ?? "other").Replace('_', ' ');
            return s.Length > 0 ? char.ToUpper(s[0]) + s[1..] : s;
        }

        // ── CALL MONITOR POPUP ────────────────────────────────────────────────
        private void OpenCallMonitor(string listeningMessage)
        {
            _monitor?.Close();
            var monitor = new CallMonitorWindow(_sessionStart, listeningMessage);
            monitor.SetCaller("Recording started manually");
            monitor.RecognizedCaller += OnCallerRecognized;
            monitor.Closed += (_, _) => { if (_monitor == monitor) _monitor = null; };
            _monitor = monitor;
            monitor.Show();
        }

        private async void OnCallerRecognized()
        {
            Log("[Call monitor] You clicked \"I recognize this number\". Stopping and discarding this recording...");
            await StopRecordingAsync(discard: true);
        }

        // ── WHATSAPP CALL DETECTION ───────────────────────────────────────────
        private void StartCallWatcher()
        {
            _callWatcher = new CallWatcher();
            _callWatcher.StatusMessage += msg => Log($"[Call watcher] {msg}");
            _callWatcher.CallStarted   += OnWhatsAppCallStarted;
            _callWatcher.CallEnded     += OnWhatsAppCallEnded;
            try { _callWatcher.Start(); }
            catch (Exception ex) { Log($"[Call watcher] Could not start: {ex.Message}"); }
        }

        private void OnWhatsAppCallStarted(CallerInfo info)
        {
            Dispatcher.Invoke(() =>
            {
                if (ChkAutoRecord.IsChecked != true) { Log("[Call watcher] Auto-record is off."); return; }
                if (_isRecording) { Log("[Call watcher] Already recording."); return; }
                if (info.IsContact == true) { Log($"[Call watcher] Saved contact ({info.Display}), not recording."); return; }
                if (info.IsContact == null) { Log("[Call watcher] Couldn't identify caller, not auto-recording."); return; }
                if (string.IsNullOrWhiteSpace(TxtAssemblyKey.Password))
                {
                    Log("[Call watcher] Unknown caller, but can't record: no AssemblyAI key entered.");
                    TxtStatus.Text = "Status: ⚠ Unknown caller — no AssemblyAI key, not recording.";
                    return;
                }

                BtnRecord_Click(BtnRecord, new RoutedEventArgs());
                if (!_isRecording) return;

                _autoStarted = true;
                _callInfo = new { caller_display = info.Display, in_contacts = false, recording_started = "automatically (caller not in contacts)" };
                _monitor?.SetCaller($"Unknown number: {info.Display}");
                Log($"[Call watcher] Unknown caller ({info.Display}). Recording started automatically.");
            });
        }

        private void OnWhatsAppCallEnded()
        {
            Dispatcher.Invoke(() =>
            {
                if (!_autoStarted || !_isRecording) return;
                Log("[Call watcher] Call ended — stopping recording.");
                _ = StopRecordingAsync(discard: false);
            });
        }

        // ── SESSION JSON ──────────────────────────────────────────────────────
        private void OutputSessionJson()
        {
            List<object> chunks;
            lock (_sessionChunks) chunks = new List<object>(_sessionChunks);

            List<object> verdicts; ScamVerdict? finalVerdict;
            lock (_verdictHistory) { verdicts = new List<object>(_verdictHistory); finalVerdict = _latestVerdict; }

            string callLength = FormatCallTime(DateTime.Now - _sessionStart);

            var session = new
            {
                session_id   = Guid.NewGuid().ToString(),
                recorded_at  = DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss"),
                total_chunks = chunks.Count,
                speakers     = new { user = "Person using the app (microphone)", caller = "Person on the other end of the call (system audio)" },
                pipeline     = new { transcription = "AssemblyAI (multichannel)", scam_analysis = $"xAI {GrokPrompt.Model}", voice_analysis = "AASIST (local)" },
                call_info      = _callInfo,
                final_verdict  = finalVerdict,
                verdict_history  = verdicts,
                ai_voice_summary = _aiProbCount > 0 ? new { running_avg_ai_probability = Math.Round(_aiProbSum / _aiProbCount, 4), chunks_analyzed = _aiProbCount } : null,
                ai_voice_chunks  = new List<object>(_aiChunkResults),
                grok_payload     = BuildGrokPayload(callLength, chunks.Count),
                chunks
            };

            string json    = JsonSerializer.Serialize(session, _jsonOptions);
            string outPath = Path.Combine(_baseDir, $"session_{DateTime.Now:yyyyMMdd_HHmmss}.json");
            File.WriteAllText(outPath, json);

            Log("\n=== FULL SESSION JSON (saved to file) ===");
            Log($"Saved to: {outPath}");
            Log(json);
        }

        // ── HELPERS ───────────────────────────────────────────────────────────
        private void Log(string text)
        {
            Dispatcher.Invoke(() =>
            {
                TxtOutput.AppendText(text + "\n");
                OutputScroll.ScrollToBottom();
            });
        }

        private void SetStatus(string status, string chunkStatus)
        {
            Dispatcher.Invoke(() => { TxtStatus.Text = status; TxtChunkStatus.Text = chunkStatus; });
        }

        private void SetChunkStatus(string chunkStatus)
        {
            Dispatcher.Invoke(() => TxtChunkStatus.Text = chunkStatus);
        }

        private static string FormatCallTime(TimeSpan t)
        {
            if (t < TimeSpan.Zero) t = TimeSpan.Zero;
            return t.TotalHours >= 1
                ? $"{(int)t.TotalHours}:{t.Minutes:00}:{t.Seconds:00}"
                : $"{(int)t.TotalMinutes}:{t.Seconds:00}";
        }

        private static string Short(string s) => s.Length <= 200 ? s : s[..200] + "...";

        private static void TryDelete(string path)
        {
            try { if (File.Exists(path)) File.Delete(path); } catch { }
        }
    }
}
