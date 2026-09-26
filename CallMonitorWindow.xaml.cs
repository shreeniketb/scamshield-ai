using System;
using System.Windows;
using System.Windows.Media;
using System.Windows.Threading;

namespace ScamDetector
{
    // Small always-on-top window shown while a call is being recorded:
    // recording status, the live scam verdict, and an "I recognize this number" button.
    public partial class CallMonitorWindow : Window
    {
        // Raised when the user clicks "I recognize this number"
        public event Action? RecognizedCaller;

        private readonly DispatcherTimer _clock;
        private readonly DateTime        _recordingStart;

        public CallMonitorWindow(DateTime recordingStart, string listeningMessage)
        {
            InitializeComponent();

            _recordingStart = recordingStart;
            ShowListening(listeningMessage);

            _clock = new DispatcherTimer { Interval = TimeSpan.FromSeconds(1) };
            _clock.Tick += (_, _) => UpdateClock();
            _clock.Start();
            UpdateClock();

            // Top-right corner, so it doesn't cover the WhatsApp call window
            Loaded += (_, _) =>
            {
                var area = SystemParameters.WorkArea;
                Left = area.Right - ActualWidth - 16;
                Top  = area.Top + 16;
            };
            Closed += (_, _) => _clock.Stop();
        }

        // ── Updates from the main window ──────────────────────────────────────
        public void SetCaller(string? text)
        {
            TxtCaller.Text       = text ?? "";
            TxtCaller.Visibility = string.IsNullOrWhiteSpace(text) ? Visibility.Collapsed : Visibility.Visible;
        }

        public void ShowListening(string message)
        {
            RiskBorder.BorderBrush  = new SolidColorBrush(Color.FromRgb(120, 120, 120));
            TxtRiskLevel.Text       = message;
            TxtRiskLevel.Foreground = new SolidColorBrush(Color.FromRgb(170, 170, 170));
            TxtRiskSummary.Text     = "";
            TxtRiskReasons.Text     = "";
            TxtRiskAction.Text      = "";
            ActionBox.Visibility    = Visibility.Collapsed;
        }

        public void ShowVerdict(string levelText, Color color, string summary, string reasons, string action)
        {
            RiskBorder.BorderBrush  = new SolidColorBrush(color);
            TxtRiskLevel.Text       = levelText;
            TxtRiskLevel.Foreground = new SolidColorBrush(color);
            TxtRiskSummary.Text     = summary;
            TxtRiskReasons.Text     = reasons;

            TxtRiskAction.Text    = action;
            ActionBox.BorderBrush = new SolidColorBrush(color);
            ActionBox.Visibility  = string.IsNullOrWhiteSpace(action) ? Visibility.Collapsed : Visibility.Visible;
        }

        public void AppendNote(string note)
        {
            TxtRiskSummary.Text = string.IsNullOrEmpty(TxtRiskSummary.Text)
                ? note : TxtRiskSummary.Text + "\n" + note;
        }

        // Call ended normally: keep the window open so the final verdict can be read
        public void MarkRecordingStopped(string message)
        {
            _clock.Stop();
            UpdateClock();
            RecordingDot.Fill       = new SolidColorBrush(Color.FromRgb(120, 120, 120));
            RecordingDot.Opacity    = 1;
            RecordingBanner.Background = new SolidColorBrush(Color.FromRgb(45, 45, 48));
            TxtRecordingState.Text  = message;

            BtnRecognize.Visibility     = Visibility.Collapsed;
            TxtRecognizeNote.Visibility = Visibility.Collapsed;
            BtnClose.Visibility         = Visibility.Visible;
        }

        public void SetRecordingState(string message) => TxtRecordingState.Text = message;

        // ── Internals ─────────────────────────────────────────────────────────
        private void UpdateClock()
        {
            TimeSpan t = DateTime.Now - _recordingStart;
            if (t < TimeSpan.Zero) t = TimeSpan.Zero;
            TxtTimer.Text = t.TotalHours >= 1
                ? $"{(int)t.TotalHours}:{t.Minutes:00}:{t.Seconds:00}"
                : $"{(int)t.TotalMinutes}:{t.Seconds:00}";

            // Blink the red dot while recording
            if (_clock.IsEnabled)
                RecordingDot.Opacity = RecordingDot.Opacity > 0.5 ? 0.35 : 1.0;
        }

        private void BtnRecognize_Click(object sender, RoutedEventArgs e)
        {
            RecognizedCaller?.Invoke();
            Close();
        }

        private void BtnClose_Click(object sender, RoutedEventArgs e) => Close();
    }
}
