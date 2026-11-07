import "@fontsource/lilita-one/latin-400.css";
import "@fontsource/nunito/latin-600.css";
import "@fontsource/nunito/latin-800.css";
import "@fontsource/nunito/latin-ext-600.css";
import "@fontsource/nunito/latin-ext-800.css";
import "./style.css";
import { AudioBus } from "./audio";
import { emptySnapshot, loadChain } from "./chain";
import { formatInt, formatKmFromMm, formatMps, wheelLabel } from "./format";
import { Game } from "./game";
import {
  bestForSeed,
  cleanNick,
  leaderboard,
  loadSave,
  resolvePending,
  writeSave,
} from "./storage";
import type { CallSide, ChainSnapshot, RunRecord } from "./types";

const $ = <T extends HTMLElement>(id: string) => {
  const node = document.getElementById(id);
  if (!node) throw new Error(`missing #${id}`);
  return node as T;
};

const canvas = $<HTMLCanvasElement>("view");
const audio = new AudioBus();
const save = loadSave();
audio.setMuted(save.muted);

let chain: ChainSnapshot = emptySnapshot();
let link: "checking" | "live" | "cached" | "offline" = "checking";
let toastTimer = 0;

const game = new Game(
  canvas,
  audio,
  () => paint(),
  (run) => {
    save.runs.unshift(run);
    save.runs = save.runs.slice(0, 40);
    writeSave(save);
    paint();
  },
);

function showToast(text: string): void {
  const toast = $("toast");
  toast.hidden = false;
  toast.textContent = text;
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    toast.hidden = true;
    toast.textContent = "";
  }, 5200);
}

function shareRun(run: RunRecord): void {
  const call =
    run.status === "hit"
      ? " Call hit — score doubled."
      : run.status === "pending"
        ? " Call still open."
        : run.status === "miss"
          ? " Call missed."
          : "";
  const course = run.seedFallback
    ? "the offline fallback course"
    : `course ${run.seedShort} (settlement round ${run.round ?? "—"})`;
  const text = `I scored ${formatInt(run.finalScore)} in Squeek Sprint on ${course}.${call} Race Squeektoshi's wheel.`;
  const url = new URL("https://x.com/intent/tweet");
  url.searchParams.set("text", text);
  url.searchParams.set("url", window.location.origin);
  url.searchParams.set("via", "siribraheem33");
  window.open(url.toString(), "_blank", "noopener,noreferrer");
}

function fillBoard(list: HTMLOListElement, runs: RunRecord[]): void {
  list.replaceChildren();
  const top = leaderboard(runs);
  if (top.length === 0) {
    const li = document.createElement("li");
    li.textContent = "No runs on this device yet.";
    list.append(li);
    return;
  }
  for (const run of top) {
    const li = document.createElement("li");
    const left = document.createElement("span");
    const flag =
      run.status === "pending" ? " · call open" : run.status === "hit" ? " · call hit" : run.status === "miss" ? " · call missed" : "";
    left.textContent = `${run.nickname} · ${run.seedShort}${flag}`;
    const right = document.createElement("span");
    const score = document.createElement("span");
    score.textContent = formatInt(run.finalScore);
    const share = document.createElement("button");
    share.type = "button";
    share.textContent = "Share";
    share.addEventListener("click", () => shareRun(run));
    right.append(score, document.createTextNode(" "), share);
    li.append(left, right);
    list.append(li);
  }
}

function liveCard(snapshot: ChainSnapshot): string {
  if (!snapshot.fetchedAt || (snapshot.course.fallback && !snapshot.wheelKnown)) {
    return "Live Squeekchain data is unavailable. The course is the labeled fallback, the wheel readout stays blank, and calls are closed. The run still plays.";
  }
  const parts: string[] = [];
  const wheel = snapshot.wheel;
  if (snapshot.wheelKnown && wheel) {
    const rpm = wheel.rpmMilli === null ? "RPM unavailable" : `${(wheel.rpmMilli / 1000).toFixed(1)} RPM`;
    const fresh = wheel.freshness === "stale" ? " (stale reading)" : "";
    parts.push(`${wheelLabel(wheel.coreStatus)} · ${rpm}${fresh}`);
    if (wheel.speedMmPerSecond !== null) parts.push(`rim ${formatMps(wheel.speedMmPerSecond)}`);
    if (wheel.distanceMm !== null) parts.push(`today ${formatKmFromMm(wheel.distanceMm)}`);
    if (wheel.blockHeight) parts.push(`settled block ${wheel.blockHeight}`);
    if (wheel.settledRound) parts.push(`settled round ${wheel.settledRound}`);
    if (wheel.openRoundWork) parts.push(`open-round work ${wheel.openRoundWork}`);
  } else {
    parts.push("Wheel telemetry unavailable.");
  }
  if (snapshot.course.fallback) {
    parts.push("Settlements unavailable, so this course is the offline fallback.");
  } else {
    parts.push(
      `Course ${snapshot.course.short} from settlement round ${snapshot.course.round ?? "—"}, the newest round that completed blocks.`,
    );
    if (snapshot.basis?.sqkDisplay) {
      parts.push(`That round minted ${snapshot.basis.sqkDisplay} ${snapshot.basis.symbol}.`);
    }
  }
  if (link === "cached") parts.push("Showing the last live reading — a refresh just failed.");
  return parts.join(" ");
}

function paint(): void {
  const phase = game.phase;
  document.body.classList.toggle("is-playing", phase === "playing" || phase === "paused");
  document.body.classList.toggle("mode-night", game.visual === "night");
  document.body.classList.toggle("mode-fault", game.visual === "fault");

  $("score").textContent = formatInt(game.totalScore());
  const hearts = `${"♥ ".repeat(Math.max(0, game.lives)).trim()}`;
  $("lives").textContent = hearts || "—";
  $("coins").textContent = `${game.pickups} ${game.pickups === 1 ? "seed" : "seeds"}`;
  const pace = $("pace");
  if (phase === "playing" || phase === "paused" || phase === "over") {
    pace.textContent = game.paceLive
      ? game.paceLeadM >= 0
        ? `ahead ${game.paceLeadM.toFixed(1)} m`
        : `wheel leads ${Math.abs(game.paceLeadM).toFixed(1)} m`
      : "no live pace";
  } else {
    pace.textContent = "pace —";
  }
  const buffs: string[] = [];
  if (game.shield) buffs.push("shield");
  if (game.magnet > 0) buffs.push("magnet");
  if (game.sprocket > 0) buffs.push("sprocket");
  if (game.prediction && phase === "playing") buffs.push(game.prediction === "above" ? "call: more" : "call: less");
  $("buffs").textContent = buffs.join(" · ");

  const wheel = chain.wheel;
  $("rpm").textContent = !chain.wheelKnown || wheel?.rpmMilli === null || wheel === null
    ? "RPM —"
    : `RPM ${(wheel.rpmMilli / 1000).toFixed(1)}`;
  $("wheel-state").textContent = chain.wheelKnown ? wheelLabel(wheel?.coreStatus ?? null) : "wheel —";
  $("block").textContent = wheel?.blockHeight ? `block ${wheel.blockHeight}` : "block —";
  $("round").textContent = wheel?.settledRound ? `round ${wheel.settledRound}` : "round —";
  $("course").textContent = chain.course.fallback ? "course fallback" : `course ${chain.course.short}`;

  const live = $("live");
  live.classList.remove("live-on", "live-cache", "live-off");
  const text = $("live-text");
  if (link === "live") {
    live.classList.add("live-on");
    text.textContent = chain.wheelKnown ? `Live · ${wheelLabel(wheel?.coreStatus ?? null)}` : "Live course";
  } else if (link === "cached") {
    live.classList.add("live-cache");
    text.textContent = "Last live reading";
  } else if (link === "offline") {
    live.classList.add("live-off");
    text.textContent = "Live data unavailable";
  } else {
    text.textContent = "Checking the wheel…";
  }

  $("live-card-body").textContent = liveCard(chain);
  const canCall = chain.basis !== null && !chain.course.fallback;
  $<HTMLButtonElement>("call-above").disabled = !canCall;
  $<HTMLButtonElement>("call-below").disabled = !canCall;
  $("call-copy").textContent = canCall && chain.basis
    ? `Round ${chain.basis.round} added ${chain.basis.workAdded} work. Will the next block-completing settlement add more or less? A hit doubles this run when that settlement appears. Quiet rounds that complete no blocks are not listed.`
    : "A call needs the live settlements feed. You can still sprint the fallback course.";

  const best = bestForSeed(save.runs, chain.course.seed);
  $("course-best").textContent = best === null
    ? chain.course.fallback
      ? "No personal best on the fallback course yet."
      : "No personal best on this course yet."
    : `Your best on this course: ${formatInt(best)}`;

  const nick = $<HTMLInputElement>("nick");
  if (document.activeElement !== nick && nick.value !== save.nickname) nick.value = save.nickname;

  if (phase !== "playing") {
    fillBoard($("board"), save.runs);
    fillBoard($("board-over"), save.runs);
  }

  const overlay = $("overlay");
  const title = $("title-panel");
  const over = $("over-panel");
  const paused = $("paused");
  const playing = phase === "playing";
  overlay.hidden = playing || phase === "paused";
  title.hidden = phase === "over";
  over.hidden = phase !== "over";
  paused.hidden = phase !== "paused";

  if (phase === "over" && game.lastRun) {
    const run = game.lastRun;
    $("over-score").textContent = formatInt(run.finalScore);
    const paceLine = run.paceBonus
      ? "Ahead of the wheel: +25%."
      : game.paceLive
        ? "The wheel was ahead, so no pace bonus."
        : "No pace bonus without a live wheel distance.";
    const bits = [
      `${run.distanceM.toFixed(0)} m · ${run.pickups} pickups.`,
      paceLine,
      run.seedFallback
        ? "Fallback course — live settlement hash unavailable."
        : `Course ${run.seedShort} · settlement round ${run.round ?? "—"}.`,
    ];
    if (run.status === "pending") bits.push("Call is open. This score doubles on this device if the next settlement matches.");
    if (run.status === "hit") bits.push("Call hit. Score doubled.");
    if (run.status === "miss") bits.push("Call missed. Score stays as run.");
    $("over-detail").textContent = bits.join(" ");
  }

  $<HTMLButtonElement>("pause").hidden = phase !== "playing" && phase !== "paused";
  $<HTMLButtonElement>("pause").textContent = phase === "paused" ? "Resume" : "Pause";
  $<HTMLButtonElement>("mute").textContent = save.muted ? "Sound off" : "Sound on";
  $<HTMLButtonElement>("mute").setAttribute("aria-pressed", save.muted ? "true" : "false");
}

function nickname(): string {
  const value = cleanNick($<HTMLInputElement>("nick").value);
  save.nickname = value;
  writeSave(save);
  return value;
}

function begin(prediction: CallSide | null): void {
  if (prediction && !chain.basis) return;
  if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  audio.unlock();
  audio.ui();
  game.start({ nickname: nickname(), prediction, snapshot: chain });
  paint();
}

function wire(): void {
  $<HTMLButtonElement>("call-above").addEventListener("click", () => begin("above"));
  $<HTMLButtonElement>("call-below").addEventListener("click", () => begin("below"));
  $<HTMLButtonElement>("call-skip").addEventListener("click", () => begin(null));
  $<HTMLButtonElement>("again").addEventListener("click", () => {
    audio.ui();
    game.toTitle();
    paint();
  });
  $<HTMLButtonElement>("share").addEventListener("click", () => {
    if (game.lastRun) shareRun(game.lastRun);
  });
  const togglePause = () => {
    if (game.phase === "playing") game.pause();
    else if (game.phase === "paused") game.resume();
  };
  $<HTMLButtonElement>("resume").addEventListener("click", () => game.resume());
  $<HTMLButtonElement>("pause").addEventListener("click", togglePause);
  $<HTMLButtonElement>("mute").addEventListener("click", () => {
    save.muted = !save.muted;
    audio.setMuted(save.muted);
    writeSave(save);
    paint();
  });
  $<HTMLInputElement>("nick").addEventListener("change", () => nickname());

  const jump = $<HTMLButtonElement>("jump");
  const duck = $<HTMLButtonElement>("duck");
  const hold = (button: HTMLButtonElement, fn: (down: boolean) => void) => {
    const down = (event: PointerEvent) => {
      event.preventDefault();
      button.classList.add("is-down");
      audio.unlock();
      fn(true);
    };
    const up = () => {
      button.classList.remove("is-down");
      fn(false);
    };
    button.addEventListener("pointerdown", down);
    button.addEventListener("pointerup", up);
    button.addEventListener("pointercancel", up);
    button.addEventListener("pointerleave", up);
  };
  hold(jump, (down) => game.setJumpHeld(down));
  hold(duck, (down) => game.setDuckHeld(down));
  $<HTMLButtonElement>("pause-touch").addEventListener("click", togglePause);

  window.addEventListener("keydown", (event) => {
    const typing =
      event.target instanceof HTMLInputElement ||
      event.target instanceof HTMLTextAreaElement ||
      event.target instanceof HTMLButtonElement;
    if (typing) return;
    if (["Space", "ArrowUp", "ArrowDown", "KeyW", "KeyS"].includes(event.code)) event.preventDefault();
    if (event.repeat) return;
    audio.unlock();
    if (event.code === "Space" || event.code === "ArrowUp" || event.code === "KeyW") game.setJumpHeld(true);
    if (event.code === "ArrowDown" || event.code === "KeyS") game.setDuckHeld(true);
    if (event.code === "KeyP") togglePause();
    if (event.code === "KeyM") {
      save.muted = !save.muted;
      audio.setMuted(save.muted);
      writeSave(save);
      paint();
    }
  });
  window.addEventListener("keyup", (event) => {
    if (event.code === "Space" || event.code === "ArrowUp" || event.code === "KeyW") game.setJumpHeld(false);
    if (event.code === "ArrowDown" || event.code === "KeyS") game.setDuckHeld(false);
  });
  window.addEventListener("pointerdown", () => audio.unlock());
  window.addEventListener("resize", () => game.resize());
  if (window.visualViewport) window.visualViewport.addEventListener("resize", () => game.resize());
}

async function refresh(): Promise<void> {
  const next = await loadChain();
  const gotWheel = next.wheelKnown;
  const gotCourse = !next.course.fallback;
  if (!gotWheel && !gotCourse) {
    if (chain.fetchedAt && (!chain.course.fallback || chain.wheelKnown)) {
      link = "cached";
      paint();
      return;
    }
    link = "offline";
    chain = next;
    game.setChain(chain);
    paint();
    return;
  }
  if (!gotWheel && chain.wheelKnown && chain.wheel) {
    next.wheel = chain.wheel;
    next.wheelKnown = true;
    next.visual = chain.visual;
    next.rpm = chain.rpm;
    next.wheelVia = chain.wheelVia;
  }
  if (next.course.fallback && !chain.course.fallback) {
    next.course = chain.course;
    next.basis = chain.basis;
    next.settlements = chain.settlements;
    next.settlementsVia = chain.settlementsVia;
    next.symbol = chain.symbol;
    next.decimals = chain.decimals;
  }
  link = "live";
  chain = next;
  const summary = resolvePending(save.runs, chain.settlements);
  if (summary.notes.length > 0) {
    writeSave(save);
    const last = game.lastRun;
    if (last) {
      const updated = save.runs.find((run) => run.id === last.id);
      if (updated) game.lastRun = updated;
    }
    showToast(summary.notes[0] ?? "Call resolved.");
  }
  game.setChain(chain);
  paint();
}

wire();
paint();
void refresh();
window.setInterval(() => void refresh(), 8000);

let last = performance.now();
function frame(now: number): void {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  game.update(dt);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
