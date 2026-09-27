using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Net.Http;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Threading.Tasks;

namespace ScamDetector
{
    // Dashboard connection, saved in %AppData%\ScamDetector\dashboard_settings.json
    public class DashboardSettings
    {
        public bool   Enabled     { get; set; } = true;
        public string ServerUrl   { get; set; } = "http://localhost:3000";
        public string CircleId    { get; set; } = "circle_nani";
        public string SeniorId    { get; set; } = "u_nani";
        public string DeviceToken { get; set; } = "";

        private static readonly string FilePath = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
            "ScamDetector", "dashboard_settings.json");

        public static DashboardSettings Load()
        {
            try
            {
                if (File.Exists(FilePath))
                    return JsonSerializer.Deserialize<DashboardSettings>(File.ReadAllText(FilePath)) ?? new();
            }
            catch { }
            return new DashboardSettings();
        }

        public void Save()
        {
            Directory.CreateDirectory(Path.GetDirectoryName(FilePath)!);
            File.WriteAllText(FilePath, JsonSerializer.Serialize(this, new JsonSerializerOptions { WriteIndented = true }));
        }

        public string ApiRoot()
        {
            string root = (ServerUrl ?? "").Trim().TrimEnd('/');
            if (root.Length == 0) root = "http://localhost:3000";
            return root + "/api";
        }
    }

    public class DashboardAction
    {
        [JsonPropertyName("type")]      public string  Type     { get; set; } = "";
        [JsonPropertyName("message")]   public string? Message  { get; set; }
        [JsonPropertyName("member_id")] public string? MemberId { get; set; }
        [JsonPropertyName("verify_id")] public string? VerifyId { get; set; }
        [JsonPropertyName("severity")]  public string? Severity { get; set; }
    }

    public class DashboardEventResponse
    {
        [JsonPropertyName("ok")]      public bool Ok { get; set; }
        [JsonPropertyName("risk")]    public double Risk { get; set; }
        [JsonPropertyName("actions")] public List<DashboardAction> Actions { get; set; } = new();
    }

    public class DashboardVerify
    {
        [JsonPropertyName("id")]                  public string  Id                { get; set; } = "";
        [JsonPropertyName("status")]              public string  Status            { get; set; } = "";
        [JsonPropertyName("claimed_member_name")] public string? ClaimedMemberName { get; set; }
    }

    public class DashboardMember
    {
        [JsonPropertyName("id")]         public string Id { get; set; } = "";
        [JsonPropertyName("name")]       public string Name { get; set; } = "";
        [JsonPropertyName("relation")]   public string Relation { get; set; } = "";
        [JsonPropertyName("phone")]      public string Phone { get; set; } = "";
        [JsonPropertyName("can_verify")] public bool CanVerify { get; set; }
    }

    public class DashboardRules
    {
        [JsonPropertyName("protection_method")] public string? ProtectionMethod { get; set; }
    }

    public class DashboardCircleSettings
    {
        [JsonPropertyName("members")] public List<DashboardMember> Members { get; set; } = new();
        [JsonPropertyName("rules")]   public DashboardRules Rules { get; set; } = new();
    }

    public class DashboardSafeWord
    {
        [JsonPropertyName("safe_word")] public string? SafeWord { get; set; }
    }

    // Talks to the family web app. Kale's recording, scoring, and pop-up stay in their own files.
    public class ScamShieldApi
    {
        private static readonly HttpClient Http = new() { Timeout = TimeSpan.FromSeconds(20) };
        private static readonly JsonSerializerOptions JsonOptions = new()
        {
            DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull
        };

        public string  CallId   { get; private set; } = "";
        public string? VerifyId { get; private set; }

        public void BeginCall()
        {
            CallId   = $"call_{DateTime.UtcNow:yyyyMMdd_HHmmss}_{Guid.NewGuid().ToString("N")[..4]}";
            VerifyId = null;
        }

        public async Task<(DashboardEventResponse? result, string? error)> SendVerdictAsync(
            DashboardSettings settings,
            ScamVerdict verdict,
            int chunkIndex,
            string? caller,
            double? voiceScore,
            string? transcript = null,
            int? durationSeconds = null,
            DateTime? startedAtUtc = null,
            bool knownCaller = false)
        {
            if (!settings.Enabled) return (null, "Dashboard sending is turned off.");
            if (string.IsNullOrEmpty(CallId)) BeginCall();

            string explanation = verdict.Summary ?? "";
            if (knownCaller)
            {
                const string note = "Recording was stopped manually — the listener recognized the caller.";
                if (!explanation.Contains(note, StringComparison.Ordinal))
                    explanation = string.IsNullOrWhiteSpace(explanation) ? note : explanation.Trim() + " " + note;
            }

            var body = new Dictionary<string, object?>
            {
                ["id"]                    = CallId,
                ["circle_id"]             = settings.CircleId.Trim(),
                ["senior_id"]             = settings.SeniorId.Trim(),
                ["channel"]               = "whatsapp_call",
                ["caller"]                = caller ?? "",
                ["caller_id_status"]      = "not_applicable",
                ["chunk_index"]           = chunkIndex,
                ["created_at"]            = DateTime.UtcNow.ToString("yyyy-MM-ddTHH:mm:ssZ"),
                ["started_at"]            = (startedAtUtc ?? DateTime.UtcNow).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ"),
                ["duration_s"]            = Math.Max(0, durationSeconds ?? 0),
                ["transcript"]            = transcript ?? "",
                ["risk"]                  = knownCaller ? 0.1 : Math.Clamp(verdict.ScamLikelihood, 0, 100) / 100.0,
                ["voice_synthetic_score"] = voiceScore,
                ["scam_type"]             = Blank(verdict.ScamType),
                ["claimed_identity"]      = Blank(verdict.ClaimedIdentity),
                ["claimed_organization"]  = Blank(verdict.ClaimedOrganization),
                ["requested_amount"]      = knownCaller || verdict.RequestedAmount <= 0 ? null : verdict.RequestedAmount,
                ["payment_method"]        = Blank(verdict.PaymentMethod),
                ["script_cues"]           = verdict.Reasons.Select(r => r.Category).Where(c => c.Length > 0).Distinct().ToList(),
                ["transcript_snippet"]    = NewestQuote(verdict),
                ["explanation"]           = explanation,
                ["recommended_action"]    = FamilyDashboardContext.EnrichAction(verdict.RecommendedAction, verdict),
                ["reasons"]               = verdict.Reasons,
                ["manual_stop"]           = knownCaller ? true : null
            };

            try
            {
                using var req = new HttpRequestMessage(HttpMethod.Post, settings.ApiRoot() + "/events/call_analysis");
                req.Content = new StringContent(JsonSerializer.Serialize(body, JsonOptions), Encoding.UTF8, "application/json");
                if (settings.DeviceToken.Trim().Length > 0)
                    req.Headers.TryAddWithoutValidation("X-Device-Token", settings.DeviceToken.Trim());

                using var resp = await Http.SendAsync(req);
                string text = await resp.Content.ReadAsStringAsync();
                if (!resp.IsSuccessStatusCode)
                    return (null, $"Dashboard {(int)resp.StatusCode}: {Short(text)}");

                var parsed = JsonSerializer.Deserialize<DashboardEventResponse>(text);
                if (parsed == null) return (null, "Dashboard returned an empty answer.");

                string? verifyId = parsed.Actions.FirstOrDefault(a => a.Type == "verify_member")?.VerifyId;
                if (!string.IsNullOrEmpty(verifyId)) VerifyId = verifyId;
                return (parsed, null);
            }
            catch (Exception ex)
            {
                return (null, $"Couldn't reach the dashboard: {ex.Message}");
            }
        }

        public async Task<(DashboardEventResponse? result, string? error)> SendManualStopAsync(
            DashboardSettings settings,
            int chunkIndex,
            string? transcript,
            int? durationSeconds,
            DateTime? startedAtUtc)
        {
            if (!settings.Enabled) return (null, "Dashboard sending is turned off.");
            if (string.IsNullOrEmpty(CallId)) return (null, "No call in progress.");

            var body = new Dictionary<string, object?>
            {
                ["id"]           = CallId,
                ["circle_id"]    = settings.CircleId.Trim(),
                ["senior_id"]    = settings.SeniorId.Trim(),
                ["channel"]      = "whatsapp_call",
                ["caller"]       = "",
                ["chunk_index"]  = chunkIndex,
                ["created_at"]   = DateTime.UtcNow.ToString("yyyy-MM-ddTHH:mm:ssZ"),
                ["started_at"]   = (startedAtUtc ?? DateTime.UtcNow).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ"),
                ["duration_s"]   = Math.Max(0, durationSeconds ?? 0),
                ["transcript"]   = transcript ?? "",
                ["risk"]         = 0.1,
                ["explanation"]  = "Recording was stopped manually — the listener recognized the caller.",
                ["manual_stop"]  = true
            };

            try
            {
                using var req = new HttpRequestMessage(HttpMethod.Post, settings.ApiRoot() + "/events/call_analysis");
                req.Content = new StringContent(JsonSerializer.Serialize(body, JsonOptions), Encoding.UTF8, "application/json");
                if (settings.DeviceToken.Trim().Length > 0)
                    req.Headers.TryAddWithoutValidation("X-Device-Token", settings.DeviceToken.Trim());
                using var resp = await Http.SendAsync(req);
                string text = await resp.Content.ReadAsStringAsync();
                if (!resp.IsSuccessStatusCode)
                    return (null, $"Dashboard {(int)resp.StatusCode}: {Short(text)}");
                return (JsonSerializer.Deserialize<DashboardEventResponse>(text), null);
            }
            catch (Exception ex)
            {
                return (null, $"Couldn't reach the dashboard: {ex.Message}");
            }
        }

        public async Task<(DashboardCircleSettings? settings, string? error)> GetCircleSettingsAsync(DashboardSettings settings)
        {
            try
            {
                using var req = new HttpRequestMessage(HttpMethod.Get, settings.ApiRoot() + "/circle/" + Uri.EscapeDataString(settings.CircleId.Trim()) + "/settings");
                if (settings.DeviceToken.Trim().Length > 0)
                    req.Headers.TryAddWithoutValidation("X-Device-Token", settings.DeviceToken.Trim());
                using var resp = await Http.SendAsync(req);
                string text = await resp.Content.ReadAsStringAsync();
                if (!resp.IsSuccessStatusCode)
                    return (null, $"Settings {(int)resp.StatusCode}: {Short(text)}");
                return (JsonSerializer.Deserialize<DashboardCircleSettings>(text), null);
            }
            catch (Exception ex)
            {
                return (null, ex.Message);
            }
        }

        public async Task<string?> GetSafeWordAsync(DashboardSettings settings)
        {
            if (settings.DeviceToken.Trim().Length == 0) return null;
            try
            {
                using var req = new HttpRequestMessage(HttpMethod.Get, settings.ApiRoot() + "/circle/" + Uri.EscapeDataString(settings.CircleId.Trim()) + "/safe-word-check-material");
                req.Headers.TryAddWithoutValidation("X-Device-Token", settings.DeviceToken.Trim());
                using var resp = await Http.SendAsync(req);
                if (!resp.IsSuccessStatusCode) return null;
                string text = await resp.Content.ReadAsStringAsync();
                return JsonSerializer.Deserialize<DashboardSafeWord>(text)?.SafeWord;
            }
            catch
            {
                return null;
            }
        }

        public async Task SendSafeWordResultAsync(DashboardSettings settings, string result)
        {
            if (string.IsNullOrEmpty(CallId)) return;
            try
            {
                var body = new { call_id = CallId, result };
                using var req = new HttpRequestMessage(HttpMethod.Post, settings.ApiRoot() + "/events/safe_word_result");
                req.Content = new StringContent(JsonSerializer.Serialize(body, JsonOptions), Encoding.UTF8, "application/json");
                if (settings.DeviceToken.Trim().Length > 0)
                    req.Headers.TryAddWithoutValidation("X-Device-Token", settings.DeviceToken.Trim());
                await Http.SendAsync(req);
            }
            catch { }
        }

        public async Task<(DashboardVerify? verify, string? error)> GetVerifyAsync(DashboardSettings settings, string verifyId)
        {
            try
            {
                using var resp = await Http.GetAsync(settings.ApiRoot() + "/verify/" + Uri.EscapeDataString(verifyId));
                string text = await resp.Content.ReadAsStringAsync();
                if (!resp.IsSuccessStatusCode)
                    return (null, $"Verify {(int)resp.StatusCode}: {Short(text)}");
                return (JsonSerializer.Deserialize<DashboardVerify>(text), null);
            }
            catch (Exception ex)
            {
                return (null, ex.Message);
            }
        }

        public static string NewestQuote(ScamVerdict verdict)
        {
            return verdict.Reasons
                .SelectMany(r => r.Evidence)
                .Select(e => (e.Quote ?? "").Trim())
                .LastOrDefault(q => q.Length > 0) ?? "";
        }

        public static string DescribeActions(DashboardEventResponse response)
        {
            if (response.Actions.Count == 0) return "Dashboard stored the call. No extra steps.";
            return string.Join(" ", response.Actions.Select(a => a.Type switch
            {
                "prompt_safe_word" => a.Message ?? "Ask the caller for your family safe word.",
                "verify_member"    => "Family is being asked: is this you?",
                "show_warning"     => a.Message ?? "Show a warning.",
                _                  => a.Type
            }));
        }

        private static string? Blank(string? value) =>
            string.IsNullOrWhiteSpace(value) || value.Trim().Equals("none", StringComparison.OrdinalIgnoreCase)
                ? null : value.Trim();

        private static string Short(string s) => s.Length <= 180 ? s : s[..180] + "...";
    }
}
