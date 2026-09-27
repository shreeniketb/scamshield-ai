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
                people = Contacts.Select(c => new
                {
                    name = c.Name,
                    relation = c.Relation,
                    phone = c.Phone,
                    can_verify = c.CanVerify
                }).ToList()
            };
        }

        public static string EnrichAction(string action, ScamVerdict verdict)
        {
            var parts = new List<string>();
            if (!string.IsNullOrWhiteSpace(action)) parts.Add(action.Trim());

            if (ProtectionMethod.Equals("safe_word", StringComparison.OrdinalIgnoreCase)
                && !ContainsSafeWordHint(action))
            {
                parts.Add("Ask the caller for your family safe word. If they cannot say it, hang up immediately.");
            }

            var contact = MatchContact(verdict.ClaimedIdentity) ?? Contacts.FirstOrDefault(c => c.CanVerify && HasPhone(c));
            if (contact != null && HasPhone(contact) && action.IndexOf(contact.Phone, StringComparison.OrdinalIgnoreCase) < 0)
            {
                parts.Add($"Call {contact.Name} at {contact.Phone} to verify identity.");
            }

            return string.Join(" ", parts.Where(p => p.Length > 0));
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
            string wanted = claimed.Trim().ToLowerInvariant();
            return Contacts.FirstOrDefault(c =>
                c.Relation.Equals(wanted, StringComparison.OrdinalIgnoreCase)
                || c.Name.Equals(wanted, StringComparison.OrdinalIgnoreCase));
        }

        private static bool HasPhone(Contact contact)
        {
            var digits = new string((contact.Phone ?? "").Where(char.IsDigit).ToArray());
            return digits.Length >= 10;
        }

        private static bool ContainsSafeWordHint(string action) =>
            action.IndexOf("safe word", StringComparison.OrdinalIgnoreCase) >= 0;
    }
}
