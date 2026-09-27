import type { SignalLabel } from "../types";

export const defaultSignalLabels: Record<string, SignalLabel> = {
  urgency: {
    group: "words",
    label: "Pressure to act immediately",
    explanation: "Scammers rush you so you don't stop to check.",
  },
  secrecy: {
    group: "words",
    label: "Asked to keep it secret",
    explanation: "Secrecy cuts you off from help.",
  },
  fear_pressure: {
    group: "words",
    label: "Emergency story",
    explanation: "An accident or arrest story creates panic.",
  },
  family_impersonation: {
    group: "caller",
    label: "Claimed to be family",
    explanation: "The caller said they were a family member from an unknown number.",
  },
  authority_impersonation: {
    group: "caller",
    label: "Claimed to be an official",
    explanation: "Police, bank, utility or government impersonation.",
  },
  financial_request: {
    group: "money",
    label: "Asked for money",
    explanation: "A direct request to send money.",
  },
  credential_request: {
    group: "money",
    label: "Asked for passwords or codes",
    explanation: "Requests for PINs, passwords or verification codes.",
  },
  suspicious_payment: {
    group: "money",
    label: "Unusual payment method",
    explanation: "Gift cards, crypto or wires are classic scam payment asks.",
  },
};
