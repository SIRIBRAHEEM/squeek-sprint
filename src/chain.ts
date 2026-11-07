import { FALLBACK_SEED } from "./constants";
import { formatSqk, isDigits, shortHash } from "./format";
import type {
  CallBasis,
  ChainSnapshot,
  CourseSource,
  SettlementRow,
  Visual,
  WheelReading,
} from "./types";

/**
 * Live fields the game actually reads. Nothing here is invented:
 * missing or "unavailable" payloads stay null and the HUD shows a dash.
 *
 * GET /v1/status
 *   measurement.freshness          online | stale
 *   measurement.coreStatus         IDLE | ACTIVE | COUNTER_FAULT
 *   measurement.rpmMilli           thousandths of a revolution per minute
 *   measurement.speedMmPerSecond   rim speed
 *   measurement.distanceMm         device day distance
 *   builder.anchor.blockHeight     settled Squeek block (only if builder.status is available)
 *   builder.anchor.settledThroughRound
 *   builder.queued.openRoundWorkUnits
 *
 * GET /v1/settlements?range=24h
 *   recentSettlements[]            newest settlements that completed blocks
 *   recentSettlements[].transactionHash   course seed
 *   recentSettlements[].settledThroughRound
 *   recentSettlements[].workAdded          prediction target
 *   recentSettlements[].blockHeight
 *   recentSettlements[].sqkMintedBaseUnits
 *   mining.economy.symbol / decimals
 */

const DIRECT_STATUS = "https://api.squeekchain.com/v1/status";
const DIRECT_SETTLEMENTS = "https://api.squeekchain.com/v1/settlements?range=24h";

interface FetchHit {
  data: unknown;
  via: "direct" | "proxy";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function fetchJson(url: string, via: "direct" | "proxy"): Promise<FetchHit> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 5000);
  try {
    const res = await fetch(url, {
      headers: { accept: "application/json" },
      cache: "no-store",
      signal: ctrl.signal,
    });
    const ctype = res.headers.get("content-type") || "";
    if (!res.ok || !ctype.includes("json")) {
      throw new Error(`bad_${res.status}`);
    }
    return { data: await res.json(), via };
  } finally {
    clearTimeout(timer);
  }
}

async function firstJson(
  candidates: { url: string; via: "direct" | "proxy" }[],
): Promise<FetchHit | null> {
  const hits = await Promise.all(
    candidates.map(async (candidate) => {
      try {
        return await fetchJson(candidate.url, candidate.via);
      } catch {
        return null;
      }
    }),
  );
  return hits.find((hit) => hit?.via === "direct") ?? hits.find((hit) => hit) ?? null;
}

function str(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function intNum(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function parseWheel(data: unknown): WheelReading | null {
  if (!isRecord(data)) return null;
  const measurement = isRecord(data.measurement) ? data.measurement : null;
  const builder = isRecord(data.builder) ? data.builder : null;
  const builderOk = builder?.status === "available";
  const anchor = builderOk && isRecord(builder.anchor) ? builder.anchor : null;
  const queued = builderOk && isRecord(builder.queued) ? builder.queued : null;

  if (!measurement && !anchor) return null;

  const reading: WheelReading = {
    freshness: measurement ? str(measurement.freshness) : null,
    coreStatus: measurement ? str(measurement.coreStatus) : null,
    rpmMilli: measurement ? intNum(measurement.rpmMilli) : null,
    speedMmPerSecond: measurement ? intNum(measurement.speedMmPerSecond) : null,
    distanceMm: measurement ? intNum(measurement.distanceMm) : null,
    blockHeight: anchor ? str(anchor.blockHeight) : null,
    settledRound: anchor ? str(anchor.settledThroughRound) : null,
    openRoundWork: queued ? str(queued.openRoundWorkUnits) : null,
    observedAt: measurement ? str(measurement.observedAt) : null,
  };

  const any =
    reading.coreStatus !== null ||
    reading.rpmMilli !== null ||
    reading.blockHeight !== null ||
    reading.settledRound !== null;
  return any ? reading : null;
}

function parseSettlement(value: unknown): SettlementRow | null {
  if (!isRecord(value)) return null;
  const transactionHash = str(value.transactionHash);
  const settledThroughRound = str(value.settledThroughRound);
  const workAdded = str(value.workAdded);
  if (!transactionHash || !transactionHash.startsWith("0x")) return null;
  if (!isDigits(settledThroughRound) || !isDigits(workAdded)) return null;
  const minted = str(value.sqkMintedBaseUnits);
  return {
    transactionHash,
    settledThroughRound,
    previousSettledThroughRound: str(value.previousSettledThroughRound),
    workAdded,
    blockHeight: str(value.blockHeight),
    sqkMintedBaseUnits: minted && isDigits(minted) ? minted : null,
  };
}

function parseSettlements(data: unknown): {
  rows: SettlementRow[];
  symbol: string;
  decimals: number;
} | null {
  if (!isRecord(data) || data.status !== "available" || !Array.isArray(data.recentSettlements)) {
    return null;
  }
  const rows = data.recentSettlements
    .map(parseSettlement)
    .filter((row): row is SettlementRow => row !== null);
  let symbol = "SQK";
  let decimals = 18;
  const mining = isRecord(data.mining) ? data.mining : null;
  const economy = mining && isRecord(mining.economy) ? mining.economy : null;
  if (economy) {
    const sym = str(economy.symbol);
    const dec = intNum(economy.decimals);
    if (sym) symbol = sym;
    if (dec !== null && dec >= 0 && dec <= 36) decimals = dec;
  }
  return { rows, symbol, decimals };
}

function newest(rows: SettlementRow[]): SettlementRow | null {
  let best: SettlementRow | null = null;
  for (const row of rows) {
    if (!best || BigInt(row.settledThroughRound) > BigInt(best.settledThroughRound)) best = row;
  }
  return best;
}

export function visualFromWheel(wheel: WheelReading | null): { visual: Visual; wheelKnown: boolean; rpm: number | null } {
  if (!wheel || (wheel.coreStatus === null && wheel.rpmMilli === null)) {
    return { visual: "dusk", wheelKnown: false, rpm: null };
  }
  const rpm = wheel.rpmMilli === null ? null : wheel.rpmMilli / 1000;
  if (wheel.coreStatus === "COUNTER_FAULT") {
    return { visual: "fault", wheelKnown: true, rpm };
  }
  const spinning = wheel.coreStatus === "ACTIVE" || (wheel.rpmMilli ?? 0) >= 1000;
  return { visual: spinning ? "day" : "night", wheelKnown: true, rpm };
}

function fallbackCourse(): CourseSource {
  return {
    seed: FALLBACK_SEED,
    fallback: true,
    round: null,
    blockHeight: null,
    workAdded: null,
    short: shortHash(FALLBACK_SEED),
  };
}

export function emptySnapshot(): ChainSnapshot {
  return {
    fetchedAt: null,
    wheelVia: null,
    settlementsVia: null,
    wheel: null,
    settlements: [],
    symbol: "SQK",
    decimals: 18,
    course: fallbackCourse(),
    basis: null,
    visual: "dusk",
    wheelKnown: false,
    rpm: null,
  };
}

function courseFrom(row: SettlementRow | null): CourseSource {
  if (!row) return fallbackCourse();
  return {
    seed: row.transactionHash,
    fallback: false,
    round: row.settledThroughRound,
    blockHeight: row.blockHeight,
    workAdded: row.workAdded,
    short: shortHash(row.transactionHash),
  };
}

function basisFrom(row: SettlementRow | null, symbol: string, decimals: number): CallBasis | null {
  if (!row) return null;
  return {
    hash: row.transactionHash,
    round: row.settledThroughRound,
    workAdded: row.workAdded,
    blockHeight: row.blockHeight,
    sqkMintedBaseUnits: row.sqkMintedBaseUnits,
    sqkDisplay: row.sqkMintedBaseUnits ? formatSqk(row.sqkMintedBaseUnits, decimals) : null,
    symbol,
  };
}

export async function loadChain(): Promise<ChainSnapshot> {
  const [statusHit, settlementHit] = await Promise.all([
    firstJson([
      { url: DIRECT_STATUS, via: "direct" },
      { url: "/api/status", via: "proxy" },
    ]),
    firstJson([
      { url: DIRECT_SETTLEMENTS, via: "direct" },
      { url: "/api/settlements", via: "proxy" },
    ]),
  ]);

  const wheel = statusHit ? parseWheel(statusHit.data) : null;
  const parsed = settlementHit ? parseSettlements(settlementHit.data) : null;
  const rows = parsed?.rows ?? [];
  const symbol = parsed?.symbol ?? "SQK";
  const decimals = parsed?.decimals ?? 18;
  const top = newest(rows);
  const derived = visualFromWheel(wheel);

  return {
    fetchedAt: Date.now(),
    wheelVia: statusHit && wheel ? statusHit.via : null,
    settlementsVia: settlementHit && parsed ? settlementHit.via : null,
    wheel,
    settlements: rows,
    symbol,
    decimals,
    course: courseFrom(top),
    basis: basisFrom(top, symbol, decimals),
    visual: derived.visual,
    wheelKnown: derived.wheelKnown,
    rpm: derived.rpm,
  };
}

export function resolveCall(
  prediction: "above" | "below",
  baselineWork: string,
  baselineRound: string,
  rows: SettlementRow[],
): { status: "hit" | "miss" | "tie"; work: string; round: string } | null {
  if (!isDigits(baselineWork) || !isDigits(baselineRound)) return null;
  let next: SettlementRow | null = null;
  for (const row of rows) {
    if (!isDigits(row.settledThroughRound) || !isDigits(row.workAdded)) continue;
    if (BigInt(row.settledThroughRound) <= BigInt(baselineRound)) continue;
    if (!next || BigInt(row.settledThroughRound) < BigInt(next.settledThroughRound)) next = row;
  }
  if (!next) return null;
  const got = BigInt(next.workAdded);
  const base = BigInt(baselineWork);
  let status: "hit" | "miss" | "tie";
  if (got === base) status = "tie";
  else if ((got > base && prediction === "above") || (got < base && prediction === "below")) status = "hit";
  else status = "miss";
  return { status, work: next.workAdded, round: next.settledThroughRound };
}
