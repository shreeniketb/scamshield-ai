using System;
using System.Drawing;
using System.IO;
using System.Text.Json;
using System.Windows;
using System.Windows.Forms;
using Application = System.Windows.Application;
using MessageBox = System.Windows.MessageBox;

namespace ScamDetector
{
    public partial class App : Application
    {
        private NotifyIcon?    _trayIcon;
        private CallMonitorWindow? _monitor;

        // Keys are loaded once at startup and passed to MainLogic
        public static AppKeys Keys { get; private set; } = new();

        protected override void OnStartup(StartupEventArgs e)
        {
            base.OnStartup(e);

            // Load API keys from %AppData%\ScamDetector\keys.json
            Keys = AppKeys.Load();

            // If keys are missing, show a one-time setup window
            if (!Keys.AreComplete)
            {
                var setup = new KeySetupWindow();
                setup.ShowDialog();
                Keys = AppKeys.Load();

                if (!Keys.AreComplete)
                {
                    MessageBox.Show("ScamShield needs API keys to run. Exiting.");
                    Shutdown();
                    return;
                }
            }

            // Start the main logic (recording, detection, watcher) hidden
            MainLogic.Initialize(OpenMonitor);
            DashboardBridge.Attach();

            // Build tray icon
            var bitmap = new Bitmap(16, 16);
            using (var g = Graphics.FromImage(bitmap))
            {
                g.Clear(Color.FromArgb(40, 167, 69));
                using var brush = new SolidBrush(Color.White);
                g.FillEllipse(brush, 3, 3, 10, 10);
            }

            _trayIcon = new NotifyIcon
            {
                Icon    = Icon.FromHandle(bitmap.GetHicon()),
                Text    = "ScamShield — running",
                Visible = true
            };

            _trayIcon.Click += (s, ev) =>
            {
                if (ev is MouseEventArgs me && me.Button == MouseButtons.Left)
                    OpenMonitor();
            };

            _trayIcon.ContextMenuStrip = BuildMenu();
        }

        private ContextMenuStrip BuildMenu()
        {
            var menu = new ContextMenuStrip();
            menu.Items.Add("Open ScamShield", null, (_, _) => OpenMonitor());
            menu.Items.Add("Family dashboard settings", null, (_, _) => OpenDashboardSettings());
            menu.Items.Add(new ToolStripSeparator());
            menu.Items.Add("Quit", null, (_, _) =>
            {
                _trayIcon!.Visible = false;
                MainLogic.Shutdown();
                Shutdown();
            });
            return menu;
        }

        private void OpenDashboardSettings()
        {
            Current.Dispatcher.Invoke(() =>
            {
                var win = new DashboardSettingsWindow();
                win.ShowDialog();
            });
        }

        public void OpenMonitor()
        {
            Current.Dispatcher.Invoke(() =>
            {
                if (_monitor != null && _monitor.IsVisible)
                {
                    _monitor.Activate();
                    return;
                }

                _monitor = new CallMonitorWindow();
                _monitor.Show();
            });
        }

        protected override void OnExit(ExitEventArgs e)
        {
            _trayIcon?.Dispose();
            base.OnExit(e);
        }
    }

    // ── API key model ──────────────────────────────────────────────────────────
    public class AppKeys
    {
        public string AssemblyAI { get; set; } = "";
        public string Grok       { get; set; } = "";

        public bool AreComplete =>
            !string.IsNullOrWhiteSpace(AssemblyAI) &&
            !string.IsNullOrWhiteSpace(Grok);

        private static readonly string FilePath = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
            "ScamDetector", "keys.json");

        public static AppKeys Load()
        {
            try
            {
                if (File.Exists(FilePath))
                    return JsonSerializer.Deserialize<AppKeys>(File.ReadAllText(FilePath)) ?? new();
            }
            catch { }
            return new AppKeys();
        }

        public void Save()
        {
            Directory.CreateDirectory(Path.GetDirectoryName(FilePath)!);
            File.WriteAllText(FilePath,
                JsonSerializer.Serialize(this, new JsonSerializerOptions { WriteIndented = true }));
        }
    }
}
