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
using Application = System.Windows.Application;
using NAudio.Wave;
using NAudio.Wave.SampleProviders;

namespace ScamDetector
{
    // All recording and analysis logic lives here.
    // The UI (CallMonitorWindow) calls into this class and subscribes to its events.
    public static class MainLogic
    {
        // ── Events the UI listens to ──────────────────────────────────────────
        public static event Action<string>?                        StatusChanged;
        public static event Action<ScamVerdict, string>?           VerdictReady;
        public static event Action<string>?                        VerdictReset;
        public static event Action<AiVoiceDetector.DetectorResult>? AiVoiceReady;
        public static event Action<string>?                        AiVoiceError;
        public static event Action<string>?                        GrokError;
        public static event Action?                                RecordingStarted;
        public static event Action?                                RecordingStopped;

        // ── State readable by the UI ──────────────────────────────────────────
        public static bool    IsRecording     => _isRecording;
        public static string? LastStatusText  => _lastStatus;

        private static string? _lastStatus;
        private static Action? _openMonitorCallback;

        // ── Recording ─────────────────────────────────────────────────────────
        private static readonly HttpClient _http =
            new HttpClient { Timeout = TimeSpan.FromMinutes(2) };

        private const int ChunkSeconds     = 20;
        private const int TargetSampleRate = 16000;

        private static WaveInEvent?           _micIn;
        private static WasapiLoopbackCapture? _loopbackIn;
        private static WasapiOut?             _silencePlayer;
        private static WaveFileWriter?        _micWriter;
        private static WaveFileWriter?        _loopbackWriter;
        private static WaveFormat?            _micFormat;
        private static WaveFormat?            _loopbackFormat;
        private static readonly object        _writerLock = new();

        private static TaskCompletionSource<bool>? _micStoppedTcs;
        private static TaskCompletionSource<bool>? _loopbackStoppedTcs;

        private static System.Threading.Timer? _chunkTimer;
        private static readonly SemaphoreSlim  _chunkLock = new(1, 1);
        private static int                     _chunkNumber;
        private static volatile bool           _isRecording;
        private static volatile bool           _discardSession;
        private static DateTime                _chunkStart;
        private static DateTime                _sessionStart;

        private static int          _grokRequestCounter;
        private static int          _latestAppliedGrok;
        private static ScamVerdict? _latestVerdict;
        private static bool         _highAlertShown;
        private static double       _aiProbSum;
        private static int          _aiProbCount;

        private static readonly List<Task>             _pendingGrok    = new();
        private static readonly List<object>           _sessionChunks  = new();
        private static readonly List<ConversationLine> _conversation   = new();
        private static readonly List<string>           _transcriptionGaps = new();
        private static readonly List<object>           _verdictHistory = new();
        private static readonly List<object>           _aiChunkResults = new();
        private static object? _callInfo;

        private static readonly string _baseDir  = AppDomain.CurrentDomain.BaseDirectory;
        private static readonly string _workDir  = Path.Combine(_baseDir, "audio");
        private static readonly string _micPath      = Path.Combine(_workDir, "mic_live.wav");
        private static readonly string _loopbackPath = Path.Combine(_workDir, "loopback_live.wav");

        private static readonly JsonSerializerOptions _jsonOptions = new()
        {
            WriteIndented          = true,
            Encoder                = JavaScriptEncoder.UnsafeRelaxedJsonEscaping,
            DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull
        };

        // ── Call watcher ──────────────────────────────────────────────────────
        private static CallWatcher? _callWatcher;

        public static void Initialize(Action openMonitorCallback)
        {
            _openMonitorCallback = openMonitorCallback;
            Directory.CreateDirectory(_workDir);

            _callWatcher = new CallWatcher();
            _callWatcher.StatusMessage += msg => Log($"[Watcher] {msg}");
            _callWatcher.CallStarted   += OnWhatsAppCallStarted;
            _callWatcher.CallEnded     += OnWhatsAppCallEnded;
            try { _callWatcher.Start(); }
            catch (Exception ex) { Log($"[Watcher] Could not start: {ex.Message}"); }
        }

        public static void Shutdown()
        {
            _callWatcher?.Dispose();
            if (_isRecording)
                _ = StopAsync(discard: true);
        }

        // ── Auto-detection callbacks ──────────────────────────────────────────
        private static void OnWhatsAppCallStarted(CallerInfo info)
        {
            Application.Current.Dispatcher.Invoke(() =>
            {
                if (_isRecording) return;
                if (info.IsContact == true)  { Log($"[Watcher] Saved contact ({info.Display}), not recording."); return; }
                if (info.IsContact == null)  { Log("[Watcher] Couldn't identify caller, not auto-recording."); return; }
                if (!App.Keys.AreComplete)   { Log("[Watcher] Unknown caller but API keys are missing."); return; }

                _callInfo = new { caller_display = info.Display, in_contacts = false, recording_started = "auto" };

                // Open the monitor popup then start recording
                _openMonitorCallback?.Invoke();
                StartRecording();

                SetStatus("🔴 Recording — unknown caller detected");
            });
        }

        private static void OnWhatsAppCallEnded()
        {
            Application.Current.Dispatcher.Invoke(() =>
            {
                if (!_isRecording) return;
                Log("[Watcher] Call ended — stopping recording.");
                _ = StopAsync(discard: false);
            });
        }

        // ── Start / Stop ──────────────────────────────────────────────────────
        public static void StartRecording()
        {
            if (_isRecording) return;
            if (!App.Keys.AreComplete)
            {
                SetStatus("⚠ API keys not set. Open settings from the tray icon.");
                return;
            }

            try
            {
                _chunkNumber    = 0;
                _highAlertShown = false;
                _discardSession = false;
                _aiProbSum      = 0;
                _aiProbCount    = 0;
                _callInfo       = _callInfo ?? new { recording_started = "manual" };

                lock (_sessionChunks) _sessionChunks.Clear();
                lock (_conversation)  { _conversation.Clear(); _transcriptionGaps.Clear(); }
                lock (_verdictHistory) { _verdictHistory.Clear(); _latestVerdict = null; _grokRequestCounter = 0; _latestAppliedGrok = 0; }
                lock (_pendingGrok)   _pendingGrok.Clear();
                lock (_aiChunkResults) _aiChunkResults.Clear();

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

                SetStatus($"🔴 Recording... first analysis in {ChunkSeconds} seconds");
                RecordingStarted?.Invoke();
                // Signal the UI to show "listening" in the risk box
                VerdictReset?.Invoke("Scam risk: listening...");
            }
            catch (Exception ex)
            {
                Log($"[Recording] Start error: {ex.Message}");
                SetStatus($"⚠ Could not start recording: {ex.Message}");
            }
        }

        public static async Task StopAsync(bool discard)
        {
            if (!_isRecording) return;

            _isRecording    = false;
            _discardSession = discard;
            _chunkTimer?.Dispose();
            _chunkTimer = null;
            _callInfo   = null;

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
                TryDelete(_micPath); TryDelete(_loopbackPath);
                SetStatus("Stopped.");
                RecordingStopped?.Invoke();
                return;
            }

            SetStatus("Processing final chunk...");
            await ProcessChunkAsync(isFinal: true, waitForLock: true);

            Task[] pending;
            lock (_pendingGrok) pending = _pendingGrok.ToArray();
            if (pending.Length > 0) await Task.WhenAll(pending);

            OutputSessionJson();
            SetStatus("✅ Analysis complete.");
            RecordingStopped?.Invoke();
        }

        // ── Chunk processing ──────────────────────────────────────────────────
        private static async Task SafeProcessChunkAsync()
        {
            try { await ProcessChunkAsync(isFinal: false, waitForLock: false); }
            catch (Exception ex) { Log($"[Chunk error] {ex.Message}"); }
        }

        private static async Task ProcessChunkAsync(bool isFinal, bool waitForLock)
        {
            if (waitForLock) await _chunkLock.WaitAsync();
            else if (!await _chunkLock.WaitAsync(0)) return;

            int      thisChunk    = ++_chunkNumber;
            string   micSnap      = Path.Combine(_workDir, $"chunk{thisChunk}_mic.wav");
            string   loopSnap     = Path.Combine(_workDir, $"chunk{thisChunk}_loopback.wav");
            string   stereoSnap   = Path.Combine(_workDir, $"chunk{thisChunk}_stereo.wav");
            string   aiSnap       = Path.Combine(_workDir, $"chunk{thisChunk}_ai.wav");
            DateTime start        = _chunkStart;
            DateTime end          = DateTime.Now;
            _chunkStart           = end;
            string   chunkTime    = $"{FormatTime(start - _sessionStart)} - {FormatTime(end - _sessionStart)}";

            try
            {
                SetStatus($"Analyzing chunk {thisChunk} ({chunkTime})...");
                SnapshotAndRestartWriters(micSnap, loopSnap);

                if (File.Exists(loopSnap)) File.Copy(loopSnap, aiSnap, true);

                TimeSpan duration = BuildStereoChunk(micSnap, loopSnap, stereoSnap);
                if (duration < TimeSpan.FromSeconds(1)) { _chunkNumber--; return; }

                TimeSpan offset = start - _sessionStart;
                var transcribeTask = TranscribeAsync(stereoSnap, offset);
                bool aiSnapExists = File.Exists(aiSnap);
                Log($"[AI voice] aiSnap exists={aiSnapExists} path={aiSnap}");
                var aiTask = aiSnapExists
                    ? AiVoiceDetector.AnalyzeAsync(aiSnap, deleteAfter: false)
                    : Task.FromResult(new AiVoiceDetector.DetectorResult(0, 0, "UNKNOWN", "Unknown", $"No caller audio file at {aiSnap}"));

                await Task.WhenAll(transcribeTask, aiTask);

                var result   = transcribeTask.Result;
                var aiResult = aiTask.Result;
                if (_discardSession) return;

                var chunk = new { chunk = thisChunk, call_time = chunkTime, transcription = result.Transcript, speaker_segments = result.Speakers, error = result.Error };
                lock (_sessionChunks) _sessionChunks.Add(chunk);

                lock (_conversation)
                {
                    if (result.Error != null) _transcriptionGaps.Add(chunkTime);
                    _conversation.AddRange(result.Lines);
                }

                // AI voice
                if (aiResult.Error == null)
                {
                    _aiProbSum += aiResult.AiProbability;
                    _aiProbCount++;
                    double avg      = _aiProbSum / _aiProbCount;
                    string avgLabel = avg >= 0.7 ? "High" : avg >= 0.4 ? "Medium" : "Low";
                    var avgResult   = aiResult with { AiProbability = Math.Round(avg, 4), RiskLabel = avgLabel };
                    string aiJson   = JsonSerializer.Serialize(new { prediction = aiResult.Prediction, ai_probability = aiResult.AiProbability, real_probability = aiResult.RealProbability, threshold = 0.5, model = "AASIST" }, _jsonOptions);
                    Log($"[AI voice] chunk {thisChunk}:\n{aiJson}\nRunning avg: {avg * 100:F1}% ({avgLabel})");
                    AiVoiceReady?.Invoke(avgResult);
                    lock (_aiChunkResults) _aiChunkResults.Add(new { chunk = thisChunk, ai_probability = aiResult.AiProbability, risk_label = aiResult.RiskLabel, running_avg = Math.Round(avg, 4) });
                }
                else
                {
                    Log($"[AI voice] chunk {thisChunk} error: {aiResult.Error}");
                    AiVoiceError?.Invoke(aiResult.Error!);
                }

                // Grok
                string callTimeSoFar = FormatTime(end - _sessionStart);
                string payloadJson   = JsonSerializer.Serialize(BuildGrokPayload(callTimeSoFar, thisChunk), _jsonOptions);

                bool hasConversation;
                lock (_conversation) hasConversation = _conversation.Count > 0;

                if (App.Keys.Grok.Length > 0 && hasConversation && result.Lines.Count > 0)
                {
                    int reqId    = Interlocked.Increment(ref _grokRequestCounter);
                    var grokTask = AnalyzeWithGrokAsync(payloadJson, reqId, thisChunk, callTimeSoFar);
                    lock (_pendingGrok) _pendingGrok.Add(grokTask);
                }

                if (_isRecording) SetStatus($"🔴 Recording... next analysis in {ChunkSeconds}s");
            }
            catch (Exception ex) { Log($"[Chunk {thisChunk}] {ex.Message}"); }
            finally
            {
                TryDelete(micSnap); TryDelete(loopSnap); TryDelete(stereoSnap);
                _chunkLock.Release();
            }
        }

        // ── Writers ───────────────────────────────────────────────────────────
        private static void SnapshotAndRestartWriters(string micSnap, string loopSnap)
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

        // ── Audio mixing ──────────────────────────────────────────────────────
        private static TimeSpan BuildStereoChunk(string mic, string loop, string output)
        {
            var readers = new List<AudioFileReader>();
            try
            {
                ISampleProvider? user   = OpenAsMono(mic,  readers);
                ISampleProvider? caller = OpenAsMono(loop, readers);
                if (readers.Count == 0) return TimeSpan.Zero;
                TimeSpan dur = readers.Max(r => r.TotalTime);
                user   ??= Silence(dur);
                caller ??= Silence(dur);
                WaveFileWriter.CreateWaveFile16(output, new MultiplexingSampleProvider(new[] { user, caller }, 2));
                return dur;
            }
            finally { foreach (var r in readers) r.Dispose(); }
        }

        private static ISampleProvider? OpenAsMono(string path, List<AudioFileReader> readers)
        {
            if (!File.Exists(path)) return null;
            AudioFileReader r;
            try { r = new AudioFileReader(path); } catch { return null; }
            if (r.TotalTime < TimeSpan.FromMilliseconds(100)) { r.Dispose(); return null; }
            readers.Add(r);
            ISampleProvider s = r;
            if (s.WaveFormat.Channels == 2) s = new StereoToMonoSampleProvider(s);
            else if (s.WaveFormat.Channels > 2) s = new MultiplexingSampleProvider(new[] { s }, 1);
            if (s.WaveFormat.SampleRate != TargetSampleRate) s = new WdlResamplingSampleProvider(s, TargetSampleRate);
            return s;
        }

        private static ISampleProvider Silence(TimeSpan d) =>
            new SilenceProvider(WaveFormat.CreateIeeeFloatWaveFormat(TargetSampleRate, 1)).ToSampleProvider().Take(d);

        // ── AssemblyAI ────────────────────────────────────────────────────────
        private record AssemblyResult(string Transcript, List<object> Speakers, List<ConversationLine> Lines, string? Error)
        {
            public static AssemblyResult Fail(string e) => new("", new(), new(), e);
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
            if (string.IsNullOrEmpty(id) && el.TryGetProperty("speaker", out var sp) && sp.ValueKind != JsonValueKind.Null)
                id = sp.ValueKind == JsonValueKind.String ? sp.GetString() : sp.ToString();
            return id switch { "1" => "user", "2" => "caller", _ => "unknown" };
        }

        private static async Task<AssemblyResult> TranscribeAsync(string path, TimeSpan offset)
        {
            try
            {
                string key = App.Keys.AssemblyAI;
                using var uploadReq = new HttpRequestMessage(HttpMethod.Post, "https://api.assemblyai.com/v2/upload");
                uploadReq.Headers.Add("Authorization", key);
                uploadReq.Content = new ByteArrayContent(await File.ReadAllBytesAsync(path));
                uploadReq.Content.Headers.ContentType = new MediaTypeHeaderValue("application/octet-stream");
                using var uploadResp = await _http.SendAsync(uploadReq);
                string uploadBody = await uploadResp.Content.ReadAsStringAsync();
                if (!uploadResp.IsSuccessStatusCode) return AssemblyResult.Fail($"Upload failed: {Short(uploadBody)}");

                string uploadUrl;
                using (var d = JsonDocument.Parse(uploadBody)) uploadUrl = d.RootElement.GetProperty("upload_url").GetString()!;

                using var subReq = new HttpRequestMessage(HttpMethod.Post, "https://api.assemblyai.com/v2/transcript");
                subReq.Headers.Add("Authorization", key);
                subReq.Content = new StringContent(JsonSerializer.Serialize(new { audio_url = uploadUrl, multichannel = true }), Encoding.UTF8, "application/json");
                using var subResp = await _http.SendAsync(subReq);
                string subBody = await subResp.Content.ReadAsStringAsync();
                if (!subResp.IsSuccessStatusCode) return AssemblyResult.Fail($"Submit failed: {Short(subBody)}");

                string id;
                using (var d = JsonDocument.Parse(subBody)) id = d.RootElement.GetProperty("id").GetString()!;

                string poll = $"https://api.assemblyai.com/v2/transcript/{id}";
                string final = "";
                for (int i = 0; i < 60; i++)
                {
                    await Task.Delay(1500);
                    using var pr = new HttpRequestMessage(HttpMethod.Get, poll);
                    pr.Headers.Add("Authorization", key);
                    using var presp = await _http.SendAsync(pr);
                    final = await presp.Content.ReadAsStringAsync();
                    using var pd = JsonDocument.Parse(final);
                    string st = pd.RootElement.GetProperty("status").GetString()!;
                    if (st == "completed") break;
                    if (st == "error") return AssemblyResult.Fail("AssemblyAI error");
                }

                using var fd = JsonDocument.Parse(final);
                var root = fd.RootElement;
                var speakers = new List<object>();
                var lines    = new List<string>();
                var conv     = new List<ConversationLine>();

                if (root.TryGetProperty("utterances", out var utts) && utts.ValueKind == JsonValueKind.Array)
                {
                    foreach (var u in utts.EnumerateArray().OrderBy(u => u.GetProperty("start").GetInt64()))
                    {
                        string who   = SpeakerFor(u);
                        string text  = u.GetProperty("text").GetString() ?? "";
                        long   sMs   = u.GetProperty("start").GetInt64();
                        long   eMs   = u.GetProperty("end").GetInt64();
                        string cs    = FormatTime(offset + TimeSpan.FromMilliseconds(sMs));
                        string ce    = FormatTime(offset + TimeSpan.FromMilliseconds(eMs));
                        double? conf = u.TryGetProperty("confidence", out var c) ? Math.Round(c.GetDouble(), 3) : null;
                        speakers.Add(new { speaker = who, text, call_time = $"{cs}-{ce}", start_ms = sMs, end_ms = eMs, confidence = conf });
                        conv.Add(new ConversationLine(cs, who, text, conf));
                        lines.Add($"[{cs}] {(who == "caller" ? "Caller" : who == "user" ? "User" : "Unknown")}: {text}");
                    }
                }

                string transcript = lines.Count > 0 ? string.Join("\n", lines)
                    : (root.TryGetProperty("text", out var t) && t.ValueKind == JsonValueKind.String ? t.GetString() ?? "" : "");
                return new AssemblyResult(transcript, speakers, conv, null);
            }
            catch (Exception ex) { return AssemblyResult.Fail(ex.Message); }
        }

        // ── Grok ──────────────────────────────────────────────────────────────
        private static object BuildGrokPayload(string timeSoFar, int chunks)
        {
            lock (_conversation)
            {
                return new
                {
                    call_time_so_far = $"0:00 - {timeSoFar}",
                    chunks_analyzed  = chunks,
                    speakers         = new { user = "Person using the app", caller = "Person on the other end" },
                    transcription_gaps = _transcriptionGaps.Count > 0 ? new List<string>(_transcriptionGaps) : null,
                    call_info          = _callInfo,
                    ai_voice           = _aiProbCount > 0 ? new { running_avg_ai_probability = Math.Round(_aiProbSum / _aiProbCount, 4), chunks_analyzed = _aiProbCount, note = "AASIST model; treat as supporting signal only" } : null,
                    conversation       = new List<ConversationLine>(_conversation)
                };
            }
        }

        private static async Task AnalyzeWithGrokAsync(string payload, int reqId, int chunk, string callTime)
        {
            try
            {
                var body = new
                {
                    model    = GrokPrompt.Model,
                    messages = new object[]
                    {
                        new { role = "system", content = GrokPrompt.SystemPrompt },
                        new { role = "user",   content = GrokPrompt.BuildUserMessage(payload) }
                    },
                    response_format = new { type = "json_schema", json_schema = new { name = "scam_assessment", strict = true, schema = GrokPrompt.Schema } }
                };

                using var req = new HttpRequestMessage(HttpMethod.Post, GrokPrompt.Endpoint);
                req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", App.Keys.Grok);
                req.Content = new StringContent(JsonSerializer.Serialize(body), Encoding.UTF8, "application/json");

                using var resp = await _http.SendAsync(req);
                string rb = await resp.Content.ReadAsStringAsync();
                if (!resp.IsSuccessStatusCode) { GrokError?.Invoke($"Grok {(int)resp.StatusCode}: {Short(rb)}"); return; }

                string content;
                using (var d = JsonDocument.Parse(rb))
                    content = d.RootElement.GetProperty("choices")[0].GetProperty("message").GetProperty("content").GetString() ?? "";

                var verdict = JsonSerializer.Deserialize<ScamVerdict>(StripFences(content));
                if (verdict == null) { GrokError?.Invoke("Grok returned empty answer."); return; }
                verdict.ScamLikelihood = Math.Clamp(verdict.ScamLikelihood, 0, 100);
                verdict.RiskLevel      = (verdict.RiskLevel ?? "low").Trim().ToLowerInvariant();

                bool isNewest;
                lock (_verdictHistory)
                {
                    _verdictHistory.Add(new { after_chunk = chunk, call_time = $"0:00 - {callTime}", verdict });
                    isNewest = reqId > _latestAppliedGrok;
                    if (isNewest) { _latestAppliedGrok = reqId; _latestVerdict = verdict; }
                }

                if (!isNewest) return;
                VerdictReady?.Invoke(verdict, callTime);

                if (verdict.RiskLevel == "high" && !_highAlertShown)
                {
                    _highAlertShown = true;
                    Application.Current.Dispatcher.Invoke(() => System.Media.SystemSounds.Exclamation.Play());
                }
            }
            catch (Exception ex) { GrokError?.Invoke(ex.Message); }
        }

        // ── Session JSON ──────────────────────────────────────────────────────
        private static void OutputSessionJson()
        {
            List<object> chunks; List<object> verdicts; ScamVerdict? fv;
            lock (_sessionChunks) chunks = new(  _sessionChunks);
            lock (_verdictHistory) { verdicts = new(_verdictHistory); fv = _latestVerdict; }

            var session = new
            {
                session_id      = Guid.NewGuid().ToString(),
                recorded_at     = DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss"),
                total_chunks    = chunks.Count,
                final_verdict   = fv,
                verdict_history = verdicts,
                ai_voice_summary = _aiProbCount > 0 ? new { running_avg = Math.Round(_aiProbSum / _aiProbCount, 4), chunks_analyzed = _aiProbCount } : null,
                grok_payload    = BuildGrokPayload(FormatTime(DateTime.Now - _sessionStart), chunks.Count),
                chunks
            };

            string outPath = Path.Combine(_baseDir, $"session_{DateTime.Now:yyyyMMdd_HHmmss}.json");
            File.WriteAllText(outPath, JsonSerializer.Serialize(session, _jsonOptions));
            Log($"[Session] Saved to {outPath}");
        }

        // ── Helpers ───────────────────────────────────────────────────────────
        private static void SetStatus(string msg)
        {
            _lastStatus = msg;
            StatusChanged?.Invoke(msg);
        }

        private static void Log(string msg) =>
            System.Diagnostics.Debug.WriteLine($"[ScamShield] {msg}");

        private static string FormatTime(TimeSpan t)
        {
            if (t < TimeSpan.Zero) t = TimeSpan.Zero;
            return t.TotalHours >= 1
                ? $"{(int)t.TotalHours}:{t.Minutes:00}:{t.Seconds:00}"
                : $"{(int)t.TotalMinutes}:{t.Seconds:00}";
        }

        private static string Short(string s) => s.Length <= 200 ? s : s[..200] + "...";

        private static string StripFences(string s)
        {
            s = s.Trim();
            if (!s.StartsWith("```")) return s;
            int fn = s.IndexOf('\n'); int lf = s.LastIndexOf("```", StringComparison.Ordinal);
            return fn >= 0 && lf > fn ? s.Substring(fn + 1, lf - fn - 1).Trim() : s;
        }

        private static void TryDelete(string p)
        {
            try { if (File.Exists(p)) File.Delete(p); } catch { }
        }

        private static string FormatReasons(ScamVerdict v)
        {
            var sb = new StringBuilder();
            foreach (var r in v.Reasons)
            {
                sb.AppendLine($"• {PrettyCategory(r.Category)}: {r.Explanation}");
                foreach (var ev in r.Evidence) sb.AppendLine($"    [{ev.Time}] \"{ev.Quote}\"");
            }
            return sb.ToString().TrimEnd();
        }

        private static string PrettyCategory(string cat)
        {
            string s = (cat ?? "other").Replace('_', ' ');
            return s.Length > 0 ? char.ToUpper(s[0]) + s[1..] : s;
        }

        // Exposed so CallMonitorWindow can format verdicts
        public static (string LevelText, System.Windows.Media.Color Color, string Summary, string Reasons, string Action) FormatVerdict(ScamVerdict v, string callTime)
        {
            var (label, color) = v.RiskLevel switch
            {
                "high"   => ("HIGH RISK — likely scam",     System.Windows.Media.Color.FromRgb(220, 53, 69)),
                "medium" => ("MEDIUM RISK — be cautious",   System.Windows.Media.Color.FromRgb(255, 193, 7)),
                _        => (v.EnoughInformation ? "LOW RISK" : "LOW RISK — still listening",
                             System.Windows.Media.Color.FromRgb(40, 167, 69))
            };
            return ($"{label}  ({v.ScamLikelihood}/100)", color,
                    $"As of {callTime}: {v.Summary}", FormatReasons(v),
                    (v.RecommendedAction ?? "").Trim());
        }
    }
}
