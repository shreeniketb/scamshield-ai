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

export function formatAgo(iso: string, now = Date.now()) {
  const ms = now - Date.parse(iso);
  if (!Number.isFinite(ms) || ms < 0) return "";
  const minutes = Math.round(ms / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  if (days === 1) return "1 day ago";
  return `${days} days ago`;
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
