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
        // Mic = the USER. System audio (loopback) = the CALLER.
        private WaveInEvent?           _micIn;
        private WasapiLoopbackCapture? _loopbackIn;
        private WasapiOut?             _silencePlayer;   // keeps loopback streaming during silence
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

        // Copied from the key boxes when recording starts, because WPF
        // controls can't be read from the background chunk timer thread.
        private string _assemblyKey = "";
        private string _grokKey     = "";

        // ── Grok state ────────────────────────────────────────────────────────
        private int           _grokRequestCounter;   // numbers each request
        private int           _latestAppliedGrok;    // newest request whose answer is on screen
        private ScamVerdict?  _latestVerdict;
        private bool          _highAlertShown;       // popup only once per call
        private readonly List<Task>   _pendingGrok    = new();
        private readonly List<object> _verdictHistory = new();

        // ── Paths ─────────────────────────────────────────────────────────────
        private static readonly string _baseDir = AppDomain.CurrentDomain.BaseDirectory;
        private static readonly string _workDir = Path.Combine(_baseDir, "audio");
        private readonly string _micPath        = Path.Combine(_workDir, "mic_live.wav");
        private readonly string _loopbackPath   = Path.Combine(_workDir, "loopback_live.wav");
        private readonly string _grokPayloadPath = Path.Combine(_baseDir, "grok_payload_latest.json");
        private readonly string _grokVerdictPath = Path.Combine(_baseDir, "grok_verdict_latest.json");

        // Keys are saved in %AppData%\ScamDetector so they survive rebuilds
        // and never end up inside your Git repo.
        private static readonly string _settingsDir = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "ScamDetector");
        private readonly string _assemblyKeyPath = Path.Combine(_settingsDir, "key_assembly.txt");
        private readonly string _grokKeyPath     = Path.Combine(_settingsDir, "key_grok.txt");
        private bool _loadingKeys;

        // ── Session data ──────────────────────────────────────────────────────
        private readonly List<object> _sessionChunks = new();
        private readonly List<ConversationLine> _conversation      = new();
        private readonly List<string>           _transcriptionGaps = new();

        // Readable JSON: keeps apostrophes and $ signs as-is, leaves out null fields
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
            catch (Exception ex)
            {
                TxtStatus.Text = $"Status: Could not load saved keys ({ex.Message})";
            }
            finally
            {
                _loadingKeys = false;
            }
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
                // Checked but empty: keep any saved key, so clearing the box to paste a new one doesn't wipe it
            }
            catch (Exception ex)
            {
                if (TxtStatus != null) TxtStatus.Text = $"Status: Could not save {name} key ({ex.Message})";
            }
        }

        protected override void OnClosing(System.ComponentModel.CancelEventArgs e)
        {
            SaveAllKeys();
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

                // Reset everything from any previous call
                _chunkNumber = 0;
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
                _highAlertShown = false;
                TxtOutput.Text  = string.Empty;
                ResetVerdictPanel(_grokKey.Length > 0
                    ? "Scam risk: listening... first check after 30 seconds"
                    : "Scam risk: Grok key not entered — transcription only");

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
                    _micIn?.Dispose();
                    _micIn = null;
                    _micStoppedTcs?.TrySetResult(true);
                };
                _loopbackIn.RecordingStopped += (s, a) =>
                {
                    lock (_writerLock) { _loopbackWriter?.Dispose(); _loopbackWriter = null; }
                    _loopbackIn?.Dispose();
                    _loopbackIn = null;
                    _loopbackStoppedTcs?.TrySetResult(true);
                };

                // Windows loopback only delivers data while something is playing.
                // Playing inaudible silence keeps it streaming so the caller's audio
                // stays in sync with the mic.
                _silencePlayer = new WasapiOut();
                _silencePlayer.Init(new SilenceProvider(_loopbackFormat));
                _silencePlayer.Play();

                _micIn.StartRecording();
                _loopbackIn.StartRecording();
                _isRecording  = true;
                _chunkStart   = DateTime.Now;
                _sessionStart = _chunkStart;

                _chunkTimer = new System.Threading.Timer(
                    _ => _ = SafeProcessChunkAsync(),
                    null,
                    TimeSpan.FromSeconds(ChunkSeconds),
                    TimeSpan.FromSeconds(ChunkSeconds));

                BtnRecord.IsEnabled = false;
                BtnStop.IsEnabled   = true;
                TxtStatus.Text      = "Status: 🔴 Recording...";
                TxtChunkStatus.Text = $"Next analysis in {ChunkSeconds} seconds...";

                Log("=== SESSION STARTED ===");
                Log($"Time: {DateTime.Now:yyyy-MM-dd HH:mm:ss}");
                Log($"Waiting for first {ChunkSeconds}-second chunk...\n");
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
            BtnStop.IsEnabled = false;
            TxtStatus.Text    = "Status: Stopping...";

            _isRecording = false;
            _chunkTimer?.Dispose();
            _chunkTimer = null;

            _micIn?.StopRecording();
            _loopbackIn?.StopRecording();

            var waits = new List<Task>();
            if (_micStoppedTcs      != null) waits.Add(_micStoppedTcs.Task);
            if (_loopbackStoppedTcs != null) waits.Add(_loopbackStoppedTcs.Task);
            await Task.WhenAll(waits);

            _silencePlayer?.Stop();
            _silencePlayer?.Dispose();
            _silencePlayer = null;

            TxtStatus.Text = "Status: Processing final chunk...";
            await ProcessChunkAsync(isFinal: true, waitForLock: true);

            // Wait for any Grok answers still on the way before writing the session file
            Task[] pending;
            lock (_pendingGrok) pending = _pendingGrok.ToArray();
            if (pending.Length > 0)
            {
                TxtStatus.Text = "Status: Waiting for Grok's final verdict...";
                await Task.WhenAll(pending);
            }

            OutputSessionJson();

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
            if (waitForLock)
            {
                await _chunkLock.WaitAsync();
            }
            else if (!await _chunkLock.WaitAsync(0))
            {
                // Previous chunk still being analyzed. Nothing is lost:
                // this audio stays in the live files and joins the next chunk.
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

                TimeSpan duration = BuildStereoChunk(micSnap, loopSnap, stereoSnap);
                if (duration < TimeSpan.FromSeconds(1))
                {
                    Log("(Less than 1 second of audio — skipped)");
                    _chunkNumber--;
                    return;
                }

                TimeSpan callOffset = start - _sessionStart;
                var result = await TranscribeWithAssemblyAI(stereoSnap, callOffset);

                // Per-chunk record, kept for debugging
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

                // Payload for Grok: the WHOLE conversation so far
                string callTimeSoFar = FormatCallTime(end - _sessionStart);
                string payloadJson   = JsonSerializer.Serialize(
                    BuildGrokPayload(callTimeSoFar, thisChunk), _jsonOptions);
                File.WriteAllText(_grokPayloadPath, payloadJson);

                Log($"\n[Grok payload — saved to {Path.GetFileName(_grokPayloadPath)}]");
                Log(payloadJson);

                // Ask Grok in the background so the next chunk isn't held up.
                // Skip if there's nothing to judge yet or nothing new was said.
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
            catch (Exception ex)
            {
                Log($"[Chunk {thisChunk} error] {ex.Message}");
            }
            finally
            {
                TryDelete(micSnap);
                TryDelete(loopSnap);
                TryDelete(stereoSnap);
                _chunkLock.Release();
            }
        }

        // ── SWAP LIVE FILES FOR FRESH ONES (recording never stops) ────────────
        private void SnapshotAndRestartWriters(string micSnap, string loopSnap)
        {
            lock (_writerLock)
            {
                _micWriter?.Dispose();
                _micWriter = null;
                _loopbackWriter?.Dispose();
                _loopbackWriter = null;

                if (File.Exists(_micPath))      File.Move(_micPath,      micSnap,  true);
                if (File.Exists(_loopbackPath)) File.Move(_loopbackPath, loopSnap, true);

                if (_isRecording && _micFormat != null && _loopbackFormat != null)
                {
                    _micWriter      = new WaveFileWriter(_micPath,      _micFormat);
                    _loopbackWriter = new WaveFileWriter(_loopbackPath, _loopbackFormat);
                }
            }
        }

        // ── STEREO FILE: LEFT = USER (mic), RIGHT = CALLER (system audio) ─────
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
            finally
            {
                foreach (var r in readers) r.Dispose();
            }
        }

        private static ISampleProvider? OpenAsMono16k(string path, List<AudioFileReader> readers)
        {
            if (!File.Exists(path)) return null;

            AudioFileReader reader;
            try { reader = new AudioFileReader(path); }
            catch { return null; }

            if (reader.TotalTime < TimeSpan.FromMilliseconds(100))
            {
                reader.Dispose();
                return null;
            }

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
                .ToSampleProvider()
                .Take(duration);

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

        // Channel 1 = mic = user, channel 2 = system audio = caller
        private static string SpeakerFor(JsonElement el)
        {
            string? id = null;

            if (el.TryGetProperty("channel", out var ch) && ch.ValueKind != JsonValueKind.Null)
                id = ch.ValueKind == JsonValueKind.String ? ch.GetString() : ch.ToString();

            if (string.IsNullOrEmpty(id) &&
                el.TryGetProperty("speaker", out var sp) && sp.ValueKind != JsonValueKind.Null)
                id = sp.ValueKind == JsonValueKind.String ? sp.GetString() : sp.ToString();

            return id switch
            {
                "1" => "user",
                "2" => "caller",
                _   => "unknown"
            };
        }

        private async Task<AssemblyResult> TranscribeWithAssemblyAI(string filePath, TimeSpan callOffset)
        {
            try
            {
                // 1. Upload
                using var uploadReq = new HttpRequestMessage(
                    HttpMethod.Post, "https://api.assemblyai.com/v2/upload");
                uploadReq.Headers.Add("Authorization", _assemblyKey);
                uploadReq.Content = new ByteArrayContent(await File.ReadAllBytesAsync(filePath));
                uploadReq.Content.Headers.ContentType =
                    new MediaTypeHeaderValue("application/octet-stream");

                using var uploadResp = await _http.SendAsync(uploadReq);
                string uploadBody = await uploadResp.Content.ReadAsStringAsync();
                if (!uploadResp.IsSuccessStatusCode)
                    return AssemblyResult.Fail($"Upload failed ({(int)uploadResp.StatusCode}): {Short(uploadBody)}");

                string uploadUrl;
                using (var doc = JsonDocument.Parse(uploadBody))
                    uploadUrl = doc.RootElement.GetProperty("upload_url").GetString()!;

                // 2. Submit (multichannel = left/user and right/caller transcribed separately)
                using var submitReq = new HttpRequestMessage(
                    HttpMethod.Post, "https://api.assemblyai.com/v2/transcript");
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

                // 3. Poll (up to ~90 seconds)
                string pollUrl   = $"https://api.assemblyai.com/v2/transcript/{id}";
                string finalBody = "";
                bool   completed = false;

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
                            ? err.GetString() ?? "unknown error" : "unknown error";
                        return AssemblyResult.Fail($"AssemblyAI error: {msg}");
                    }
                }

                if (!completed) return AssemblyResult.Fail("AssemblyAI timed out.");

                // 4. Parse
                using var finalDoc = JsonDocument.Parse(finalBody);
                var root = finalDoc.RootElement;

                var speakers     = new List<object>();
                var lines        = new List<string>();
                var conversation = new List<ConversationLine>();

                if (root.TryGetProperty("utterances", out var utterances) &&
                    utterances.ValueKind == JsonValueKind.Array)
                {
                    foreach (var u in utterances.EnumerateArray()
                                                .OrderBy(u => u.GetProperty("start").GetInt64()))
                    {
                        string who     = SpeakerFor(u);
                        string text    = u.GetProperty("text").GetString() ?? "";
                        long   startMs = u.GetProperty("start").GetInt64();
                        long   endMs   = u.GetProperty("end").GetInt64();

                        // AssemblyAI times are relative to this chunk; add the chunk's offset
                        string callStart = FormatCallTime(callOffset + TimeSpan.FromMilliseconds(startMs));
                        string callEnd   = FormatCallTime(callOffset + TimeSpan.FromMilliseconds(endMs));

                        double? confidence = u.TryGetProperty("confidence", out var c)
                            ? Math.Round(c.GetDouble(), 3) : null;

                        speakers.Add(new
                        {
                            speaker   = who,
                            text,
                            call_time = $"{callStart} - {callEnd}",
                            start_ms  = startMs,
                            end_ms    = endMs,
                            confidence
                        });

                        conversation.Add(new ConversationLine(callStart, who, text, confidence));

                        string label = who == "caller" ? "Caller" : who == "user" ? "User" : "Unknown";
                        lines.Add($"[{callStart}] {label}: {text}");
                    }
                }

                string transcript = lines.Count > 0
                    ? string.Join("\n", lines)
                    : (root.TryGetProperty("text", out var t) && t.ValueKind == JsonValueKind.String
                        ? t.GetString() ?? "" : "");

                return new AssemblyResult(transcript, speakers, conversation, null);
            }
            catch (Exception ex)
            {
                return AssemblyResult.Fail($"AssemblyAI exception: {ex.Message}");
            }
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
                    speakers = new
                    {
                        user   = "Person using the app",
                        caller = "Person on the other end of the call"
                    },
                    transcription_gaps = _transcriptionGaps.Count > 0
                        ? new List<string>(_transcriptionGaps) : null,
                    conversation = new List<ConversationLine>(_conversation)
                };
            }
        }

        // ── GROK: ASK FOR A VERDICT ───────────────────────────────────────────
        private async Task AnalyzeWithGrokAsync(string payloadJson, int requestId, int afterChunk, string callTime)
        {
            try
            {
                SetChunkStatus($"Asking Grok about the call so far (0:00 - {callTime})...");

                var (verdict, error) = await AskGrokAsync(payloadJson);

                bool isNewest;
                lock (_verdictHistory)
                {
                    _verdictHistory.Add(new
                    {
                        after_chunk = afterChunk,
                        call_time   = $"0:00 - {callTime}",
                        verdict,
                        error
                    });

                    // Answers can arrive out of order; never replace a newer verdict with an older one
                    isNewest = requestId > _latestAppliedGrok;
                    if (isNewest && verdict != null)
                    {
                        _latestAppliedGrok = requestId;
                        _latestVerdict     = verdict;
                    }
                }

                if (error != null || verdict == null)
                {
                    Log($"\n[Grok error after chunk {afterChunk}] {error}");
                    if (isNewest) ShowGrokError(error ?? "Unknown error");
                    return;
                }

                if (!isNewest) return;   // an older answer arrived late; a newer one is already shown

                string verdictJson = JsonSerializer.Serialize(verdict, _jsonOptions);
                File.WriteAllText(_grokVerdictPath, verdictJson);
                Log($"\n[Grok verdict after chunk {afterChunk} | call time 0:00 - {callTime}]");
                Log(verdictJson);

                ShowVerdict(verdict, callTime);

                if (verdict.RiskLevel == "high" && !_highAlertShown)
                {
                    _highAlertShown = true;
                    ShowScamAlert(verdict);
                }

                if (_isRecording) SetChunkStatus($"Grok checked 0:00 - {callTime}. Listening...");
            }
            catch (Exception ex)
            {
                Log($"\n[Grok error] {ex.Message}");
            }
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
                        json_schema = new
                        {
                            name   = "scam_assessment",
                            strict = true,
                            schema = GrokPrompt.Schema
                        }
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
                {
                    content = doc.RootElement
                        .GetProperty("choices")[0]
                        .GetProperty("message")
                        .GetProperty("content")
                        .GetString() ?? "";
                }

                var verdict = JsonSerializer.Deserialize<ScamVerdict>(StripCodeFences(content));
                if (verdict == null) return (null, "Grok returned an empty answer.");

                verdict.ScamLikelihood = Math.Clamp(verdict.ScamLikelihood, 0, 100);
                verdict.RiskLevel      = (verdict.RiskLevel ?? "low").Trim().ToLowerInvariant();
                return (verdict, null);
            }
            catch (Exception ex)
            {
                return (null, $"Grok exception: {ex.Message}");
            }
        }

        private static string StripCodeFences(string s)
        {
            s = s.Trim();
            if (!s.StartsWith("```")) return s;
            int firstNewline = s.IndexOf('\n');
            int lastFence    = s.LastIndexOf("```", StringComparison.Ordinal);
            return firstNewline >= 0 && lastFence > firstNewline
                ? s.Substring(firstNewline + 1, lastFence - firstNewline - 1).Trim()
                : s;
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
            TxtRiskReasons.Text     = "";
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

                RiskBorder.BorderBrush  = new SolidColorBrush(color);
                TxtRiskLevel.Text       = $"{label}  ({v.ScamLikelihood}/100)";
                TxtRiskLevel.Foreground = new SolidColorBrush(color);
                TxtRiskSummary.Text     = $"As of {callTime}: {v.Summary}";
                TxtRiskReasons.Text     = FormatReasons(v);
            });
        }

        private void ShowGrokError(string error)
        {
            Dispatcher.Invoke(() =>
            {
                // Keep the last good verdict on screen; just note the problem under it
                string note = $"⚠ Latest Grok check failed: {Short(error)}";
                TxtRiskSummary.Text = string.IsNullOrEmpty(TxtRiskSummary.Text)
                    ? note : TxtRiskSummary.Text + "\n" + note;
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
            if (!string.IsNullOrWhiteSpace(v.RecommendedAction))
            {
                if (sb.Length > 0) sb.AppendLine();
                sb.AppendLine($"What to do: {v.RecommendedAction}");
            }
            return sb.ToString().TrimEnd();
        }

        private static string PrettyCategory(string category)
        {
            string s = (category ?? "other").Replace('_', ' ');
            return s.Length > 0 ? char.ToUpper(s[0]) + s[1..] : s;
        }

        // Pops up on top of every window (including the call app) the first time a call turns high-risk
        private void ShowScamAlert(ScamVerdict v)
        {
            Dispatcher.InvokeAsync(() =>
            {
                System.Media.SystemSounds.Exclamation.Play();

                var panel = new StackPanel { Margin = new Thickness(20) };
                panel.Children.Add(new TextBlock
                {
                    Text = "⚠ Possible scam call",
                    FontSize = 22, FontWeight = FontWeights.Bold,
                    Foreground = new SolidColorBrush(RiskHigh)
                });
                panel.Children.Add(new TextBlock
                {
                    Text = $"Scam likelihood: {v.ScamLikelihood}/100",
                    Foreground = Brushes.White, Margin = new Thickness(0, 6, 0, 0)
                });
                panel.Children.Add(new TextBlock
                {
                    Text = v.Summary, TextWrapping = TextWrapping.Wrap,
                    Foreground = Brushes.White, Margin = new Thickness(0, 10, 0, 0)
                });
                panel.Children.Add(new TextBlock
                {
                    Text = string.Join("\n", v.Reasons.Take(3).Select(r => $"• {PrettyCategory(r.Category)}")),
                    TextWrapping = TextWrapping.Wrap,
                    Foreground = new SolidColorBrush(Color.FromRgb(220, 220, 220)),
                    Margin = new Thickness(0, 10, 0, 0)
                });
                panel.Children.Add(new TextBlock
                {
                    Text = v.RecommendedAction, TextWrapping = TextWrapping.Wrap,
                    FontWeight = FontWeights.Bold, Foreground = Brushes.White,
                    Margin = new Thickness(0, 12, 0, 0)
                });

                var ok = new Button
                {
                    Content = "OK", Width = 90, Height = 30,
                    HorizontalAlignment = HorizontalAlignment.Right,
                    Margin = new Thickness(0, 16, 0, 0)
                };
                panel.Children.Add(ok);

                var alert = new Window
                {
                    Title = "ScamShield Alert",
                    Content = panel,
                    Width = 440,
                    SizeToContent = SizeToContent.Height,
                    Topmost = true,
                    ResizeMode = ResizeMode.NoResize,
                    WindowStartupLocation = WindowStartupLocation.CenterScreen,
                    Background = new SolidColorBrush(Color.FromRgb(30, 30, 30))
                };
                ok.Click += (_, _) => alert.Close();
                alert.Show();
            });
        }

        // ── FULL SESSION JSON ─────────────────────────────────────────────────
        private void OutputSessionJson()
        {
            List<object> chunks;
            lock (_sessionChunks) chunks = new List<object>(_sessionChunks);

            List<object> verdicts;
            ScamVerdict? finalVerdict;
            lock (_verdictHistory)
            {
                verdicts     = new List<object>(_verdictHistory);
                finalVerdict = _latestVerdict;
            }

            string callLength = FormatCallTime(DateTime.Now - _sessionStart);

            var session = new
            {
                session_id   = Guid.NewGuid().ToString(),
                recorded_at  = DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss"),
                total_chunks = chunks.Count,
                speakers = new
                {
                    user   = "Person using the app (microphone)",
                    caller = "Person on the other end of the call (system audio)"
                },
                pipeline = new
                {
                    transcription = "AssemblyAI (multichannel)",
                    scam_analysis = $"xAI {GrokPrompt.Model}"
                },
                final_verdict  = finalVerdict,
                verdict_history = verdicts,
                grok_payload   = BuildGrokPayload(callLength, chunks.Count),
                chunks
            };

            string json = JsonSerializer.Serialize(session, _jsonOptions);
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
            Dispatcher.Invoke(() =>
            {
                TxtStatus.Text      = status;
                TxtChunkStatus.Text = chunkStatus;
            });
        }

        private void SetChunkStatus(string chunkStatus)
        {
            Dispatcher.Invoke(() => TxtChunkStatus.Text = chunkStatus);
        }

        // 0:45, 12:03, or 1:02:10 for calls over an hour
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
