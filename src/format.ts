export function shortHash(hash: string): string {
  if (hash.startsWith("FALLBACK")) return "fallback";
  if (hash.length < 12) return hash;
  return `${hash.slice(0, 6)}…${hash.slice(-4)}`;
}

export function formatSqk(baseUnits: string, decimals: number): string | null {
  if (!/^\d+$/.test(baseUnits) || decimals < 0 || decimals > 36) return null;
  const pad = baseUnits.padStart(decimals + 1, "0");
  const whole = pad.slice(0, pad.length - decimals);
  const frac = pad.slice(pad.length - decimals, pad.length - decimals + 2);
  const withCommas = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return decimals === 0 ? withCommas : `${withCommas}.${frac}`;
}

export function formatInt(n: number): string {
  return Math.max(0, Math.floor(n)).toLocaleString("en-US");
}

export function formatKmFromMm(distanceMm: number): string {
  return `${(distanceMm / 1_000_000).toFixed(2)} km`;
}

export function formatMps(speedMmPerSecond: number): string {
  return `${(speedMmPerSecond / 1000).toFixed(2)} m/s`;
}

export function wheelLabel(status: string | null): string {
  if (status === "ACTIVE") return "running";
  if (status === "IDLE") return "asleep";
  if (status === "COUNTER_FAULT") return "counter fault";
  return "unavailable";
}

export function isDigits(value: string | null | undefined): value is string {
  return typeof value === "string" && /^\d+$/.test(value);
}
