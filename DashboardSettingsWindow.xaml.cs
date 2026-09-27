using System;
using System.Net.Http;
using System.Windows;

namespace ScamDetector
{
    public partial class DashboardSettingsWindow : Window
    {
        public DashboardSettingsWindow()
        {
            InitializeComponent();
            var s = DashboardSettings.Load();
            ChkEnabled.IsChecked = s.Enabled;
            TxtUrl.Text = string.IsNullOrWhiteSpace(s.ServerUrl) ? "http://localhost:3000" : s.ServerUrl;
        }

        private DashboardSettings FromUi()
        {
            return new DashboardSettings
            {
                Enabled     = ChkEnabled.IsChecked == true,
                ServerUrl   = string.IsNullOrWhiteSpace(TxtUrl.Text) ? "http://localhost:3000" : TxtUrl.Text.Trim().TrimEnd('/'),
                CircleId    = "circle_nani",
                SeniorId    = "u_nani",
                DeviceToken = DashboardSettings.Load().DeviceToken
            };
        }

        private void BtnSave_Click(object sender, RoutedEventArgs e)
        {
            var s = FromUi();
            s.Save();
            DashboardBridge.ReloadSettings();
            TxtStatus.Text = $"Saved. Verdicts will go to {s.ApiRoot()}/events/call_analysis";
        }

        private async void BtnTest_Click(object sender, RoutedEventArgs e)
        {
            var s = FromUi();
            TxtStatus.Text = "Checking...";
            try
            {
                using var http = new HttpClient { Timeout = TimeSpan.FromSeconds(12) };
                using var resp = await http.GetAsync(s.ApiRoot() + "/circle/circle_nani");
                TxtStatus.Text = resp.IsSuccessStatusCode
                    ? $"Connected. The family site at {s.ServerUrl} can receive calls."
                    : $"The site replied {(int)resp.StatusCode}. Check the URL (no /family at the end).";
            }
            catch (Exception ex)
            {
                TxtStatus.Text = $"Could not reach that URL. If Kale and the dashboard are on different laptops, localhost will not work — paste the Vercel URL. ({ex.Message})";
            }
        }
    }
}
