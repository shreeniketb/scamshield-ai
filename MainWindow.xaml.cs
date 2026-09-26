using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using System.Windows;
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
 
        // Copied from the password box when recording starts, because
        // WPF controls can't be read from the background chunk timer thread.
        private string _assemblyKey = "";
 
        // ── Paths (all temp audio lives in bin\...\audio, not the project folder)
        private static readonly string _baseDir = AppDomain.CurrentDomain.BaseDirectory;
        private static readonly string _workDir = Path.Combine(_baseDir, "audio");
        private readonly string _micPath        = Path.Combine(_workDir, "mic_live.wav");
        private readonly string _loopbackPath   = Path.Combine(_workDir, "loopback_live.wav");
        private readonly string _assemblyKeyPath = Path.Combine(_baseDir, "key_assembly.txt");
        private readonly string _elevenKeyPath   = Path.Combine(_baseDir, "key_eleven.txt");
 
        private readonly List<object> _sessionChunks = new();
 
        public MainWindow()
        {
            InitializeComponent();
            LoadSavedKeys();
        }
 
        // ── KEY SAVE/LOAD ─────────────────────────────────────────────────────
        private void LoadSavedKeys()
        {
            if (File.Exists(_assemblyKeyPath))
            {
                TxtAssemblyKey.Password   = File.ReadAllText(_assemblyKeyPath).Trim();
                ChkSaveAssembly.IsChecked = true;
            }
            if (File.Exists(_elevenKeyPath))
            {
                TxtElevenKey.Password   = File.ReadAllText(_elevenKeyPath).Trim();
                ChkSaveEleven.IsChecked = true;
            }
        }
 
        private void ChkSave_Changed(object sender, RoutedEventArgs e)
        {
            if (ChkSaveAssembly.IsChecked == true)
                File.WriteAllText(_assemblyKeyPath, TxtAssemblyKey.Password);
            else if (File.Exists(_assemblyKeyPath))
                File.Delete(_assemblyKeyPath);
 
            if (ChkSaveEleven.IsChecked == true)
                File.WriteAllText(_elevenKeyPath, TxtElevenKey.Password);
            else if (File.Exists(_elevenKeyPath))
                File.Delete(_elevenKeyPath);
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
                _assemblyKey = TxtAssemblyKey.Password.Trim();
                Directory.CreateDirectory(_workDir);
 
                _chunkNumber = 0;
                lock (_sessionChunks) _sessionChunks.Clear();
                TxtOutput.Text = string.Empty;
 
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
                // stays in sync with the mic instead of skipping the quiet parts.
                _silencePlayer = new WasapiOut();
                _silencePlayer.Init(new SilenceProvider(_loopbackFormat));
                _silencePlayer.Play();
 
                _micIn.StartRecording();
                _loopbackIn.StartRecording();
                _isRecording = true;
                _chunkStart  = DateTime.Now;
 
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
 
            // Waits for any chunk still being analyzed, then processes the leftover audio
            TxtStatus.Text = "Status: Processing final chunk...";
            await ProcessChunkAsync(isFinal: true, waitForLock: true);
 
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
                // The previous chunk is still being analyzed. Nothing is lost:
                // this audio stays in the live files and joins the next chunk.
                Log("(Previous chunk still processing — this audio rolls into the next chunk)");
                return;
            }
 
            int    thisChunk = ++_chunkNumber;
            string micSnap   = Path.Combine(_workDir, $"chunk{thisChunk}_mic.wav");
            string loopSnap  = Path.Combine(_workDir, $"chunk{thisChunk}_loopback.wav");
            string mixedSnap = Path.Combine(_workDir, $"chunk{thisChunk}_mixed.wav");
 
            DateTime start = _chunkStart;
            DateTime end   = DateTime.Now;
            _chunkStart    = end;
 
            try
            {
                SetStatus($"Status: Analyzing chunk {thisChunk}...",
                          $"Analyzing chunk {thisChunk} ({start:HH:mm:ss} → {end:HH:mm:ss})...");
                Log($"\n--- CHUNK {thisChunk} ({start:HH:mm:ss} → {end:HH:mm:ss}) ---");
 
                SnapshotAndRestartWriters(micSnap, loopSnap);
 
                TimeSpan duration = MixToMono16k(micSnap, loopSnap, mixedSnap);
                if (duration < TimeSpan.FromSeconds(1))
                {
                    Log("(Less than 1 second of audio — skipped)");
                    _chunkNumber--;
                    return;
                }
 
                var result = await TranscribeWithAssemblyAI(mixedSnap);
 
                var chunk = new
                {
                    chunk            = thisChunk,
                    timestamp_start  = start.ToString("HH:mm:ss"),
                    timestamp_end    = end.ToString("HH:mm:ss"),
                    duration_seconds = Math.Round(duration.TotalSeconds, 1),
                    is_final_chunk   = isFinal,
                    transcription    = result.Transcript,
                    speaker_segments = result.Speakers,
                    sentiment        = result.Sentiment,
                    ai_voice_detection = new
                    {
                        ai_voice_probability = (double?)null,
                        status               = "not_configured"
                    },
                    error          = result.Error,
                    ready_for_grok = result.Error == null
                };
 
                lock (_sessionChunks) _sessionChunks.Add(chunk);
 
                Log(JsonSerializer.Serialize(chunk, new JsonSerializerOptions { WriteIndented = true }));
 
                if (_isRecording)
                    SetStatus("Status: 🔴 Recording...",
                              $"Chunk {thisChunk} done. Next in {ChunkSeconds}s...");
            }
            catch (Exception ex)
            {
                Log($"[Chunk {thisChunk} error] {ex.Message}");
            }
            finally
            {
                // Always clean up, even if something failed above
                TryDelete(micSnap);
                TryDelete(loopSnap);
                TryDelete(mixedSnap);
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
 
        // ── MIX MIC + LOOPBACK INTO ONE 16 kHz MONO WAV ───────────────────────
        private static TimeSpan MixToMono16k(string micPath, string loopbackPath, string outputPath)
        {
            var readers = new List<AudioFileReader>();
            var inputs  = new List<ISampleProvider>();
 
            try
            {
                foreach (var path in new[] { micPath, loopbackPath })
                {
                    if (!File.Exists(path)) continue;
 
                    AudioFileReader reader;
                    try { reader = new AudioFileReader(path); }
                    catch { continue; }   // empty or unreadable file
 
                    if (reader.TotalTime < TimeSpan.FromMilliseconds(100))
                    {
                        reader.Dispose();
                        continue;
                    }
 
                    readers.Add(reader);
                    inputs.Add(ToMono16k(reader));
                }
 
                if (inputs.Count == 0) return TimeSpan.Zero;
 
                // ReadFully is left at its default (false), so the mixer stops
                // when the longest input ends. This was the cause of the old
                // "WAV file too large" error.
                var mixer = new MixingSampleProvider(inputs);
                WaveFileWriter.CreateWaveFile16(outputPath, mixer);
 
                return readers.Max(r => r.TotalTime);
            }
            finally
            {
                foreach (var r in readers) r.Dispose();
            }
        }
 
        private static ISampleProvider ToMono16k(ISampleProvider source)
        {
            if (source.WaveFormat.Channels == 2)
                source = new StereoToMonoSampleProvider(source);
            else if (source.WaveFormat.Channels > 2)
                source = new MultiplexingSampleProvider(new[] { source }, 1); // keep first channel
 
            if (source.WaveFormat.SampleRate != TargetSampleRate)
                source = new WdlResamplingSampleProvider(source, TargetSampleRate);
 
            return source;
        }
 
        // ── ASSEMBLYAI ────────────────────────────────────────────────────────
        private record AssemblyResult(
            string Transcript, List<object> Speakers, List<object> Sentiment, string? Error)
        {
            public static AssemblyResult Fail(string error) => new("", new(), new(), error);
        }
 
        private async Task<AssemblyResult> TranscribeWithAssemblyAI(string filePath)
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
 
                // 2. Submit
                using var submitReq = new HttpRequestMessage(
                    HttpMethod.Post, "https://api.assemblyai.com/v2/transcript");
                submitReq.Headers.Add("Authorization", _assemblyKey);
                submitReq.Content = new StringContent(JsonSerializer.Serialize(new
                {
                    audio_url          = uploadUrl,
                    speaker_labels     = true,
                    sentiment_analysis = true
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
 
                string transcript = root.TryGetProperty("text", out var t) &&
                                    t.ValueKind == JsonValueKind.String
                    ? t.GetString() ?? "" : "";
 
                var speakers = new List<object>();
                if (root.TryGetProperty("utterances", out var utterances) &&
                    utterances.ValueKind == JsonValueKind.Array)
                {
                    foreach (var u in utterances.EnumerateArray())
                    {
                        speakers.Add(new
                        {
                            speaker    = u.GetProperty("speaker").GetString(),
                            text       = u.GetProperty("text").GetString(),
                            start_ms   = u.GetProperty("start").GetInt64(),
                            end_ms     = u.GetProperty("end").GetInt64(),
                            confidence = Math.Round(u.GetProperty("confidence").GetDouble(), 3)
                        });
                    }
                }
 
                var sentiment = new List<object>();
                if (root.TryGetProperty("sentiment_analysis_results", out var sents) &&
                    sents.ValueKind == JsonValueKind.Array)
                {
                    foreach (var s in sents.EnumerateArray())
                    {
                        sentiment.Add(new
                        {
                            speaker    = s.TryGetProperty("speaker", out var sp) ? sp.GetString() : null,
                            text       = s.GetProperty("text").GetString(),
                            sentiment  = s.GetProperty("sentiment").GetString(),
                            confidence = Math.Round(s.GetProperty("confidence").GetDouble(), 3)
                        });
                    }
                }
 
                return new AssemblyResult(transcript, speakers, sentiment, null);
            }
            catch (Exception ex)
            {
                return AssemblyResult.Fail($"AssemblyAI exception: {ex.Message}");
            }
        }
 
        // ── FULL SESSION JSON ─────────────────────────────────────────────────
        private void OutputSessionJson()
        {
            List<object> chunks;
            lock (_sessionChunks) chunks = new List<object>(_sessionChunks);
 
            var session = new
            {
                session_id   = Guid.NewGuid().ToString(),
                recorded_at  = DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss"),
                total_chunks = chunks.Count,
                pipeline = new
                {
                    transcription  = "AssemblyAI v2",
                    voice_analysis = "not configured",
                    next_step      = "Feed to Grok API for scam scoring"
                },
                chunks
            };
 
            string json = JsonSerializer.Serialize(session, new JsonSerializerOptions { WriteIndented = true });
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
 
        private static string Short(string s) => s.Length <= 200 ? s : s[..200] + "...";
 
        private static void TryDelete(string path)
        {
            try { if (File.Exists(path)) File.Delete(path); } catch { }
        }
    }
}
