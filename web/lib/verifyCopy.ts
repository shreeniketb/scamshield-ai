export function isThisName(name: string) {
  return `Is this ${name}?`;
}

export function verifyReason(name: string, seniorName: string, isCall: boolean) {
  return isCall
    ? `Someone claiming to be ${name} is on a WhatsApp call with ${seniorName} right now.`
    : `Someone claiming to be ${name} just messaged ${seniorName} asking for help.`;
}

export function holdForVerify(name: string, phone?: string) {
  const hold = `Put the call on hold. We sent an "${isThisName(name)}" check to ${name} on the family app. Wait for their answer before you continue.`;
  const digits = (phone ?? "").replace(/\D/g, "");
  if (digits.length < 10) return hold;
  return `${hold} You can also call ${name} at ${phone} - a number you already have.`;
}
