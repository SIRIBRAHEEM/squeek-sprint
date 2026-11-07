import { createCourse, ensureCourse, forgetBehind, realizeFlex, type Course } from "./course";
import {
  FALLBACK_SEED,
  GRAVITY,
  GROUND,
  JUMP2_V,
  JUMP_V,
  PLAYER_H,
  PLAYER_W,
  PX_PER_MM,
  WORLD_H,
  WORLD_W,
} from "./constants";
import { renderFrame } from "./render";
import type { AudioBus } from "./audio";
import type {
  CallSide,
  ChainSnapshot,
  CourseEnt,
  Floater,
  Particle,
  Phase,
  Player,
  RunRecord,
  Visual,
} from "./types";

export interface StartOpts {
  nickname: string;
  address: string | null;
  holder: boolean;
  prediction: CallSide | null;
  snapshot: ChainSnapshot;
}

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

function rectsOverlap(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function hitbox(player: Player): Rect {
  if (player.duck && player.onGround) {
    const h = 28;
    return { x: player.x + 10, y: player.y + player.h - h, w: player.w - 16, h };
  }
  return { x: player.x + 8, y: player.y + 4, w: player.w - 14, h: player.h - 6 };
}

export class Game {
  phase: Phase = "attract";
  cameraX = 0;
  time = 0;
  visual: Visual = "dusk";
  accent = "#ef7a2d";
  player: Player = this.makePlayer();
  course: Course = createCourse(FALLBACK_SEED);
  particles: Particle[] = [];
  floaters: Floater[] = [];
  ghostX: number | null = null;
  shake = 0;
  invuln = 0;
  shield = false;
  magnet = 0;
  sprocket = 0;
  rpm: number | null = null;
  wheelAngle = 0;
  wheelKnown = false;
  score = 0;
  pickupScore = 0;
  pickups = 0;
  combo = 0;
  lives = 3;
  distanceM = 0;
  paceLeadM = 0;
  paceLive = false;
  paceBonus = false;
  sqkValue = 30;
  chain: ChainSnapshot | null = null;
  runChain: ChainSnapshot | null = null;
  prediction: CallSide | null = null;
  nickname = "Squeeker";
  address: string | null = null;
  holder = false;
  lastRun: RunRecord | null = null;

  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private audio: AudioBus;
  private onChange: () => void;
  private onRun: (run: RunRecord) => void;
  private reduceMotion: boolean;
  private speed = 280;
  private coyote = 0;
  private jumpBuffer = 0;
  private jumpHeld = false;
  private duckHeld = false;
  private wheelMm = 0;
  private wheelBase: number | null = null;
  private wheelFrozen = false;
  private runStartX = 120;
  private dust = 0;
  private lastHud = "";

  constructor(
    canvas: HTMLCanvasElement,
    audio: AudioBus,
    onChange: () => void,
    onRun: (run: RunRecord) => void,
  ) {
    this.canvas = canvas;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("canvas 2d unavailable");
    this.ctx = ctx;
    this.audio = audio;
    this.onChange = onChange;
    this.onRun = onRun;
    this.reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    this.resetWorld(FALLBACK_SEED);
    this.resize();
  }

  resize(): void {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const width = Math.max(1, Math.round(rect.width * dpr));
    const height = Math.max(1, Math.round(rect.height * dpr));
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
    }
  }

  setChain(snapshot: ChainSnapshot): void {
    this.chain = snapshot;
    if (this.phase === "playing" || this.phase === "paused") {
      this.applyLiveWheel(snapshot, false);
      return;
    }
    if (this.course.seed !== snapshot.course.seed) {
      this.resetWorld(snapshot.course.seed);
      this.accent = this.course.accent;
    }
    this.applyLiveWheel(snapshot, true);
    this.noteHud();
  }

  start(opts: StartOpts): void {
    this.nickname = opts.nickname;
    this.address = opts.address;
    this.holder = opts.holder;
    this.prediction = opts.prediction;
    this.runChain = opts.snapshot;
    this.resetWorld(opts.snapshot.course.seed);
    this.accent = this.course.accent;
    this.lives = 3;
    this.score = 0;
    this.pickupScore = 0;
    this.pickups = 0;
    this.combo = 0;
    this.shield = false;
    this.magnet = 0;
    this.sprocket = 0;
    this.invuln = 0;
    this.shake = 0;
    this.paceBonus = false;
    this.sqkValue = opts.snapshot.basis?.sqkMintedBaseUnits && opts.snapshot.basis.sqkMintedBaseUnits !== "0" ? 50 : 30;
    this.phase = "playing";
    this.wheelBase = opts.snapshot.wheel?.distanceMm ?? null;
    this.wheelMm = 0;
    this.wheelFrozen = this.wheelBase === null;
    this.paceLive = this.wheelBase !== null;
    this.runStartX = this.player.x;
    this.applyLiveWheel(opts.snapshot, true);
    this.audio.unlock();
    this.noteHud(true);
  }

  pause(): void {
    if (this.phase !== "playing") return;
    this.phase = "paused";
    this.noteHud(true);
  }

  resume(): void {
    if (this.phase !== "paused") return;
    this.phase = "playing";
    this.noteHud(true);
  }

  toTitle(): void {
    this.phase = "attract";
    this.prediction = null;
    const seed = this.chain?.course.seed ?? FALLBACK_SEED;
    this.resetWorld(seed);
    if (this.chain) this.applyLiveWheel(this.chain, true);
    this.noteHud(true);
  }

  setJumpHeld(down: boolean): void {
    if (down && !this.jumpHeld) this.jumpBuffer = 0.14;
    this.jumpHeld = down;
  }

  setDuckHeld(down: boolean): void {
    this.duckHeld = down;
  }

  private makePlayer(): Player {
    return {
      x: 140,
      y: GROUND - PLAYER_H,
      vy: 0,
      w: PLAYER_W,
      h: PLAYER_H,
      onGround: true,
      duck: false,
      jumpsLeft: 2,
      run: 0,
      squash: 0,
    };
  }

  private resetWorld(seed: string): void {
    this.course = createCourse(seed);
    this.player = this.makePlayer();
    this.particles = [];
    this.floaters = [];
    this.cameraX = 0;
    this.speed = 260;
    this.ghostX = null;
    ensureCourse(this.course, 1800);
  }

  private applyLiveWheel(snapshot: ChainSnapshot, resetDistance: boolean): void {
    this.visual = snapshot.wheelKnown ? snapshot.visual : "dusk";
    this.rpm = snapshot.wheelKnown ? snapshot.rpm : null;
    this.wheelKnown = snapshot.wheelKnown;
    if (resetDistance) return;
    const next = snapshot.wheel?.distanceMm;
    if (this.wheelBase === null || next === null || next === undefined) return;
    if (next + 50 < this.wheelBase) {
      this.wheelFrozen = true;
      return;
    }
    if (!this.wheelFrozen) this.wheelMm = Math.max(this.wheelMm, next - this.wheelBase);
  }

  private targetSpeed(): number {
    const far = Math.min(0.32, this.player.x / 12000);
    const difficulty = 1 + far;
    let base = 300;
    if (this.wheelKnown && this.visual === "day") {
      const rim = this.chain?.wheel?.speedMmPerSecond;
      if (rim !== null && rim !== undefined && rim > 0) {
        base = Math.min(520, Math.max(280, rim * 0.34));
      } else {
        const rpm = this.rpm ?? 0;
        base = Math.min(520, Math.max(280, 250 + rpm * 2.4));
      }
    } else if (this.visual === "night") {
      base = 246;
    } else if (this.visual === "fault") {
      base = 270;
    }
    const hitSlow = this.phase === "playing" && this.invuln > 0.35 ? 0.74 : 1;
    return base * difficulty * hitSlow + (this.sprocket > 0 ? 72 : 0);
  }

  update(dt: number): void {
    this.resize();
    if (this.phase === "paused") {
      this.draw();
      this.audio.setRunning(false, this.visual === "night");
      return;
    }
    this.time += dt;
    if (this.wheelKnown && this.rpm !== null && !this.reduceMotion) {
      this.wheelAngle += (this.rpm / 60) * Math.PI * 2 * dt;
    }
    if (this.phase === "attract") this.thinkAttract();

    const steps = Math.max(1, Math.ceil(dt / (1 / 120)));
    const h = dt / steps;
    for (let i = 0; i < steps; i += 1) this.step(h);

    this.shake = Math.max(0, this.shake - dt * 1.8);
    this.invuln = Math.max(0, this.invuln - dt);
    this.magnet = Math.max(0, this.magnet - dt);
    this.sprocket = Math.max(0, this.sprocket - dt);
    this.player.squash = Math.max(0, this.player.squash - dt * 3);
    this.ageFx(dt);
    this.audio.setRunning(this.phase === "playing", this.visual === "night");
    this.audio.update(dt);
    this.draw();
    this.noteHud();
  }

  private step(dt: number): void {
    const playing = this.phase === "playing";
    const moving = playing || this.phase === "attract";
    if (!moving) return;

    const target = this.targetSpeed() + (this.sprocket > 0 ? 50 : 0);
    this.speed += (target - this.speed) * Math.min(1, dt * 2.2);
    if (playing) {
      const mult = this.sprocket > 0 ? 1.5 : 1;
      this.score += this.speed * dt * 0.09 * mult;
      this.distanceM = this.player.x / 48;
    }

    this.player.x += this.speed * dt;
    this.player.run += dt * (this.player.onGround ? 14 : 4);
    this.player.duck = this.duckHeld && this.player.onGround;

    if (this.player.onGround) {
      this.player.jumpsLeft = 2;
      this.coyote = 0.12;
    } else {
      this.coyote -= dt;
      if (this.coyote <= 0 && this.player.jumpsLeft === 2) this.player.jumpsLeft = 1;
    }
    if (this.jumpBuffer > 0) {
      this.jumpBuffer -= dt;
      this.tryJump();
    }

    this.player.vy += GRAVITY * dt;
    if (!this.jumpHeld && this.player.vy < -240) this.player.vy = -240;
    this.player.y += this.player.vy * dt;

    const cx = this.player.x + this.player.w / 2;
    const overGap = this.course.ents.some(
      (ent) => ent.kind === "gap" && cx > ent.x + 6 && cx < ent.x + ent.w - 6,
    );
    const floorY = GROUND - this.player.h;
    if (!overGap && this.player.vy >= 0 && this.player.y >= floorY - 0.5) {
      if (!this.player.onGround) this.player.squash = 1;
      this.player.y = floorY;
      this.player.vy = 0;
      this.player.onGround = true;
    } else if (this.player.y < floorY - 0.5 || overGap) {
      this.player.onGround = false;
    }

    if (this.player.y > GROUND + 80) this.fell();

    this.cameraX = this.player.x - 150;
    const night = this.visual === "night";
    ensureCourse(this.course, this.cameraX + WORLD_W + 900);
    realizeFlex(this.course, night, this.cameraX + WORLD_W + 280);
    this.collide(playing);
    this.pullMagnet(dt);
    forgetBehind(this.course, this.cameraX - 400);

    if (playing && this.paceLive) {
      const runMm = (this.player.x - this.runStartX) / PX_PER_MM;
      this.paceLeadM = (runMm - this.wheelMm) / 1000;
      this.ghostX = this.runStartX + this.wheelMm * PX_PER_MM;
    } else {
      this.ghostX = null;
      this.paceLeadM = 0;
    }

    if (playing && this.player.onGround) {
      this.dust -= dt;
      if (this.dust <= 0) {
        this.dust = 0.08;
        this.burst(this.player.x + 8, GROUND - 2, 2, "#c9a27a", 20);
      }
    }
  }

  private tryJump(): void {
    if (this.phase !== "playing" && this.phase !== "attract") return;
    if (this.duckHeld && this.player.onGround) return;
    const grounded = this.player.onGround || this.coyote > 0;
    if (!grounded && this.player.jumpsLeft <= 0) return;
    if (grounded && this.player.jumpsLeft < 1 && !this.player.onGround && this.coyote <= 0) return;
    this.player.duck = false;
    if (grounded) {
      this.player.vy = JUMP_V * -1;
      this.player.jumpsLeft = 1;
      this.coyote = 0;
    } else {
      this.player.vy = JUMP2_V * -1;
      this.player.jumpsLeft = 0;
    }
    this.player.onGround = false;
    this.jumpBuffer = 0;
    if (this.phase === "playing") this.audio.jump();
  }

  private thinkAttract(): void {
    let jump = false;
    let duck = false;
    const ahead = this.player.x + this.player.w;
    for (const ent of this.course.ents) {
      if (ent.taken) continue;
      const dist = ent.x - ahead;
      if (dist < -8 || dist > 160) continue;
      if (ent.kind === "beam" && dist < 64) duck = true;
      if (ent.kind === "gap" && dist < 52) jump = true;
      if ((ent.kind === "crate" || ent.kind === "spoke") && dist < 86) jump = true;
      if (ent.form === "bat" && dist < 90) jump = true;
    }
    this.duckHeld = duck && !jump;
    if (jump && this.player.onGround) this.jumpBuffer = 0.12;
  }

  private fell(): void {
    const cx = this.player.x + this.player.w / 2;
    const gap = this.course.ents.find(
      (ent) => ent.kind === "gap" && cx > ent.x && cx < ent.x + ent.w,
    );
    if (gap) this.player.x = gap.x + gap.w + 16;
    this.player.y = GROUND - this.player.h;
    this.player.vy = 0;
    this.player.onGround = true;
    if (this.phase === "attract") return;
    this.hurt();
  }

  private collide(playing: boolean): void {
    const box = hitbox(this.player);
    for (const ent of this.course.ents) {
      if (ent.taken || ent.kind === "gap") continue;
      if (ent.kind === "flex" && !ent.resolved) continue;
      const bounds = this.entBounds(ent);
      if (!bounds || !rectsOverlap(box, bounds)) continue;
      if (this.isPickup(ent)) {
        if (playing) this.collect(ent);
        else ent.taken = true;
        continue;
      }
      if (playing) this.hurt();
    }
  }

  private entBounds(ent: CourseEnt): Rect | null {
    if (ent.form === "bat") {
      const y = ent.y + Math.sin(this.time * 3.2 + ent.phase) * 26;
      return { x: ent.x, y, w: ent.w, h: ent.h };
    }
    if (ent.kind === "seed" || ent.kind === "sqk" || ent.kind === "power" || ent.form === "seeds" || ent.form === "cheese") {
      const bob = Math.sin(this.time * 3 + ent.phase) * 3;
      return { x: ent.x, y: ent.y + bob, w: ent.w, h: ent.h };
    }
    return { x: ent.x, y: ent.y, w: ent.w, h: ent.h };
  }

  private isPickup(ent: CourseEnt): boolean {
    return (
      ent.kind === "seed" ||
      ent.kind === "sqk" ||
      ent.kind === "power" ||
      ent.form === "seeds" ||
      ent.form === "cheese"
    );
  }

  private collect(ent: CourseEnt): void {
    ent.taken = true;
    this.pickups += 1;
    this.combo = Math.min(8, this.combo + 1);
    let points = 15;
    let label = `+15`;
    let color = "#f2c14e";
    if (ent.kind === "sqk") {
      points = this.sqkValue;
      label = `+${points}`;
      color = this.accent;
    } else if (ent.form === "cheese") {
      points = 40;
      label = "+40";
      color = "#f6de7a";
    } else if (ent.kind === "power" && ent.power) {
      points = 25;
      label = ent.power === "shield" ? "shield" : ent.power === "magnet" ? "magnet" : "sprocket";
      color = "#ffffff";
      if (ent.power === "shield") this.shield = true;
      if (ent.power === "magnet") this.magnet = 7;
      if (ent.power === "sprocket") this.sprocket = 5.5;
      this.audio.power();
    }
    if (ent.kind !== "power") {
      const gained = points * this.combo * (this.sprocket > 0 ? 2 : 1);
      this.pickupScore += gained;
      label = `+${gained}`;
      this.audio.coin(this.combo);
    } else {
      this.pickupScore += points;
    }
    this.floaters.push({
      x: ent.x,
      y: ent.y - 10,
      text: this.combo > 1 && ent.kind !== "power" ? `${label} ×${this.combo}` : label,
      life: 1,
      color,
    });
    this.burst(ent.x + ent.w / 2, ent.y + ent.h / 2, 8, color, 90);
  }

  private hurt(): void {
    if (this.invuln > 0 || this.phase !== "playing") return;
    if (this.shield) {
      this.shield = false;
      this.invuln = 0.9;
      this.audio.power();
      this.floaters.push({
        x: this.player.x,
        y: this.player.y,
        text: "blocked",
        life: 1,
        color: "#9ed4ff",
      });
      return;
    }
    this.lives -= 1;
    this.invuln = 1.45;
    this.shake = 1;
    this.player.vy = -360;
    this.combo = 0;
    this.audio.hit();
    this.burst(this.player.x + this.player.w / 2, this.player.y + 16, 12, "#e7a15a", 160);
    if (this.lives <= 0) this.finish();
  }

  private pullMagnet(dt: number): void {
    if (this.magnet <= 0 || this.phase !== "playing") return;
    const px = this.player.x + this.player.w / 2;
    const py = this.player.y + this.player.h / 2;
    for (const ent of this.course.ents) {
      if (ent.taken || !this.isPickup(ent) || ent.kind === "power") continue;
      const dx = px - (ent.x + ent.w / 2);
      const dy = py - (ent.y + ent.h / 2);
      const dist = Math.hypot(dx, dy);
      if (dist > 190 || dist < 1) continue;
      ent.x += (dx / dist) * 280 * dt;
      ent.y += (dy / dist) * 280 * dt;
    }
  }

  private burst(x: number, y: number, count: number, color: string, speed: number): void {
    for (let i = 0; i < count; i += 1) {
      const a = Math.random() * Math.PI * 2;
      const v = speed * (0.3 + Math.random());
      this.particles.push({
        x,
        y,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v - 30,
        life: 0.45 + Math.random() * 0.25,
        max: 0.7,
        color,
        size: 1.5 + Math.random() * 2.2,
      });
    }
    if (this.particles.length > 140) this.particles.splice(0, this.particles.length - 140);
  }

  private ageFx(dt: number): void {
    for (const p of this.particles) {
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 400 * dt;
    }
    this.particles = this.particles.filter((p) => p.life > 0);
    for (const f of this.floaters) {
      f.life -= dt;
      f.y -= 28 * dt;
    }
    this.floaters = this.floaters.filter((f) => f.life > 0);
  }

  private finish(): void {
    this.phase = "over";
    const paceBonus = this.paceLive && this.paceLeadM > 0;
    let raw = Math.floor(this.score + this.pickupScore);
    if (paceBonus) raw = Math.floor(raw * 1.25);
    const snap = this.runChain;
    const run: RunRecord = {
      id: crypto.randomUUID(),
      nickname: this.nickname,
      address: this.address,
      at: Date.now(),
      seed: snap?.course.seed ?? this.course.seed,
      seedShort: snap?.course.short ?? this.course.seed.slice(0, 8),
      seedFallback: snap?.course.fallback ?? true,
      round: snap?.course.round ?? null,
      rawScore: raw,
      finalScore: raw,
      pickups: this.pickups,
      distanceM: this.distanceM,
      paceBonus,
      prediction: this.prediction,
      baselineWork: this.prediction ? snap?.basis?.workAdded ?? null : null,
      baselineRound: this.prediction ? snap?.basis?.round ?? null : null,
      baselineHash: this.prediction ? snap?.basis?.hash ?? null : null,
      status: this.prediction && snap?.basis ? "pending" : "none",
      resolvedWork: null,
      resolvedRound: null,
      visual: this.visual,
    };
    this.paceBonus = paceBonus;
    this.score = raw;
    this.pickupScore = 0;
    this.lastRun = run;
    this.audio.setRunning(false, false);
    this.audio.over();
    this.onRun(run);
    this.noteHud(true);
  }

  totalScore(): number {
    if (this.phase === "over" && this.lastRun) return this.lastRun.finalScore;
    return Math.floor(this.score + this.pickupScore);
  }

  private noteHud(force = false): void {
    const key = [
      this.phase,
      this.totalScore(),
      this.lives,
      this.pickups,
      this.paceLeadM.toFixed(1),
      this.visual,
      this.rpm?.toFixed(1) ?? "-",
      this.chain?.course.short ?? "",
      this.shield ? 1 : 0,
      this.magnet > 0 ? 1 : 0,
      this.sprocket > 0 ? 1 : 0,
    ].join("|");
    if (!force && key === this.lastHud) return;
    this.lastHud = key;
    this.onChange();
  }

  private draw(): void {
    const narrow = this.canvas.width / Math.max(1, this.canvas.height) < 1.35;
    const viewW = narrow ? 560 : 920;
    const scale = this.canvas.width / viewW;
    const viewH = this.canvas.height / scale;
    const skyExtra = Math.max(0, viewH - WORLD_H);
    const cropTop = Math.max(0, WORLD_H - viewH);
    let ox = 0;
    let oy = 0;
    if (this.shake > 0 && !this.reduceMotion) {
      ox = (Math.random() - 0.5) * 12 * this.shake;
      oy = (Math.random() - 0.5) * 8 * this.shake;
    }
    this.ctx.setTransform(scale, 0, 0, scale, ox * scale, skyExtra * scale - cropTop * scale + oy * scale);
    renderFrame(
      this.ctx,
      {
        cameraX: this.cameraX,
        time: this.time,
        visual: this.visual,
        accent: this.course.accent || this.accent,
        player: this.player,
        ents: this.course.ents,
        particles: this.particles,
        floaters: this.floaters,
        ghostX: this.ghostX,
        shake: this.shake,
        invuln: this.invuln,
        shield: this.shield,
        magnet: this.magnet,
        sprocket: this.sprocket,
        rpm: this.rpm,
        wheelAngle: this.wheelAngle,
        stars: this.course.stars,
        wheelKnown: this.wheelKnown,
        viewW,
        skyExtra,
        holder: this.holder,
      },
      this.reduceMotion,
    );
  }
}
