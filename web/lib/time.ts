const EASTERN = { timeZone: "America/New_York" } as const;

export function formatEastern(iso: string | null | undefined) {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString("en-US", {
    ...EASTERN,
    month: "numeric",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  });
}

export function formatDuration(seconds: number | null | undefined) {
  const n = Math.max(0, Math.round(seconds ?? 0));
  if (n < 1) return "under 1 min";
  const minutes = Math.floor(n / 60);
  const rest = n % 60;
  if (minutes === 0) return `${rest}s`;
  if (rest === 0) return `${minutes} min`;
  return `${minutes}m ${rest}s`;
}
