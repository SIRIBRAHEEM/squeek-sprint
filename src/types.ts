export type Phase = "attract" | "playing" | "paused" | "over";

export type Visual = "day" | "night" | "dusk" | "fault";

export type CallSide = "above" | "below";

export type CallStatus = "none" | "pending" | "hit" | "miss" | "tie";

export type PowerKind = "shield" | "magnet" | "sprocket";

export type EntKind = "crate" | "spoke" | "beam" | "gap" | "seed" | "sqk" | "power" | "flex";

export interface Player {
  x: number;
  y: number;
  vy: number;
  w: number;
  h: number;
  onGround: boolean;
  duck: boolean;
  jumpsLeft: number;
  run: number;
  squash: number;
}

export interface CourseEnt {
  id: number;
  kind: EntKind;
  x: number;
  y: number;
  w: number;
  h: number;
  roll: number;
  form: "seeds" | "bat" | "cheese" | null;
  power: PowerKind | null;
  taken: boolean;
  phase: number;
  resolved: boolean;
}

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  color: string;
  size: number;
}

export interface Floater {
  x: number;
  y: number;
  text: string;
  life: number;
  color: string;
}

export interface Star {
  x: number;
  y: number;
  r: number;
  tw: number;
}

export interface WheelReading {
  freshness: string | null;
  coreStatus: string | null;
  rpmMilli: number | null;
  speedMmPerSecond: number | null;
  distanceMm: number | null;
  blockHeight: string | null;
  settledRound: string | null;
  openRoundWork: string | null;
  observedAt: string | null;
}

export interface SettlementRow {
  transactionHash: string;
  settledThroughRound: string;
  previousSettledThroughRound: string | null;
  workAdded: string;
  blockHeight: string | null;
  sqkMintedBaseUnits: string | null;
}

export interface CourseSource {
  seed: string;
  fallback: boolean;
  round: string | null;
  blockHeight: string | null;
  workAdded: string | null;
  short: string;
}

export interface CallBasis {
  hash: string;
  round: string;
  workAdded: string;
  blockHeight: string | null;
  sqkMintedBaseUnits: string | null;
  sqkDisplay: string | null;
  symbol: string;
}

export interface ChainSnapshot {
  fetchedAt: number | null;
  wheelVia: "direct" | "proxy" | null;
  settlementsVia: "direct" | "proxy" | null;
  wheel: WheelReading | null;
  settlements: SettlementRow[];
  symbol: string;
  decimals: number;
  course: CourseSource;
  basis: CallBasis | null;
  visual: Visual;
  /** True only when measurement fields were actually present. */
  wheelKnown: boolean;
  /** RPM as revolutions per minute, or null when the API did not provide it. */
  rpm: number | null;
}

export interface RunRecord {
  id: string;
  nickname: string;
  address?: string | null;
  at: number;
  seed: string;
  seedShort: string;
  seedFallback: boolean;
  round: string | null;
  rawScore: number;
  finalScore: number;
  pickups: number;
  distanceM: number;
  paceBonus: boolean;
  prediction: CallSide | null;
  baselineWork: string | null;
  baselineRound: string | null;
  baselineHash: string | null;
  status: CallStatus;
  resolvedWork: string | null;
  resolvedRound: string | null;
  visual: Visual;
}

export interface SaveData {
  version: 1;
  nickname: string;
  muted: boolean;
  runs: RunRecord[];
}
