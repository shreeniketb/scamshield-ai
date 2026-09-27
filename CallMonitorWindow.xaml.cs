using System;
using System.ComponentModel;
using System.Windows;
using System.Windows.Media;
using System.Windows.Threading;
using Color = System.Windows.Media.Color;
using MessageBox = System.Windows.MessageBox;

namespace ScamDetector
{
    public partial class CallMonitorWindow : Window
    {
        private readonly DispatcherTimer _clock = new() { Interval = TimeSpan.FromSeconds(1) };
        private DateTime _recordingStart;
        private bool     _isRecording;
        private bool     _forceClose;

        public CallMonitorWindow()
        {
            InitializeComponent();

            // Subscribe to MainLogic events
            MainLogic.StatusChanged   += OnStatus;
            MainLogic.VerdictReady    += OnVerdict;
            MainLogic.AiVoiceReady    += OnAiVoice;
            MainLogic.GrokError       += OnGrokError;
            MainLogic.RecordingStarted += OnRecordingStarted;
            MainLogic.RecordingStopped += OnRecordingStopped;
            MainLogic.VerdictReset     += OnVerdictReset;
            MainLogic.AiVoiceError     += OnAiVoiceError;
            DashboardBridge.FamilyMessage += OnFamilyMessage;

            _clock.Tick += (_, _) => UpdateClock();

            // Position top-right
            Loaded += (_, _) =>
            {
                var area = SystemParameters.WorkArea;
                Left = area.Right - ActualWidth - 16;
                Top  = area.Top + 16;
            };

            // Sync initial state in case recording was already active
            if (MainLogic.IsRecording) OnRecordingStarted();
            else SetIdleState();
        }

        // ── Recording state ───────────────────────────────────────────────────
        private void OnRecordingStarted()
        {
            Dispatcher.Invoke(() =>
            {
                _isRecording    = true;
                _recordingStart = DateTime.Now;
                _clock.Start();
                UpdateClock();

                RecordingDot.Fill       = new SolidColorBrush(Color.FromRgb(220, 53, 69));
                RecordingBanner.Background = new SolidColorBrush(Color.FromRgb(58, 30, 34));
                TxtRecordingState.Text  = "Recording in progress";

                BtnAction.Content    = "⏹  Stop Recording";
                BtnAction.Background = new SolidColorBrush(Color.FromRgb(220, 53, 69));

                TxtDisclaimer.Visibility = Visibility.Visible;
            });
        }

        private void OnRecordingStopped()
        {
            Dispatcher.Invoke(() =>
            {
                _isRecording = false;
                _clock.Stop();
                RecordingDot.Opacity    = 1;
                RecordingDot.Fill       = new SolidColorBrush(Color.FromRgb(85, 85, 85));
                RecordingBanner.Background = new SolidColorBrush(Color.FromRgb(37, 37, 38));
                TxtRecordingState.Text  = "Recording stopped.";
                TxtTimer.Text           = "";
                SetIdleState();
            });
        }

        private void SetIdleState()
        {
            BtnAction.Content    = "▶  Start Recording";
            BtnAction.Background = new SolidColorBrush(Color.FromRgb(40, 167, 69));
            TxtDisclaimer.Visibility = Visibility.Collapsed;
            TxtCaller.Visibility     = Visibility.Collapsed;
        }

        // ── Button ────────────────────────────────────────────────────────────
        private async void BtnAction_Click(object sender, RoutedEventArgs e)
        {
            if (_isRecording)
                await MainLogic.StopAsync(discard: false);
            else
                MainLogic.StartRecording();
        }

        // ── MainLogic event handlers ──────────────────────────────────────────
        private void OnStatus(string msg) =>
            Dispatcher.Invoke(() => TxtRecordingState.Text = msg);

        private void OnVerdict(ScamVerdict v, string callTime)
        {
            Dispatcher.Invoke(() =>
            {
                var (levelText, color, summary, reasons, action) = MainLogic.FormatVerdict(v, callTime);

                RecordingBanner.Background = new SolidColorBrush(Color.FromArgb(60, color.R, color.G, color.B));
                RiskBorder.BorderBrush     = new SolidColorBrush(color);
                TxtRiskLevel.Text          = levelText;
                TxtRiskLevel.Foreground    = new SolidColorBrush(color);
                TxtRiskSummary.Text        = summary;
                TxtRiskReasons.Text        = reasons;
                TxtRiskAction.Text         = action;
                ActionBox.BorderBrush      = new SolidColorBrush(color);
                ActionBox.Visibility       = action.Length > 0 ? Visibility.Visible : Visibility.Collapsed;
            });
        }

        private void OnAiVoice(AiVoiceDetector.DetectorResult r)
        {
            Dispatcher.Invoke(() =>
            {
                string label = r.RiskLabel switch
                {
                    "High"   => "HIGH — likely AI-generated",
                    "Medium" => "MEDIUM — uncertain",
                    "Low"    => "LOW — likely human",
                    _        => "Unknown"
                };
                var color = r.RiskLabel switch
                {
                    "High"   => Color.FromRgb(220, 53, 69),
                    "Medium" => Color.FromRgb(255, 193, 7),
                    "Low"    => Color.FromRgb(40, 167, 69),
                    _        => Color.FromRgb(120, 120, 120)
                };

                TxtAiVoiceResult.Text       = label;
                TxtAiVoiceResult.Foreground = new SolidColorBrush(color);
                TxtAiVoiceDetail.Text       = $"AI: {r.AiProbability * 100:F1}%  |  Human: {(1 - r.AiProbability) * 100:F1}%";
                AiVoiceBorder.BorderBrush   = new SolidColorBrush(color);
                AiVoiceBorder.Visibility    = Visibility.Visible;
            });
        }

        private void OnVerdictReset(string message)
        {
            Dispatcher.Invoke(() =>
            {
                RiskBorder.BorderBrush  = new SolidColorBrush(Color.FromRgb(85, 85, 85));
                TxtRiskLevel.Text       = message;
                TxtRiskLevel.Foreground = new SolidColorBrush(Color.FromRgb(170, 170, 170));
                TxtRiskSummary.Text     = "";
                TxtRiskReasons.Text     = "";
                TxtRiskAction.Text      = "";
                ActionBox.Visibility    = Visibility.Collapsed;
                AiVoiceBorder.Visibility = Visibility.Collapsed;
            });
        }

        private void OnAiVoiceError(string error)
        {
            Dispatcher.Invoke(() =>
            {
                TxtAiVoiceResult.Text       = "Could not analyze voice";
                TxtAiVoiceResult.Foreground = new SolidColorBrush(Color.FromRgb(170, 170, 170));
                TxtAiVoiceDetail.Text       = error;
                AiVoiceBorder.BorderBrush   = new SolidColorBrush(Color.FromRgb(120, 120, 120));
                AiVoiceBorder.Visibility    = Visibility.Visible;
            });
        }

        private void OnGrokError(string error) =>
            Dispatcher.Invoke(() =>
            {
                string note = $"⚠ Grok check failed: {error}";
                TxtRiskSummary.Text = string.IsNullOrEmpty(TxtRiskSummary.Text)
                    ? note : TxtRiskSummary.Text + "\n" + note;
            });

        private void OnFamilyMessage(string message) =>
            Dispatcher.Invoke(() =>
            {
                TxtRiskSummary.Text = string.IsNullOrEmpty(TxtRiskSummary.Text)
                    ? message : TxtRiskSummary.Text + "\n" + message;
            });

        // ── Clock ─────────────────────────────────────────────────────────────
        private void UpdateClock()
        {
            TimeSpan t = DateTime.Now - _recordingStart;
            if (t < TimeSpan.Zero) t = TimeSpan.Zero;
            TxtTimer.Text = t.TotalHours >= 1
                ? $"{(int)t.TotalHours}:{t.Minutes:00}:{t.Seconds:00}"
                : $"{(int)t.TotalMinutes}:{t.Seconds:00}";

            // Blink dot while recording
            if (_isRecording)
                RecordingDot.Opacity = RecordingDot.Opacity > 0.5 ? 0.35 : 1.0;
        }

        // ── Close handling ────────────────────────────────────────────────────
        private void Window_Closing(object sender, CancelEventArgs e)
        {
            if (_forceClose) { Unsubscribe(); return; }

            if (_isRecording)
            {
                var result = MessageBox.Show(
                    "Recording is currently active. Closing this window will stop the recording.\n\nAre you sure?",
                    "ScamShield — Stop Recording?",
                    MessageBoxButton.YesNo,
                    MessageBoxImage.Warning);

                if (result == MessageBoxResult.No) { e.Cancel = true; return; }

                _ = MainLogic.StopAsync(discard: false);
            }

            Unsubscribe();
        }

        private void Unsubscribe()
        {
            MainLogic.StatusChanged    -= OnStatus;
            MainLogic.VerdictReady     -= OnVerdict;
            MainLogic.AiVoiceReady     -= OnAiVoice;
            MainLogic.GrokError        -= OnGrokError;
            MainLogic.RecordingStarted -= OnRecordingStarted;
            MainLogic.RecordingStopped -= OnRecordingStopped;
            MainLogic.VerdictReset     -= OnVerdictReset;
            MainLogic.AiVoiceError     -= OnAiVoiceError;
            DashboardBridge.FamilyMessage -= OnFamilyMessage;
        }

        public void ForceClose() { _forceClose = true; Close(); }

        public void SetCaller(string? text)
        {
            Dispatcher.Invoke(() =>
            {
                TxtCaller.Text       = text ?? "";
                TxtCaller.Visibility = string.IsNullOrWhiteSpace(text)
                    ? Visibility.Collapsed : Visibility.Visible;
            });
        }
    }
}
