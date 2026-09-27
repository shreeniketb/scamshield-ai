using System.Windows;

namespace ScamDetector
{
    public partial class KeySetupWindow : Window
    {
        public KeySetupWindow() => InitializeComponent();

        private void BtnSave_Click(object sender, RoutedEventArgs e)
        {
            if (string.IsNullOrWhiteSpace(TxtAssembly.Password) ||
                string.IsNullOrWhiteSpace(TxtGrok.Password))
            {
                TxtError.Text       = "Both keys are required.";
                TxtError.Visibility = Visibility.Visible;
                return;
            }

            var keys = new AppKeys
            {
                AssemblyAI = TxtAssembly.Password.Trim(),
                Grok       = TxtGrok.Password.Trim()
            };
            keys.Save();

            var dash = DashboardSettings.Load();
            if (!string.IsNullOrWhiteSpace(TxtDashboardUrl.Text))
                dash.ServerUrl = TxtDashboardUrl.Text.Trim();
            dash.Save();
            DashboardBridge.ReloadSettings();

            Close();
        }
    }
}
