import { formatSqk, isDigits } from "./format";

/**
 * GET /v1/accounts/{address}
 * Read-only portfolio fields. `status: "unavailable"` stays unknown, not zero.
 * Holder skin uses tokenCounts.wallet and tokenCounts.staking only when those
 * strings are present. rewards.claimableBaseUnits is claimable $SQK.
 */

export interface HolderProfile {
  address: string;
  walletSqueeks: string | null;
  stakingSqueeks: string | null;
  claimableBaseUnits: string | null;
  claimableDisplay: string | null;
  holder: boolean;
  unavailable: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function digits(value: unknown): string | null {
  return typeof value === "string" && isDigits(value) ? value : null;
}

export function parseAccount(data: unknown, decimals: number): HolderProfile | null {
  if (!isRecord(data) || typeof data.account !== "string") return null;
  if (data.status === "unavailable") {
    return {
      address: data.account,
      walletSqueeks: null,
      stakingSqueeks: null,
      claimableBaseUnits: null,
      claimableDisplay: null,
      holder: false,
      unavailable: true,
    };
  }
  if (data.status !== "available") return null;
  const counts = isRecord(data.tokenCounts) ? data.tokenCounts : null;
  const rewards = isRecord(data.rewards) ? data.rewards : null;
  const walletSqueeks = counts ? digits(counts.wallet) : null;
  const stakingSqueeks = counts ? digits(counts.staking) : null;
  const claimableBaseUnits = rewards ? digits(rewards.claimableBaseUnits) : null;
  const holder =
    (walletSqueeks !== null && BigInt(walletSqueeks) > 0n) ||
    (stakingSqueeks !== null && BigInt(stakingSqueeks) > 0n);
  return {
    address: data.account,
    walletSqueeks,
    stakingSqueeks,
    claimableBaseUnits,
    claimableDisplay: claimableBaseUnits ? formatSqk(claimableBaseUnits, decimals) : null,
    holder,
    unavailable: false,
  };
}

async function fetchJson(url: string): Promise<unknown> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 6000);
  try {
    const res = await fetch(url, { headers: { accept: "application/json" }, signal: ctrl.signal });
    const ctype = res.headers.get("content-type") || "";
    if (!res.ok || !ctype.includes("json")) throw new Error("bad");
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

export async function loadAccount(address: string, decimals: number): Promise<HolderProfile | null> {
  const lower = address.toLowerCase();
  if (!/^0x[a-f0-9]{40}$/.test(lower)) return null;
  const direct = `https://api.squeekchain.com/v1/accounts/${lower}?limit=25`;
  const proxy = `/api/account?address=${lower}`;
  let data: unknown = null;
  try {
    data = await fetchJson(direct);
  } catch {
    try {
      data = await fetchJson(proxy);
    } catch {
      return null;
    }
  }
  return parseAccount(data, decimals);
}
