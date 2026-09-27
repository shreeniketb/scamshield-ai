using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using System.Threading.Tasks;

namespace ScamDetector
{
    // SMS alert settings, saved in %AppData%\ScamDetector\alert_settings.json
    public class AlertSettings
    {
        public bool   Enabled       { get; set; }
        public bool   AlertOnMedium { get; set; }   // alert at medium risk too, not just high
        public string YourName      { get; set; } = "";   // used in the message: "Kale may be on a scam call"
        public string MyNumber      { get; set; } = "";   // for now, alerts go only to this number
        public string AccountSid    { get; set; } = "";   // from the Twilio Console
        public string AuthToken     { get; set; } = "";   // from the Twilio Console (keep secret)

        // For SMS, this must be the Twilio phone number you purchased/generated in your console
        public string FromNumber    { get; set; } = ""; 

        private static readonly string FilePath = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
            "ScamDetector", "alert_settings.json");

        public static AlertSettings Load()
        {
            try
            {
                if (File.Exists(FilePath))
                    return JsonSerializer.Deserialize<AlertSettings>(File.ReadAllText(FilePath)) ?? new();
            }
            catch { }
            return new AlertSettings();
        }

        public void Save()
        {
            Directory.CreateDirectory(Path.GetDirectoryName(FilePath)!);
            File.WriteAllText(FilePath, JsonSerializer.Serialize(this, new JsonSerializerOptions { WriteIndented = true }));
        }

        // Everyone who should get alerts.
        public List<string> Recipients() =>
            string.IsNullOrWhiteSpace(MyNumber) ? new List<string>() : new List<string> { MyNumber };

        public string? MissingSetup()
        {
            if (string.IsNullOrWhiteSpace(AccountSid)) return "Twilio Account SID is missing.";
            if (string.IsNullOrWhiteSpace(AuthToken))  return "Twilio Auth Token is missing.";
            if (string.IsNullOrWhiteSpace(FromNumber)) return "Twilio Sender number is missing.";
            if (Recipients().Count == 0)               return "Recipient phone number is missing.";
            return null;
        }
    }

    // Sends SMS messages through Twilio's REST API.
    public static class SmsAlerter
    {
        private static readonly HttpClient _http = new() { Timeout = TimeSpan.FromSeconds(30) };

        // Returns null on success, or an error message
        public static async Task<string?> SendAsync(AlertSettings s, string to, string body)
        {
            try
            {
                string url = $"https://api.twilio.com/2010-04-01/Accounts/{Uri.EscapeDataString(s.AccountSid.Trim())}/Messages.json";

                using var req = new HttpRequestMessage(HttpMethod.Post, url);
                string credentials = Convert.ToBase64String(
                    Encoding.ASCII.GetBytes($"{s.AccountSid.Trim()}:{s.AuthToken.Trim()}"));
                req.Headers.Authorization = new AuthenticationHeaderValue("Basic", credentials);
                
                req.Content = new FormUrlEncodedContent(new Dictionary<string, string>
                {
                    // Plain E.164 phone numbers (NO "whatsapp:" prefix)
                    ["To"]   = to.Trim(),
                    ["From"] = s.FromNumber.Trim(),
                    ["Body"] = body
                });

                using var resp = await _http.SendAsync(req);
                if (resp.IsSuccessStatusCode) return null;

                string respBody = await resp.Content.ReadAsStringAsync();
                try
                {
                    using var doc = JsonDocument.Parse(respBody);
                    var root = doc.RootElement;
                    string message = root.TryGetProperty("message", out var m) ? m.GetString() ?? "" : "";
                    int    code    = root.TryGetProperty("code", out var c) && c.ValueKind == JsonValueKind.Number
                                        ? c.GetInt32() : 0;

                    // SMS-specific error translations
                    return code switch
                    {
                        21608 => "This phone number is unverified on your Twilio Trial account. Add it under Phone Numbers > Verified Caller IDs in the Twilio Console.",
                        21211 => "Invalid phone number format. Ensure it includes the country code (e.g. +1...)",
                        _     => $"Twilio ({(int)resp.StatusCode}): {message}"
                    };
                }
                catch { }
                return $"Twilio request failed ({(int)resp.StatusCode}).";
            }
            catch (Exception ex)
            {
                return $"Couldn't reach Twilio: {ex.Message}";
            }
        }

        // Turns "404-555-1234" or "(404) 555 1234" into "+14045551234".
        public static string? NormalizeNumber(string input)
        {
            if (string.IsNullOrWhiteSpace(input)) return null;
            string trimmed = input.Trim();
            string digits  = new string(trimmed.Where(char.IsDigit).ToArray());

            if (trimmed.StartsWith("+")) return digits.Length >= 8 && digits.Length <= 15 ? "+" + digits : null;
            if (digits.Length == 10) return "+1" + digits;                           // US number without country code
            if (digits.Length == 11 && digits.StartsWith("1")) return "+" + digits;  // US with leading 1
            return null;
        }

        // Short and plain. No transcript: the person getting the alert only needs
        // enough to know to check in.
        // Assuming ScamVerdict is defined elsewhere in your namespace
        public static string BuildScamAlert(AlertSettings s, ScamVerdict v, string? caller)
        {
            string who = string.IsNullOrWhiteSpace(s.YourName) ? "Someone you look out for" : s.YourName.Trim();
            var sb = new StringBuilder();
            sb.Append($"🛡️ ScamShield alert: {who} may be on a scam call right now (risk {v.ScamLikelihood}/100).");
            if (!string.IsNullOrWhiteSpace(caller)) sb.Append($"\n\nCaller: {caller}");

            string why = (v.Summary ?? "").Trim();
            if (why.Length > 200) why = why[..197].TrimEnd() + "...";
            if (why.Length > 0) sb.Append($"\n\nWhy: {why}");

            sb.Append("\n\nConsider checking in with them.");
            return sb.ToString();
        }
    }
}