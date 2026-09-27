// Links the desktop app's scam_type to the label used in "Scam types this week"
// and to the matching Community Watch campaign.
type ScamTypeInfo = { label: string; campaign_id: string | null };

const SCAM_TYPES: Record<string, ScamTypeInfo> = {
  grandparent_distress: { label: "Grandparent / family emergency", campaign_id: "camp_grandparent_voice" },
  family_impersonation: { label: "Grandparent / family emergency", campaign_id: "camp_grandparent_voice" },
  bank_impersonation: { label: "Bank impersonation", campaign_id: "camp_bank_fraud" },
  utility_shutoff: { label: "Utility shutoff", campaign_id: "camp_georgia_power" },
  medicare: { label: "Medicare / health", campaign_id: "camp_medicare" },
  toll: { label: "Toll / Peach Pass", campaign_id: "camp_peach_pass" },
  delivery: { label: "Delivery fee", campaign_id: "camp_delivery" },
  irs_refund: { label: "IRS refund", campaign_id: "camp_irs_refund" },
  government_impersonation: { label: "Government impersonation", campaign_id: null },
  tech_support: { label: "Tech support", campaign_id: null },
  prize_lottery: { label: "Prize / too good to be true", campaign_id: null },
  investment_crypto: { label: "Investment / crypto", campaign_id: null },
  romance: { label: "Romance", campaign_id: null },
};

export function scamTypeInfo(scamType: string | null | undefined): ScamTypeInfo {
  if (scamType && SCAM_TYPES[scamType]) return SCAM_TYPES[scamType];
  return { label: "Other suspicious contact", campaign_id: null };
}

// Desktop cues (contract script_cues) and Grok reason categories, mapped to the
// CallReport signal keys the incident page groups as Voice / Words / Caller / Money.
const CUE_TO_SIGNAL: Record<string, string> = {
  claimed_family: "family_impersonation",
  new_number_excuse: "family_impersonation",
  secrecy: "secrecy",
  secrecy_or_isolation: "secrecy",
  urgency: "urgency",
  urgency_or_pressure: "urgency",
  threats: "fear_pressure",
  unexpected_debt_or_problem: "fear_pressure",
  bail: "financial_request",
  money: "financial_request",
  too_good_to_be_true: "financial_request",
  gift_cards: "suspicious_payment",
  unusual_payment_method: "suspicious_payment",
  impersonation: "authority_impersonation",
  sensitive_information_request: "credential_request",
};

export function signalForCue(cue: string): string | null {
  return CUE_TO_SIGNAL[cue] ?? null;
}
