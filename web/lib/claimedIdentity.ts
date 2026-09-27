import type { CircleMember } from "./types";

function normalize(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

function aliasesFor(member: CircleMember) {
  const aliases = [member.name, member.relation];
  const id = member.id;
  const relation = member.relation.toLowerCase();
  if (id === "u_aarav" || relation === "grandson") {
    aliases.push("grandson", "grand son", "grandkid", "grandchild", "kale", "aarav");
  }
  if (id === "u_priya" || relation === "daughter") {
    aliases.push("daughter", "vanessa", "priya");
  }
  if (id === "u_raj") aliases.push("shreeniket");
  return [...new Set(aliases.map(normalize).filter(Boolean))];
}

export function memberFromClaimed(members: CircleMember[], claimed: string | null | undefined) {
  const text = normalize(claimed ?? "");
  if (!text) return undefined;
  return members.find((member) =>
    aliasesFor(member).some((alias) => {
      if (text === alias) return true;
      const pattern = new RegExp(`(?:^|\\s)${alias.replace(/\s+/g, "\\s+")}(?:\\s|$)`);
      return pattern.test(text);
    }),
  );
}

export function memberFromTexts(members: CircleMember[], texts: Array<string | null | undefined>) {
  for (const text of texts) {
    const match = memberFromClaimed(members, text);
    if (match) return match;
  }
  return undefined;
}
