import { resolveCall } from "./chain";
import type { RunRecord, SaveData, SettlementRow } from "./types";

const KEY = "squeek-sprint-v1";

function empty(): SaveData {
  return { version: 1, nickname: "", muted: false, runs: [] };
}

function validRun(value: unknown): value is RunRecord {
  if (typeof value !== "object" || value === null) return false;
  const row = value as Partial<RunRecord>;
  return typeof row.id === "string" && typeof row.finalScore === "number" && typeof row.seed === "string";
}

export function loadSave(): SaveData {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return empty();
    const parsed = JSON.parse(raw) as Partial<SaveData>;
    if (parsed.version !== 1 || !Array.isArray(parsed.runs)) return empty();
    return {
      version: 1,
      nickname: typeof parsed.nickname === "string" ? parsed.nickname.slice(0, 16) : "",
      muted: Boolean(parsed.muted),
      runs: parsed.runs.filter(validRun).slice(0, 40),
    };
  } catch {
    return empty();
  }
}

export function writeSave(data: SaveData): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...data, runs: data.runs.slice(0, 40) }));
  } catch {
    /* private mode or a full disk — the run still happened */
  }
}

export function cleanNick(value: string): string {
  const trimmed = value.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 16);
  return trimmed.length > 0 ? trimmed : "Squeeker";
}

export function leaderboard(runs: RunRecord[]): RunRecord[] {
  return [...runs].sort((a, b) => b.finalScore - a.finalScore || b.at - a.at).slice(0, 8);
}

export interface GhostTape {
  score: number;
  step: number;
  xs: number[];
  ys: number[];
  ducks: number[];
}

export interface ChronicleEntry {
  at: number;
  seedShort: string;
  fallback: boolean;
  score: number;
  blockStart: string | null;
  blocksSeen: string[];
  shifts: string[];
  round: string | null;
}

const GHOST_KEY = "squeek-sprint-ghosts-v1";
const CHRONICLE_KEY = "squeek-sprint-chronicle-v1";

function validTape(value: unknown): value is GhostTape {
  if (typeof value !== "object" || value === null) return false;
  const tape = value as Partial<GhostTape>;
  return (
    typeof tape.score === "number" &&
    typeof tape.step === "number" &&
    Array.isArray(tape.xs) &&
    Array.isArray(tape.ys) &&
    Array.isArray(tape.ducks) &&
    tape.xs.length > 4 &&
    tape.xs.length === tape.ys.length &&
    tape.xs.length === tape.ducks.length
  );
}

export function loadGhost(seed: string): GhostTape | null {
  try {
    const raw = localStorage.getItem(GHOST_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const tape = parsed[seed];
    return validTape(tape) ? tape : null;
  } catch {
    return null;
  }
}

export function saveGhost(seed: string, tape: GhostTape): void {
  try {
    const raw = localStorage.getItem(GHOST_KEY);
    const parsed = raw ? (JSON.parse(raw) as Record<string, GhostTape>) : {};
    parsed[seed] = tape;
    const keys = Object.keys(parsed);
    if (keys.length > 8) delete parsed[keys[0]];
    localStorage.setItem(GHOST_KEY, JSON.stringify(parsed));
  } catch {
    /* the run still counts */
  }
}

function validChronicle(value: unknown): value is ChronicleEntry {
  if (typeof value !== "object" || value === null) return false;
  const row = value as Partial<ChronicleEntry>;
  return typeof row.at === "number" && typeof row.score === "number" && typeof row.seedShort === "string" && Array.isArray(row.blocksSeen) && Array.isArray(row.shifts);
}

export function loadChronicle(): ChronicleEntry[] {
  try {
    const raw = localStorage.getItem(CHRONICLE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown[];
    return Array.isArray(parsed) ? parsed.filter(validChronicle).slice(0, 12) : [];
  } catch {
    return [];
  }
}

export function pushChronicle(entry: ChronicleEntry): void {
  const rows = [entry, ...loadChronicle()].slice(0, 12);
  try {
    localStorage.setItem(CHRONICLE_KEY, JSON.stringify(rows));
  } catch {
    /* ignore quota */
  }
}

export function bestForSeed(runs: RunRecord[], seed: string): number | null {
  let best: number | null = null;
  for (const run of runs) {
    if (run.seed !== seed) continue;
    if (best === null || run.finalScore > best) best = run.finalScore;
  }
  return best;
}

export interface ResolveSummary {
  hits: number;
  misses: number;
  ties: number;
  notes: string[];
}

export function resolvePending(runs: RunRecord[], rows: SettlementRow[]): ResolveSummary {
  const summary: ResolveSummary = { hits: 0, misses: 0, ties: 0, notes: [] };
  for (const run of runs) {
    if (run.status !== "pending" || !run.prediction || !run.baselineWork || !run.baselineRound) continue;
    const result = resolveCall(run.prediction, run.baselineWork, run.baselineRound, rows);
    if (!result) continue;
    run.status = result.status;
    run.resolvedWork = result.work;
    run.resolvedRound = result.round;
    if (result.status === "hit") {
      run.finalScore = run.rawScore * 2;
      summary.hits += 1;
      summary.notes.push(
        `Call hit: round ${result.round} added ${result.work} work (you had ${run.baselineWork}). Score doubled to ${run.finalScore.toLocaleString("en-US")}.`,
      );
    } else if (result.status === "miss") {
      run.finalScore = run.rawScore;
      summary.misses += 1;
      summary.notes.push(
        `Call missed: round ${result.round} added ${result.work} work against ${run.baselineWork}. Score stays ${run.finalScore.toLocaleString("en-US")}.`,
      );
    } else {
      run.finalScore = run.rawScore;
      summary.ties += 1;
      summary.notes.push(`Call tied on ${result.work} work in round ${result.round}. Score unchanged.`);
    }
  }
  return summary;
}
