import "@fontsource/lilita-one/latin-400.css";
import "@fontsource/nunito/latin-600.css";
import "@fontsource/nunito/latin-800.css";
import "@fontsource/nunito/latin-ext-600.css";
import "@fontsource/nunito/latin-ext-800.css";
import "./style.css";
import { loadAccount, type HolderProfile } from "./account";
import { AudioBus } from "./audio";
import { emptySnapshot, loadChain } from "./chain";
import { formatInt, wheelLabel } from "./format";
import { Game } from "./game";
import { bestForSeed, cleanNick, leaderboard, loadSave, resolvePending, writeSave } from "./storage";
import type { CallSide, ChainSnapshot, RunRecord } from "./types";
import {
  SEPOLIA_CHAIN_ID,
  WalletController,
  chainLabel,
  isMobileDevice,
  shortAddress,
  walletDeepLinks,
} from "./wallet";

const $ = <T extends HTMLElement>(id: string) => {
  const node = document.getElementById(id);
  if (!node) throw new Error(`missing #${id}`);
  return node as T;
};

const canvas = $<HTMLCanvasElement>("view");
const audio = new AudioBus();
const save = loadSave();
const wallet = new WalletController();
audio.setMuted(save.muted);

let chain: ChainSnapshot = emptySnapshot();
let link: "checking" | "live" | "cached" | "offline" = "checking";
let profile: HolderProfile | null = null;
let profileFor = "";
let profileState: "idle" | "loading" | "ready" | "missing" = "idle";
let pendingCall: CallSide | null = null;
let toastTimer = 0;
let accountToken = 0;

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

function playerLabel(): string {
  if (wallet.ens) return wallet.ens.length > 32 ? `${wallet.ens.slice(0, 31)}…` : wallet.ens;
  if (wallet.address) return shortAddress(wallet.address);
  return cleanNick(save.nickname || "Squeeker");
}

function shareRun(run: RunRecord): void {
  const call =
    run.status === "hit" ? " Call hit — score doubled." : run.status === "pending" ? " Call still open." : run.status === "miss" ? " Call missed." : "";
  const course = run.seedFallback ? "the offline fallback course" : `course ${run.seedShort} (settlement round ${run.round ?? "—"})`;
  const who = run.address ? `${run.nickname}` : run.nickname;
  const text = `${who} scored ${formatInt(run.finalScore)} in Squeek Sprint on ${course}.${call}`;
  const url = new URL("https://x.com/intent/tweet");
  url.searchParams.set("text", text);
  url.searchParams.set("url", `${window.location.origin}/play`);
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
    const flag = run.status === "pending" ? " · call open" : run.status === "hit" ? " · call hit" : run.status === "miss" ? " · call missed" : "";
    left.textContent = `${run.nickname} · ${run.seedShort}${flag}`;
    const right = document.createElement("span");
    right.textContent = formatInt(run.finalScore);
    li.append(left, right);
    list.append(li);
  }
}

function setChip(name: string, text: string): void {
  document.querySelectorAll(`[data-chip="${name}"]`).forEach((node) => {
    node.textContent = text;
  });
}

function paintChips(): void {
  const wheel = chain.wheel;
  const offline = link === "offline" || (!chain.wheelKnown && chain.course.fallback);
  setChip("rpm", !chain.wheelKnown || wheel?.rpmMilli == null ? "RPM —" : `RPM ${(wheel.rpmMilli / 1000).toFixed(1)}`);
  setChip("wheel", offline ? "offline" : chain.wheelKnown ? wheelLabel(wheel?.coreStatus ?? null) : "wheel —");
  setChip("block", wheel?.blockHeight ? `block ${wheel.blockHeight}` : "block —");
  setChip("round", wheel?.settledRound ? `round ${wheel.settledRound}` : "round —");
  setChip("course", chain.course.fallback ? "course offline" : `course ${chain.course.short}`);
  const label = link === "live" ? (chain.wheelKnown ? `Live · ${wheelLabel(wheel?.coreStatus ?? null)}` : "Live course") : link === "cached" ? "Last live reading" : link === "offline" ? "Offline" : "Checking the wheel…";
  document.querySelectorAll<HTMLElement>("[data-live]").forEach((node) => {
    node.classList.remove("live-on", "live-cache", "live-off");
    if (link === "live") node.classList.add("live-on");
    else if (link === "cached") node.classList.add("live-cache");
    else if (link === "offline") node.classList.add("live-off");
  });
  document.querySelectorAll("[data-live-text]").forEach((node) => {
    node.textContent = label;
  });
  const hero = $("hero-wheel");
  const rpm = chain.wheelKnown ? chain.rpm : null;
  if (rpm !== null && rpm >= 1) {
    hero.classList.add("spinning");
    hero.style.animationDuration = `${Math.max(0.35, 60 / rpm).toFixed(2)}s`;
  } else {
    hero.classList.remove("spinning");
    hero.style.animationDuration = "";
  }
  $("hero-ham").classList.toggle("holder", Boolean(profile?.holder));
}

function paintWallet(): void {
  const connected = Boolean(wallet.address);
  const label = connected ? (wallet.ens ?? shortAddress(wallet.address ?? "")) : "Connect wallet";
  document.querySelectorAll<HTMLButtonElement>(".js-connect").forEach((button) => {
    button.textContent = label;
    button.classList.toggle("connected", connected);
  });
  const modal = $("wallet-modal");
  if (modal.hidden) return;
  $("wallet-picker").hidden = connected;
  $("wallet-account").hidden = !connected;
  const empty = $("wallet-empty");
  const links = $("wallet-links");
  const list = $("wallet-list");
  links.replaceChildren();
  list.replaceChildren();
  if (!connected && wallet.wallets.length === 0) {
    empty.hidden = false;
    empty.textContent = isMobileDevice()
      ? "No wallet in this browser. Open the site in a wallet’s in-app browser."
      : "No injected wallet found. Install one, then reload this page.";
    if (isMobileDevice()) {
      for (const link of walletDeepLinks()) {
        const anchor = document.createElement("a");
        anchor.href = link.href;
        anchor.textContent = link.name;
        anchor.rel = "noopener";
        links.append(anchor);
      }
    }
  } else if (!connected) {
    empty.hidden = false;
    empty.textContent = "Choose a detected wallet. Connecting does not send a transaction.";
    for (const item of wallet.wallets) {
      const button = document.createElement("button");
      button.type = "button";
      if (item.icon) {
        const img = document.createElement("img");
        img.alt = "";
        img.src = item.icon;
        button.append(img);
      } else {
        const mark = document.createElement("span");
        mark.className = "wallet-mark";
        mark.textContent = item.name.slice(0, 1);
        button.append(mark);
      }
      button.append(document.createTextNode(item.name));
      button.addEventListener("click", () => void wallet.connect(item.rdns));
      list.append(button);
    }
  } else {
    empty.hidden = true;
    const who = wallet.ens ? `${wallet.ens} · ${shortAddress(wallet.address ?? "")}` : shortAddress(wallet.address ?? "");
    $("wallet-address").textContent = who;
    $("wallet-chain").textContent = chainLabel(wallet.chainId);
    $("wallet-switch").hidden = wallet.chainId === SEPOLIA_CHAIN_ID;
    $("wallet-holder").textContent = holderCopy();
  }
  const error = $("wallet-error");
  error.hidden = !wallet.error;
  error.textContent = wallet.error ?? "";
}

function holderCopy(): string {
  if (profileState === "loading" || profileState === "idle") return "Looking up this account on Squeekchain…";
  if (profileState === "missing" || !profile) return "Squeekchain account data is unavailable.";
  if (profile.unavailable) return "Squeekchain account data is unavailable.";
  const parts: string[] = [];
  if (profile.walletSqueeks !== null) parts.push(`${profile.walletSqueeks} Squeek${profile.walletSqueeks === "1" ? "" : "s"} in wallet`);
  if (profile.stakingSqueeks !== null) parts.push(`${profile.stakingSqueeks} staked`);
  if (profile.claimableDisplay) parts.push(`claimable ${profile.claimableDisplay} ${chain.symbol}`);
  if (profile.holder) parts.unshift("Holder skin on");
  if (parts.length === 0) return "Squeek counts were not in the response.";
  if (!profile.holder && profile.walletSqueeks === "0" && (profile.stakingSqueeks === "0" || profile.stakingSqueeks === null)) {
    return "No Squeeks held or staked. The guest hamster stays on.";
  }
  return parts.join(" · ");
}

function paint(): void {
  const phase = game.phase;
  const playing = phase === "playing" || phase === "paused";
  document.body.classList.toggle("is-playing", playing);
  document.body.classList.toggle("mode-night", game.visual === "night");
  document.body.classList.toggle("mode-fault", game.visual === "fault");
  $("score").textContent = formatInt(game.totalScore());
  $("lives").textContent = "♥ ".repeat(Math.max(0, game.lives)).trim() || "—";
  $("coins").textContent = `${game.pickups} ${game.pickups === 1 ? "seed" : "seeds"}`;
  $("pace").textContent = phase === "attract" ? "pace —" : game.paceLive ? (game.paceLeadM >= 0 ? `ahead ${game.paceLeadM.toFixed(1)} m` : `wheel leads ${Math.abs(game.paceLeadM).toFixed(1)} m`) : "no live pace";
  const buffs: string[] = [];
  if (game.holder) buffs.push("holder");
  if (game.shield) buffs.push("shield");
  if (game.magnet > 0) buffs.push("magnet");
  if (game.sprocket > 0) buffs.push("sprocket");
  if (game.prediction && phase === "playing") buffs.push(game.prediction === "above" ? "call: more" : "call: less");
  $("buffs").textContent = buffs.join(" · ");
  $("playbar").hidden = !playing;
  paintChips();

  const canCall = chain.basis !== null && !chain.course.fallback;
  $<HTMLButtonElement>("call-above").disabled = !canCall;
  $<HTMLButtonElement>("call-below").disabled = !canCall;
  $<HTMLButtonElement>("land-above").disabled = !canCall;
  $<HTMLButtonElement>("land-below").disabled = !canCall;
  $("call-copy").textContent = canCall && chain.basis
    ? `Round ${chain.basis.round} added ${chain.basis.workAdded} work. Call it, or just sprint.`
    : "Live settlements are offline, so this sprint has no call.";
  $("land-call-note").textContent = !canCall
    ? "Calls need a live settlement. Play now still starts the fallback course."
    : pendingCall === "above"
      ? "Play now calls more work. A hit doubles the score later."
      : pendingCall === "below"
        ? "Play now calls less work. A hit doubles the score later."
        : "No call selected. Play now starts immediately.";
  const best = bestForSeed(save.runs, chain.course.seed);
  $("course-best").textContent = best === null ? "No best on this course yet." : `Best on this course: ${formatInt(best)}`;
  const onPlay = document.body.classList.contains("route-play");
  $("ready").hidden = !onPlay || phase !== "attract";
  $("overlay").hidden = phase !== "over";
  $("paused").hidden = phase !== "paused";
  if (phase === "over" && game.lastRun) {
    const run = game.lastRun;
    const courseBest = bestForSeed(save.runs, run.seed);
    $("over-score").textContent = formatInt(run.finalScore);
    $("over-meta").textContent = `${run.nickname} · ${run.distanceM.toFixed(0)} m · ${run.pickups} pickups`;
    $("over-best").textContent = courseBest === null ? "First score on this course." : `Best on this course: ${formatInt(courseBest)}`;
    $("over-call").textContent =
      run.status === "pending" ? "Call open. A hit doubles this score on this device." : run.status === "hit" ? "Call hit. Score doubled." : run.status === "miss" ? "Call missed. Score stays as run." : run.status === "tie" ? "Call tied. Score unchanged." : "No call on this run.";
    $("over-detail").textContent = run.paceBonus ? "Ahead of the wheel: +25%." : run.seedFallback ? "Fallback course. Live settlement hash unavailable." : `Course ${run.seedShort}.`;
  }
  if (phase !== "playing") {
    fillBoard($("board"), save.runs);
    fillBoard($("board-over"), save.runs);
  }
  $<HTMLButtonElement>("pause").hidden = !playing;
  $<HTMLButtonElement>("pause").textContent = phase === "paused" ? "Resume" : "Pause";
  $<HTMLButtonElement>("mute").textContent = save.muted ? "Muted" : "Sound";
  $<HTMLButtonElement>("mute").setAttribute("aria-pressed", save.muted ? "true" : "false");
  paintWallet();
}

function begin(prediction: CallSide | null): void {
  if (prediction && (!chain.basis || chain.course.fallback)) return;
  if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  audio.unlock();
  audio.ui();
  const holder = Boolean(profile?.holder);
  game.holder = holder;
  game.start({
    nickname: playerLabel(),
    address: wallet.address,
    holder,
    prediction,
    snapshot: chain,
  });
  paint();
}

function applyRoute(autostart: boolean): void {
  const play = window.location.pathname === "/play";
  document.body.classList.toggle("route-play", play);
  document.body.classList.toggle("route-home", !play);
  $("landing").hidden = play;
  $("game").hidden = !play;
  if (!play && (game.phase === "playing" || game.phase === "paused")) game.toTitle();
  if (play) {
    game.resize();
    if (autostart && game.phase === "attract") begin(pendingCall);
  }
  paint();
}

function go(path: "/" | "/play", autostart = false): void {
  if (window.location.pathname !== path) history.pushState({ autostart }, "", path);
  applyRoute(autostart);
}

async function refreshAccount(): Promise<void> {
  const address = wallet.address;
  const token = ++accountToken;
  if (!address) {
    profile = null;
    profileFor = "";
    profileState = "idle";
    game.holder = false;
    paint();
    return;
  }
  profileState = "loading";
  const next = await loadAccount(address, chain.decimals || 18);
  if (token !== accountToken) return;
  profile = next;
  profileFor = address.toLowerCase();
  profileState = next ? "ready" : "missing";
  game.holder = Boolean(next?.holder);
  paint();
}

function openWallet(): void {
  $("wallet-modal").hidden = false;
  paintWallet();
}

function wire(): void {
  $<HTMLButtonElement>("play-now").addEventListener("click", () => go("/play", true));
  $<HTMLButtonElement>("home").addEventListener("click", () => go("/"));
  document.querySelectorAll(".js-connect").forEach((button) => button.addEventListener("click", () => openWallet()));
  $<HTMLButtonElement>("wallet-close").addEventListener("click", () => {
    $("wallet-modal").hidden = true;
  });
  $("wallet-modal").addEventListener("click", (event) => {
    if (event.target === $("wallet-modal")) $("wallet-modal").hidden = true;
  });
  $<HTMLButtonElement>("wallet-disconnect").addEventListener("click", () => wallet.disconnect());
  $<HTMLButtonElement>("wallet-switch").addEventListener("click", () => void wallet.switchToSepolia());
  const toggleCall = (side: CallSide, button: HTMLButtonElement, other: HTMLButtonElement) => {
    pendingCall = pendingCall === side ? null : side;
    button.setAttribute("aria-pressed", pendingCall === side ? "true" : "false");
    other.setAttribute("aria-pressed", "false");
    paint();
  };
  $<HTMLButtonElement>("land-above").addEventListener("click", () => toggleCall("above", $<HTMLButtonElement>("land-above"), $<HTMLButtonElement>("land-below")));
  $<HTMLButtonElement>("land-below").addEventListener("click", () => toggleCall("below", $<HTMLButtonElement>("land-below"), $<HTMLButtonElement>("land-above")));
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
  $<HTMLButtonElement>("pause-touch").addEventListener("click", togglePause);
  $<HTMLButtonElement>("mute").addEventListener("click", () => {
    save.muted = !save.muted;
    audio.setMuted(save.muted);
    writeSave(save);
    paint();
  });
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
  hold($<HTMLButtonElement>("jump"), (down) => game.setJumpHeld(down));
  hold($<HTMLButtonElement>("duck"), (down) => game.setDuckHeld(down));
  window.addEventListener("keydown", (event) => {
    if (!document.body.classList.contains("route-play")) return;
    const typing = event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLButtonElement;
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
  window.addEventListener("popstate", () => applyRoute(false));
  window.addEventListener("resize", () => {
    if (document.body.classList.contains("route-play")) game.resize();
  });
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
  if (wallet.address && wallet.address.toLowerCase() !== profileFor) void refreshAccount();
  paint();
}

if (window.location.pathname !== "/" && window.location.pathname !== "/play") {
  history.replaceState({}, "", "/");
}
wire();
applyRoute(false);
wallet.subscribe(() => {
  const addr = wallet.address?.toLowerCase() ?? "";
  if (addr !== profileFor) void refreshAccount();
  else paint();
});
wallet.start();
void refresh();
window.setInterval(() => void refresh(), 8000);

let last = performance.now();
function frame(now: number): void {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (document.body.classList.contains("route-play")) game.update(dt);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
