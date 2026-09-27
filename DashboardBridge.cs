using System;
using System.Threading;
using System.Threading.Tasks;

namespace ScamDetector
{
    // Listens to Kale's existing events and forwards each verdict to the family dashboard.
    // Does not change scoring or how the pop-up draws a verdict.
    public static class DashboardBridge
    {
        public static event Action<string>? FamilyMessage;

        private static readonly ScamShieldApi Api = new();
        private static DashboardSettings _settings = DashboardSettings.Load();
        private static CancellationTokenSource? _verifyPollCts;
        private static int _chunk;
        private static bool _verifyTold;
        private static double? _voiceScore;

        public static void Attach()
        {
            MainLogic.RecordingStarted += OnRecordingStarted;
            MainLogic.RecordingStopped += OnRecordingStopped;
            MainLogic.VerdictReady     += OnVerdict;
            MainLogic.AiVoiceReady     += OnAiVoice;
        }

        public static void ReloadSettings() => _settings = DashboardSettings.Load();

        private static void OnRecordingStarted()
        {
            _settings   = DashboardSettings.Load();
            _chunk      = 0;
            _verifyTold = false;
            _voiceScore = null;
            _verifyPollCts?.Cancel();
            Api.BeginCall();
            if (_settings.Enabled)
                FamilyMessage?.Invoke($"Sending this call to {_settings.ApiRoot()} as {Api.CallId}");
            else
                FamilyMessage?.Invoke("Dashboard sending is off. Right-click the tray icon → Family dashboard settings.");
        }

        private static void OnRecordingStopped() => _verifyPollCts?.Cancel();

        private static void OnAiVoice(AiVoiceDetector.DetectorResult result)
        {
            if (result.Error == null) _voiceScore = result.AiProbability;
        }

        private static async void OnVerdict(ScamVerdict verdict, string callTime)
        {
            if (!_settings.Enabled) return;
            int chunk = Interlocked.Increment(ref _chunk);
            var (result, error) = await Api.SendVerdictAsync(_settings, verdict, chunk, null, _voiceScore);
            if (error != null)
            {
                FamilyMessage?.Invoke($"Dashboard: {error}");
                return;
            }
            if (result == null) return;

            FamilyMessage?.Invoke(ScamShieldApi.DescribeActions(result));
            if (!_verifyTold && !string.IsNullOrEmpty(Api.VerifyId))
                _ = PollVerifyAsync(Api.VerifyId);
        }

        private static async Task PollVerifyAsync(string verifyId)
        {
            _verifyPollCts?.Cancel();
            var cts = new CancellationTokenSource();
            _verifyPollCts = cts;
            try
            {
                while (!cts.IsCancellationRequested)
                {
                    await Task.Delay(2000, cts.Token);
                    var (verify, error) = await Api.GetVerifyAsync(_settings, verifyId);
                    if (error != null || verify == null) continue;

                    string status = (verify.Status ?? "").ToLowerInvariant();
                    if (status is not ("denied" or "confirmed" or "expired")) continue;

                    string who = string.IsNullOrWhiteSpace(verify.ClaimedMemberName) ? "Family" : verify.ClaimedMemberName;
                    string message = status switch
                    {
                        "denied"    => $"{who} said this is NOT them. Hang up now.",
                        "confirmed" => $"{who} confirmed it is them.",
                        _           => $"Nobody answered in time. Hang up and call {who} on the number you already have."
                    };
                    _verifyTold = true;
                    FamilyMessage?.Invoke(message);
                    return;
                }
            }
            catch (TaskCanceledException) { }
        }
    }
}
