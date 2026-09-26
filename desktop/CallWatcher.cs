using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Linq;
using System.Text.RegularExpressions;
using System.Threading;
using System.Windows.Automation;
using Microsoft.Win32;

namespace ScamDetector
{
    // What the watcher figured out about who's on the call.
    // IsContact: true = name shown (saved contact), false = number shown (unknown), null = couldn't tell
    public record CallerInfo(string? Display, bool? IsContact, string Reason);

    // Watches for WhatsApp desktop calls:
    //   1. Call start/end: Windows tracks which app is using the microphone in the
    //      registry. WhatsApp grabbing the mic = call started; releasing it = call ended.
    //   2. Caller: when a call starts, reads the text in WhatsApp's call window
    //      (the same way screen readers do) and checks for a number vs. a name.
    public class CallWatcher : IDisposable
    {
        public event Action<string>?     StatusMessage;
        public event Action<CallerInfo>? CallStarted;
        public event Action?             CallEnded;

        private const string MicKey =
            @"SOFTWARE\Microsoft\Windows\CurrentVersion\CapabilityAccessManager\ConsentStore\microphone";

        private System.Threading.Timer? _pollTimer;
        private int      _polling;            // stops polls from overlapping
        private bool     _callActive;
        private bool     _identified;
        private DateTime _identifyDeadline;
        private int      _micOffCount;
        private readonly Dictionary<int, bool> _whatsAppPids = new();

        public void Start()
        {
            _pollTimer = new System.Threading.Timer(_ => Poll(), null,
                TimeSpan.FromSeconds(1), TimeSpan.FromSeconds(1));
            StatusMessage?.Invoke("Watching for WhatsApp calls.");
        }

        public void Dispose()
        {
            _pollTimer?.Dispose();
            _pollTimer = null;
        }

        // ── Runs every second ─────────────────────────────────────────────────
        private void Poll()
        {
            if (Interlocked.Exchange(ref _polling, 1) == 1) return;

            try
            {
                bool micInUse = IsWhatsAppUsingMic();

                if (micInUse)
                {
                    _micOffCount = 0;

                    if (!_callActive)
                    {
                        _callActive       = true;
                        _identified       = false;
                        _identifyDeadline = DateTime.Now.AddSeconds(6);
                        StatusMessage?.Invoke("WhatsApp started using the microphone. Reading who's on the call...");
                    }

                    // Keep trying for a few seconds, since the call window may still be opening
                    if (!_identified)
                    {
                        var texts = ReadWhatsAppCallText(out string windowList);
                        var info  = Classify(texts);

                        if (info.IsContact != null || DateTime.Now >= _identifyDeadline)
                        {
                            _identified = true;
                            StatusMessage?.Invoke($"WhatsApp windows: {windowList}");
                            StatusMessage?.Invoke("Text read: " +
                                (texts.Count > 0 ? string.Join(" | ", texts.Take(30)) : "(none)"));
                            StatusMessage?.Invoke($"Result: {info.Reason}");
                            CallStarted?.Invoke(info);
                        }
                    }
                }
                else if (_callActive && ++_micOffCount >= 3)
                {
                    // 3 seconds without the mic = call really ended (not a brief glitch)
                    _callActive = false;
                    StatusMessage?.Invoke("WhatsApp released the microphone. Call ended.");
                    CallEnded?.Invoke();
                }
            }
            catch (Exception ex)
            {
                StatusMessage?.Invoke($"Watcher error: {ex.Message}");
            }
            finally
            {
                Interlocked.Exchange(ref _polling, 0);
            }
        }

        // ── 1. Is WhatsApp using the microphone right now? ────────────────────
        private static bool IsWhatsAppUsingMic()
        {
            using var mic = Registry.CurrentUser.OpenSubKey(MicKey);
            if (mic == null) return false;

            foreach (string name in mic.GetSubKeyNames())
            {
                if (name.Equals("NonPackaged", StringComparison.OrdinalIgnoreCase))
                {
                    // Regular desktop apps are listed under NonPackaged by exe path
                    using var np = mic.OpenSubKey(name);
                    if (np == null) continue;
                    foreach (string sub in np.GetSubKeyNames())
                        if (sub.Contains("whatsapp", StringComparison.OrdinalIgnoreCase) && InUse(np, sub))
                            return true;
                }
                else if (name.Contains("whatsapp", StringComparison.OrdinalIgnoreCase) && InUse(mic, name))
                {
                    // Microsoft Store apps (like WhatsApp) are listed by package name
                    return true;
                }
            }
            return false;
        }

        // Windows sets LastUsedTimeStop to 0 while an app is actively using the mic
        private static bool InUse(RegistryKey parent, string subKey)
        {
            using var key = parent.OpenSubKey(subKey);
            if (key == null) return false;
            long start = ToLong(key.GetValue("LastUsedTimeStart"));
            long stop  = ToLong(key.GetValue("LastUsedTimeStop"));
            return start > 0 && stop == 0;
        }

        private static long ToLong(object? value) => value switch
        {
            long l                    => l,
            int i                     => i,
            byte[] b when b.Length >= 8 => BitConverter.ToInt64(b, 0),
            _                         => -1
        };

        // ── 2. Read the text in WhatsApp's call window ────────────────────────
        private List<string> ReadWhatsAppCallText(out string windowList)
        {
            var texts   = new List<string>();
            var titles  = new List<string>();

            var windows = AutomationElement.RootElement.FindAll(TreeScope.Children, Condition.TrueCondition);
            foreach (AutomationElement window in windows)
            {
                int    pid;
                string title;
                try
                {
                    pid   = window.Current.ProcessId;
                    title = (window.Current.Name ?? "").Trim();
                }
                catch { continue; }

                if (!IsWhatsAppProcess(pid)) continue;
                titles.Add($"'{title}'");

                // The main window is titled just "WhatsApp" and contains your whole chat
                // list, which can include unsaved numbers. Skipping it avoids false
                // "unknown caller" results from numbers that aren't on the call.
                if (title.Equals("WhatsApp", StringComparison.OrdinalIgnoreCase)) continue;

                if (title.Length > 0) texts.Add(title);
                CollectText(window, texts, maxElements: 300);
            }

            windowList = titles.Count > 0 ? string.Join(", ", titles) : "(no WhatsApp windows found)";
            return texts.Distinct().ToList();
        }

        private static void CollectText(AutomationElement root, List<string> texts, int maxElements)
        {
            var walker  = TreeWalker.ControlViewWalker;
            var pending = new Stack<AutomationElement>();
            pending.Push(root);
            int visited = 0;

            while (pending.Count > 0 && visited < maxElements)
            {
                var element = pending.Pop();
                visited++;

                try
                {
                    string name = element.Current.Name;
                    if (!string.IsNullOrWhiteSpace(name) && name.Length <= 80)
                        texts.Add(name.Trim());
                }
                catch { }

                try
                {
                    var child = walker.GetFirstChild(element);
                    while (child != null)
                    {
                        pending.Push(child);
                        child = walker.GetNextSibling(child);
                    }
                }
                catch { }
            }
        }

        private bool IsWhatsAppProcess(int pid)
        {
            if (_whatsAppPids.TryGetValue(pid, out bool cached)) return cached;
            bool result;
            try { result = Process.GetProcessById(pid).ProcessName.Contains("whatsapp", StringComparison.OrdinalIgnoreCase); }
            catch { result = false; }
            _whatsAppPids[pid] = result;
            return result;
        }

        // ── 3. Number or name? ────────────────────────────────────────────────
        private static readonly Regex PhoneNumber = new(@"\+?\(?\d[\d\s().\-]{5,}\d");
        private static readonly Regex CallTimer   = new(@"^\d{1,2}:\d{2}(:\d{2})?$");

        // Buttons and labels in the call window that aren't the caller
        private static readonly string[] NotACallerExact =
        {
            "call", "calling", "ringing", "connecting", "reconnecting", "mute", "unmute",
            "camera", "speaker", "accept", "decline", "close", "minimize", "maximize",
            "restore", "hold", "more options", "end", "video", "voice"
        };
        private static readonly string[] NotACallerContains =
        {
            "whatsapp", "voice call", "video call", "end call", "end-to-end", "encrypted",
            "add participant", "screen share", "microphone", "incoming"
        };

        public static CallerInfo Classify(List<string> texts)
        {
            // A phone number anywhere in the call window = not a saved contact
            foreach (string t in texts)
            {
                foreach (Match m in PhoneNumber.Matches(t))
                {
                    if (m.Value.Count(char.IsDigit) >= 7)
                    {
                        string number = m.Value.Trim();
                        return new CallerInfo(number, false,
                            $"Caller shown as a phone number ({number}): not a saved contact.");
                    }
                }
            }

            // WhatsApp puts ~ before the profile name of people who aren't in your contacts
            string? tilde = texts.FirstOrDefault(t => t.StartsWith("~"));
            if (tilde != null)
                return new CallerInfo(tilde, false,
                    $"Caller shown as '{tilde}' (WhatsApp's ~ marks someone not in your contacts).");

            string? name = texts.FirstOrDefault(IsLikelyName);
            if (name != null)
                return new CallerInfo(name, true,
                    $"Caller shown as a name ('{name}'): treated as a saved contact.");

            return new CallerInfo(null, null,
                "Couldn't find a caller name or number in WhatsApp's call window.");
        }

        private static bool IsLikelyName(string text)
        {
            string s = text.Trim();
            if (s.Length < 2 || s.Length > 50) return false;
            if (CallTimer.IsMatch(s)) return false;

            string lower = s.ToLowerInvariant();
            if (NotACallerExact.Contains(lower)) return false;
            if (NotACallerContains.Any(w => lower.Contains(w))) return false;

            return s.Any(char.IsLetter);
        }
    }
}
