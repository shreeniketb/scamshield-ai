using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.RegularExpressions;

namespace ScamDetector
{
    // Family phones and the one protection method from the dashboard.
    // Used in Grok's call_data and in Nani's step-by-step pop-up.
    public static class FamilyDashboardContext
    {
        public class Contact
        {
            public string Id { get; set; } = "";
            public string Name { get; set; } = "";
            public string Relation { get; set; } = "";
            public string Phone { get; set; } = "";
            public bool CanVerify { get; set; }
        }

        public static string ProtectionMethod { get; private set; } = "verify_member";
        public static string? SafeWord { get; private set; }
        public static List<Contact> Contacts { get; private set; } = new();

        public static void Update(string? method, string? safeWord, IEnumerable<Contact> contacts)
        {
            ProtectionMethod = string.IsNullOrWhiteSpace(method) ? "verify_member" : method.Trim();
            SafeWord = string.IsNullOrWhiteSpace(safeWord) ? null : safeWord.Trim();
            Contacts = contacts.ToList();
        }

        public static object? ForGrok()
        {
            if (Contacts.Count == 0 && ProtectionMethod.Length == 0) return null;
            return new
            {
                protection_method = ProtectionMethod,
                verify_hold_instruction = UsesSafeWord()
                    ? "If the caller claims to be someone listed here and risk is medium or high, tell the user to ask the caller for the family safe word. Do not mention an \"Is this …?\" check or the family app. You may mention their saved phone number. Never print the actual safe word. Never mention a phone number or safe word in any other case."
                    : "If the caller claims to be someone listed here and risk is medium or high, tell the user to put the call on hold. Use that person's real name, for example \"Is this Vanessa?\". You may mention their saved phone number. Do not mention the family safe word. Never mention a phone number or verification check in any other case.",
                people = Contacts.Select(c => new
                {
                    name = c.Name,
                    relation = c.Relation,
                    phone = c.Phone,
                    can_verify = c.CanVerify
                }).ToList()
            };
        }

        public static string IsThisName(string name) => $"Is this {name}?";

        public static bool UsesSafeWord() =>
            ProtectionMethod.Equals("safe_word", StringComparison.OrdinalIgnoreCase);

        public static string HoldForVerifyAction(string name) =>
            $"Put the call on hold. We sent an \"{IsThisName(name)}\" check to {name} on the family app. Wait for their answer before you continue.";

        public static string AskSafeWordAction() =>
            "Ask the caller for your family safe word. If they cannot say it, hang up immediately.";

        public static bool IsMediumOrHigh(ScamVerdict verdict) =>
            verdict.ScamLikelihood >= 40
            || verdict.RiskLevel.Equals("medium", StringComparison.OrdinalIgnoreCase)
            || verdict.RiskLevel.Equals("high", StringComparison.OrdinalIgnoreCase);

        public static bool ShouldHoldForVerify(ScamVerdict verdict, out Contact? contact)
        {
            contact = MatchContact(verdict.ClaimedIdentity)
                ?? MatchContact(verdict.Summary)
                ?? MatchContact(verdict.RecommendedAction);
            return contact != null && IsMediumOrHigh(verdict);
        }

        public static string EnrichAction(string action, ScamVerdict verdict)
        {
            if (ShouldHoldForVerify(verdict, out var impersonated) && impersonated != null)
            {
                var parts = new List<string>
                {
                    UsesSafeWord() ? AskSafeWordAction() : HoldForVerifyAction(impersonated.Name)
                };
                if (HasPhone(impersonated))
                    parts.Add($"You can also call {impersonated.Name} at {impersonated.Phone} - a number you already have.");
                return string.Join(" ", parts);
            }

            return WithoutIdentityChecks(action);
        }

        public static string? CheckSafeWord(string transcript)
        {
            if (string.IsNullOrWhiteSpace(SafeWord) || string.IsNullOrWhiteSpace(transcript))
                return null;

            var word = Regex.Escape(SafeWord.Trim());
            var callerSaidWord = Regex.IsMatch(transcript, $@"(?im)^\[[^\]]+\]\s+caller:.*\b{word}\b");
            if (callerSaidWord) return "passed";

            bool asked = Regex.IsMatch(transcript, @"(?i)safe\s*word|family word|secret word|code word");
            bool callerSpoke = Regex.IsMatch(transcript, @"(?im)^\[[^\]]+\]\s+caller:");
            if (ProtectionMethod.Equals("safe_word", StringComparison.OrdinalIgnoreCase) && asked && callerSpoke && !callerSaidWord)
                return "failed";
            return null;
        }

        private static Contact? MatchContact(string? claimed)
        {
            if (string.IsNullOrWhiteSpace(claimed)) return null;
            string wanted = Regex.Replace(claimed.Trim().ToLowerInvariant(), @"[^a-z0-9\s]", " ");
            wanted = Regex.Replace(wanted, @"\s+", " ").Trim();
            if (wanted.Length == 0) return null;
            return Contacts.FirstOrDefault(c => Aliases(c).Any(alias =>
                wanted == alias || Regex.IsMatch(wanted, $@"(?:^|\s){Regex.Escape(alias).Replace(" ", @"\s+")}(?:\s|$)")));
        }

        private static IEnumerable<string> Aliases(Contact contact)
        {
            var aliases = new List<string> { contact.Name, contact.Relation };
            string relation = (contact.Relation ?? "").ToLowerInvariant();
            if (contact.Id == "u_aarav" || relation == "grandson")
                aliases.AddRange(new[] { "grandson", "grand son", "grandkid", "grandchild", "kale", "aarav" });
            if (contact.Id == "u_priya" || relation == "daughter")
                aliases.AddRange(new[] { "daughter", "vanessa", "priya" });
            if (contact.Id == "u_raj") aliases.Add("shreeniket");
            return aliases
                .Select(value => Regex.Replace((value ?? "").Trim().ToLowerInvariant(), @"\s+", " "))
                .Where(value => value.Length > 0)
                .Distinct();
        }

        private static bool HasPhone(Contact contact)
        {
            var digits = new string((contact.Phone ?? "").Where(char.IsDigit).ToArray());
            return digits.Length >= 10;
        }

        private static string WithoutIdentityChecks(string action)
        {
            if (string.IsNullOrWhiteSpace(action)) return "";
            var kept = Regex.Split(action.Trim(), @"(?<=[.!?])\s+")
                .Where(sentence =>
                    sentence.IndexOf("safe word", StringComparison.OrdinalIgnoreCase) < 0
                    && sentence.IndexOf("is this ", StringComparison.OrdinalIgnoreCase) < 0
                    && sentence.IndexOf("verify identity", StringComparison.OrdinalIgnoreCase) < 0
                    && sentence.IndexOf("family app", StringComparison.OrdinalIgnoreCase) < 0
                    && !Regex.IsMatch(sentence, @"\d{3}[\s.\-)]*\d{3}[\s.\-]*\d{4}"));
            return string.Join(" ", kept).Trim();
        }
    }
}
