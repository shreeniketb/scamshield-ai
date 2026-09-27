using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Text.Json;
using System.Threading.Tasks;

namespace ScamDetector
{
    public static class AiVoiceDetector
    {
        private const string PythonExe =
            @"C:\Users\kales\AppData\Local\Microsoft\WindowsApps\python.exe";

        // Current project location
        private static readonly string ProjectRoot = FindProjectRoot();

        private static string FindProjectRoot()
        {
            string[] candidates =
            {
                @"C:\Users\kales\VSCode Projects\scamshield main\scamshield-ai",
                @"C:\Users\kales\OneDrive\Desktop\scamshield-ai",
                @"C:\Users\kales\Desktop\scamshield-ai"
            };
            foreach (var p in candidates)
                if (Directory.Exists(p)) return p;
            return candidates[0];
        }

        private static readonly string CheckpointPath =
            Path.Combine(ProjectRoot, "ai_voice_detector", "model", "aasist_epoch_8.pt");

        public record DetectorResult(
            double AiProbability,
            double RealProbability,
            string Prediction,
            string RiskLabel,
            string? Error);

        public static async Task<DetectorResult> AnalyzeAsync(string wavPath, bool deleteAfter = true)
        {
            try
            {
                if (!File.Exists(wavPath))
                    return Fail($"Audio file not found: {wavPath}");

                if (!File.Exists(PythonExe))
                    return Fail($"Python not found at {PythonExe}.");

                if (!File.Exists(CheckpointPath))
                    return Fail($"Model not found at {CheckpointPath}. Is ai_voice_detector/ in the project folder?");

                string pythonCode = string.Join("; ", new[]
                {
                    "import sys",
                    "import json",
                    $"sys.path.insert(0, r'{ProjectRoot}')",
                    "from ai_voice_detector.detector import AIVoiceDetector",
                    $"d = AIVoiceDetector(checkpoint_path=r'{CheckpointPath}')",
                    $"r = d.predict(r'{wavPath.Replace("'", "\\'")}')",
                    "print(json.dumps(r))"
                });

                // Use temp dir as working directory — always valid, unlike paths
                // with spaces or OneDrive virtualization that Windows can reject
                string workDir = Path.GetTempPath();

                var psi = new ProcessStartInfo
                {
                    FileName               = PythonExe,
                    Arguments              = $"-c \"{pythonCode.Replace("\"", "\\\"")}\"",
                    RedirectStandardOutput = true,
                    RedirectStandardError  = true,
                    UseShellExecute        = false,
                    CreateNoWindow         = true,
                    WorkingDirectory       = workDir
                };

                // Add project root to PYTHONPATH so Python finds ai_voice_detector
                string existing = Environment.GetEnvironmentVariable("PYTHONPATH") ?? "";
                psi.EnvironmentVariables["PYTHONPATH"] = string.IsNullOrEmpty(existing)
                    ? ProjectRoot : $"{ProjectRoot};{existing}";

                using var process = new Process { StartInfo = psi };
                process.Start();

                string stdout = await process.StandardOutput.ReadToEndAsync();
                string stderr = await process.StandardError.ReadToEndAsync();
                await Task.Run(() => process.WaitForExit(60_000));

                // PyTorch prints harmless warnings to stderr — only fail if no output
                if (!string.IsNullOrWhiteSpace(stderr) && string.IsNullOrWhiteSpace(stdout))
                    return Fail($"Python error: {Trim(stderr)}");

                string json = stdout.Trim();
                if (string.IsNullOrEmpty(json))
                    return Fail("Detector produced no output.");

                using var doc = JsonDocument.Parse(json);
                var root = doc.RootElement;

                double aiProb   = root.GetProperty("ai_probability").GetDouble();
                double realProb = root.GetProperty("real_probability").GetDouble();
                string pred     = root.GetProperty("prediction").GetString() ?? "UNKNOWN";

                return new DetectorResult(
                    AiProbability  : Math.Round(aiProb,   4),
                    RealProbability: Math.Round(realProb, 4),
                    Prediction     : pred,
                    RiskLabel      : ToRiskLabel(aiProb),
                    Error          : null);
            }
            catch (Exception ex)
            {
                return Fail($"AI voice detector exception: {ex.Message}");
            }
            finally
            {
                if (deleteAfter) TryDelete(wavPath);
            }
        }

        private static string ToRiskLabel(double prob) =>
            prob >= 0.7 ? "High"   :
            prob >= 0.4 ? "Medium" : "Low";

        private static DetectorResult Fail(string error) =>
            new(0, 0, "UNKNOWN", "Unknown", error);

        private static string Trim(string s) =>
            s.Length > 300 ? s[..300] + "..." : s;

        private static void TryDelete(string path)
        {
            try { if (File.Exists(path)) File.Delete(path); } catch { }
        }
    }
}
