import { GROUND, WORLD_H } from "./constants";
import type { CourseEnt, Floater, Particle, Player, Star, Visual } from "./types";

export interface Scene {
  cameraX: number;
  time: number;
  visual: Visual;
  accent: string;
  player: Player;
  ents: CourseEnt[];
  particles: Particle[];
  floaters: Floater[];
  ghostX: number | null;
  shake: number;
  invuln: number;
  shield: boolean;
  magnet: number;
  sprocket: number;
  rpm: number | null;
  wheelAngle: number;
  stars: Star[];
  wheelKnown: boolean;
  viewW: number;
  skyExtra: number;
  holder: boolean;
  bestGhost: { x: number; y: number; duck: boolean } | null;
  eventText: string;
}

interface Palette {
  skyTop: string;
  skyBottom: string;
  hill: string;
  hillFar: string;
  soil: string;
  soilDeep: string;
  grass: string;
  pit: string;
  ceiling: string;
  root: string;
}

const PALETTES: Record<Visual, Palette> = {
  day: {
    skyTop: "#10162c",
    skyBottom: "#3a2158",
    hill: "#24143a",
    hillFar: "#312050",
    soil: "#120c18",
    soilDeep: "#09070f",
    grass: "#ff8a3d",
    pit: "#07060c",
    ceiling: "#0d101c",
    root: "#1a1430",
  },
  night: {
    skyTop: "#070b18",
    skyBottom: "#152044",
    hill: "#10182e",
    hillFar: "#18243f",
    soil: "#0c101c",
    soilDeep: "#070910",
    grass: "#2ee6c7",
    pit: "#05070d",
    ceiling: "#080c16",
    root: "#12182c",
  },
  dusk: {
    skyTop: "#12141f",
    skyBottom: "#2a2438",
    hill: "#221c2c",
    hillFar: "#2c2638",
    soil: "#141018",
    soilDeep: "#0c0a10",
    grass: "#8d7a9a",
    pit: "#08070c",
    ceiling: "#101018",
    root: "#1a1824",
  },
  fault: {
    skyTop: "#1a1018",
    skyBottom: "#3a1824",
    hill: "#2a1420",
    hillFar: "#3a1c28",
    soil: "#160e12",
    soilDeep: "#0c080a",
    grass: "#e25b4a",
    pit: "#0a0608",
    ceiling: "#140c10",
    root: "#241018",
  },
};

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function screenX(worldX: number, cameraX: number): number {
  return worldX - cameraX;
}

export function renderFrame(ctx: CanvasRenderingContext2D, scene: Scene, reduceMotion: boolean): void {
  const pal = PALETTES[scene.visual];
  const sky = ctx.createLinearGradient(0, 0, 0, GROUND);
  sky.addColorStop(0, pal.skyTop);
  sky.addColorStop(0.72, pal.skyBottom);
  sky.addColorStop(1, scene.visual === "night" ? "#12324a" : scene.visual === "day" ? "#5a2a28" : pal.skyBottom);
  const width = scene.viewW;
  ctx.fillStyle = sky;
  ctx.fillRect(0, -scene.skyExtra, width, WORLD_H + scene.skyExtra);

  drawCeiling(ctx, scene, pal);
  if (scene.visual === "night") drawStars(ctx, scene);
  else {
    drawSun(ctx, scene);
    drawClouds(ctx, scene);
  }
  drawWheel(ctx, scene, reduceMotion);
  drawHills(ctx, scene, pal);
  drawGround(ctx, scene, pal);
  for (const ent of scene.ents) drawEnt(ctx, scene, ent);
  if (scene.ghostX !== null) drawGhost(ctx, scene);
  if (scene.bestGhost) drawBestGhost(ctx, scene);
  drawPlayer(ctx, scene);
  if (scene.eventText) drawEvent(ctx, scene);
  drawParticles(ctx, scene);
  drawFloaters(ctx, scene);
  if (scene.shake > 0.15) {
    ctx.fillStyle = `rgba(180, 32, 24, ${0.18 * scene.shake})`;
    ctx.fillRect(0, -scene.skyExtra, width, WORLD_H + scene.skyExtra);
  }
  if (!scene.wheelKnown) {
    ctx.fillStyle = "rgba(42, 27, 18, 0.18)";
    ctx.fillRect(0, -scene.skyExtra, width, WORLD_H + scene.skyExtra);
  }
}

function drawCeiling(ctx: CanvasRenderingContext2D, scene: Scene, pal: Palette): void {
  ctx.fillStyle = pal.ceiling;
  ctx.fillRect(0, 0, scene.viewW, 64);
  ctx.fillStyle = pal.root;
  const scroll = scene.cameraX * 0.4;
  for (let i = -1; i < 12; i += 1) {
    const x = i * 90 - (scroll % 90);
    ctx.beginPath();
    ctx.moveTo(x, 64);
    ctx.quadraticCurveTo(x + 18, 96, x + 8, 120);
    ctx.quadraticCurveTo(x + 28, 90, x + 40, 64);
    ctx.fill();
  }
  ctx.fillStyle = pal.soilDeep;
  ctx.fillRect(0, 0, scene.viewW, 18);
}

function drawStars(ctx: CanvasRenderingContext2D, scene: Scene): void {
  for (const star of scene.stars) {
    const span = scene.viewW;
    const x = ((star.x - scene.cameraX * 0.05) % span + span) % span;
    const alpha = 0.45 + Math.sin(scene.time * 2 + star.tw) * 0.35;
    ctx.fillStyle = `rgba(190, 255, 245, ${alpha})`;
    ctx.beginPath();
    ctx.arc(x, star.y, star.r, 0, Math.PI * 2);
    ctx.fill();
  }
  const moonX = 470;
  ctx.fillStyle = "#d7fff6";
  ctx.beginPath();
  ctx.arc(moonX, 120, 28, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = PALETTES.night.skyTop;
  ctx.beginPath();
  ctx.arc(moonX + 12, 112, 22, 0, Math.PI * 2);
  ctx.fill();
}

function drawSun(ctx: CanvasRenderingContext2D, scene: Scene): void {
  ctx.fillStyle = scene.visual === "fault" ? "rgba(226,91,74,0.45)" : "rgba(255,138,61,0.85)";
  ctx.beginPath();
  ctx.arc(160 - (scene.cameraX * 0.02) % 40, 130, 36, 0, Math.PI * 2);
  ctx.fill();
}

function drawClouds(ctx: CanvasRenderingContext2D, scene: Scene): void {
  ctx.fillStyle = "rgba(46, 230, 199, 0.16)";
  const scroll = scene.cameraX * 0.06;
  for (const base of [70, 250, 430]) {
    const x = ((base - scroll) % 640 + 640) % 640;
    ctx.beginPath();
    ctx.ellipse(x, 108, 26, 11, 0, 0, Math.PI * 2);
    ctx.ellipse(x + 20, 114, 18, 9, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawWheel(ctx: CanvasRenderingContext2D, scene: Scene, reduceMotion: boolean): void {
  const cx = Math.max(180, scene.viewW * 0.72);
  const cy = 148;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.globalAlpha = scene.wheelKnown ? 0.55 : 0.28;
  ctx.strokeStyle = scene.visual === "night" ? "#2ee6c7" : "#ff8a3d";
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.arc(0, 0, 58, 0, Math.PI * 2);
  ctx.stroke();
  ctx.lineWidth = 3;
  const angle = reduceMotion ? 0 : scene.wheelAngle;
  ctx.rotate(angle);
  for (let i = 0; i < 6; i += 1) {
    ctx.rotate(Math.PI / 3);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(58, 0);
    ctx.stroke();
  }
  ctx.restore();
  ctx.globalAlpha = 1;
  ctx.fillStyle = "#d7fff6";
  ctx.font = "700 13px Outfit, sans-serif";
  ctx.textAlign = "center";
  const label = scene.rpm === null ? "wheel offline" : `${scene.rpm.toFixed(1)} rpm`;
  ctx.fillText(label, cx, cy + 82);
  ctx.textAlign = "left";
}

function drawHills(ctx: CanvasRenderingContext2D, scene: Scene, pal: Palette): void {
  const far = scene.cameraX * 0.15;
  ctx.fillStyle = pal.hillFar;
  ctx.beginPath();
  ctx.moveTo(0, GROUND);
  for (let x = 0; x <= scene.viewW; x += 20) {
    const y = 300 + Math.sin((x + far) * 0.01) * 26 + Math.sin((x + far) * 0.004) * 18;
    ctx.lineTo(x, y);
  }
  ctx.lineTo(scene.viewW, GROUND);
  ctx.fill();

  const near = scene.cameraX * 0.32;
  ctx.fillStyle = pal.hill;
  ctx.beginPath();
  ctx.moveTo(0, GROUND);
  for (let x = 0; x <= scene.viewW; x += 16) {
    const y = 350 + Math.sin((x + near) * 0.016) * 18;
    ctx.lineTo(x, y);
  }
  ctx.lineTo(scene.viewW, GROUND);
  ctx.fill();
}

function drawGround(ctx: CanvasRenderingContext2D, scene: Scene, pal: Palette): void {
  ctx.fillStyle = pal.soil;
  ctx.fillRect(0, GROUND, scene.viewW, WORLD_H - GROUND);
  ctx.fillStyle = pal.grass;
  ctx.fillRect(0, GROUND, scene.viewW, 10);
  ctx.fillStyle = pal.soilDeep;
  const offset = scene.cameraX % 48;
  for (let x = -offset; x < scene.viewW; x += 48) {
    ctx.fillRect(x, GROUND + 28, 22, 6);
  }
  for (const ent of scene.ents) {
    if (ent.kind !== "gap") continue;
    const x = screenX(ent.x, scene.cameraX);
    if (x > scene.viewW || x + ent.w < 0) continue;
    ctx.fillStyle = pal.pit;
    ctx.fillRect(x, GROUND, ent.w, WORLD_H - GROUND);
    ctx.fillStyle = pal.soilDeep;
    ctx.fillRect(x - 4, GROUND, 6, 18);
    ctx.fillRect(x + ent.w - 2, GROUND, 6, 18);
  }
}

function drawEnt(ctx: CanvasRenderingContext2D, scene: Scene, ent: CourseEnt): void {
  if (ent.taken) return;
  const x = screenX(ent.x, scene.cameraX);
  if (x > scene.viewW + 40 || x + ent.w < -40) return;
  if (ent.kind === "gap") return;
  if (ent.kind === "crate") drawCrate(ctx, x, ent);
  else if (ent.kind === "spoke") drawSpoke(ctx, x, ent, scene.time);
  else if (ent.kind === "beam") drawBeam(ctx, x, ent, scene);
  else if (ent.kind === "seed" || (ent.kind === "flex" && ent.form === "seeds")) drawSeed(ctx, x, ent, scene.time);
  else if (ent.kind === "sqk") drawSqk(ctx, x, ent, scene);
  else if (ent.kind === "power" && ent.power) drawPower(ctx, x, ent, scene.time);
  else if (ent.form === "bat") drawBat(ctx, x, ent, scene.time);
  else if (ent.form === "cheese") drawCheese(ctx, x, ent, scene.time);
}

function drawCrate(ctx: CanvasRenderingContext2D, x: number, ent: CourseEnt): void {
  ctx.fillStyle = "#8a5a32";
  roundRect(ctx, x, ent.y, ent.w, ent.h, 6);
  ctx.fill();
  ctx.strokeStyle = "#f0d2a4";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x + 6, ent.y + 6);
  ctx.lineTo(x + ent.w - 6, ent.y + ent.h - 6);
  ctx.moveTo(x + ent.w - 6, ent.y + 6);
  ctx.lineTo(x + 6, ent.y + ent.h - 6);
  ctx.stroke();
}

function drawSpoke(ctx: CanvasRenderingContext2D, x: number, ent: CourseEnt, time: number): void {
  const cx = x + ent.w / 2;
  const cy = ent.y + ent.h / 2;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(time * 4 + ent.phase);
  ctx.fillStyle = "#5c4636";
  ctx.beginPath();
  ctx.arc(0, 0, ent.w / 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#f2d7b0";
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(-ent.w / 2, 0);
  ctx.lineTo(ent.w / 2, 0);
  ctx.moveTo(0, -ent.h / 2);
  ctx.lineTo(0, ent.h / 2);
  ctx.stroke();
  ctx.restore();
}

function drawBeam(ctx: CanvasRenderingContext2D, x: number, ent: CourseEnt, scene: Scene): void {
  ctx.strokeStyle = scene.visual === "night" ? "#9eb0d8" : "#6b422c";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(x + ent.w / 2, 64);
  ctx.lineTo(x + ent.w / 2, ent.y);
  ctx.stroke();
  ctx.fillStyle = scene.visual === "night" ? "#d5def8" : "#c9844a";
  roundRect(ctx, x, ent.y, ent.w, ent.h, 6);
  ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,0.25)";
  ctx.fillRect(x + 6, ent.y + 5, ent.w - 12, 4);
}

function drawSeed(ctx: CanvasRenderingContext2D, x: number, ent: CourseEnt, time: number): void {
  const bob = Math.sin(time * 3 + ent.phase) * 3;
  ctx.save();
  ctx.translate(x + ent.w / 2, ent.y + ent.h / 2 + bob);
  ctx.rotate(-0.4);
  ctx.fillStyle = "#f2c14e";
  ctx.beginPath();
  ctx.ellipse(0, 0, 9, 6, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#fff4cc";
  ctx.beginPath();
  ctx.ellipse(-2, -1, 3, 2, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawSqk(ctx: CanvasRenderingContext2D, x: number, ent: CourseEnt, scene: Scene): void {
  const bob = Math.sin(scene.time * 3 + ent.phase) * 3;
  const cx = x + ent.w / 2;
  const cy = ent.y + ent.h / 2 + bob;
  ctx.fillStyle = scene.accent;
  ctx.beginPath();
  for (let i = 0; i < 6; i += 1) {
    const a = (Math.PI / 3) * i - Math.PI / 2;
    const px = cx + Math.cos(a) * 12;
    const py = cy + Math.sin(a) * 12;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#fff8ea";
  ctx.font = "700 11px Outfit, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("S", cx, cy + 4);
  ctx.textAlign = "left";
}

function drawCheese(ctx: CanvasRenderingContext2D, x: number, ent: CourseEnt, time: number): void {
  const bob = Math.sin(time * 2.4 + ent.phase) * 3;
  ctx.fillStyle = "#f6de7a";
  ctx.beginPath();
  ctx.arc(x + 12, ent.y + 12 + bob, 11, 0.3, Math.PI * 1.7);
  ctx.fill();
  ctx.fillStyle = "#e6b84e";
  ctx.beginPath();
  ctx.arc(x + 8, ent.y + 10 + bob, 2, 0, Math.PI * 2);
  ctx.arc(x + 14, ent.y + 15 + bob, 1.6, 0, Math.PI * 2);
  ctx.fill();
}

function drawBat(ctx: CanvasRenderingContext2D, x: number, ent: CourseEnt, time: number): void {
  const y = ent.y + Math.sin(time * 3.2 + ent.phase) * 26;
  const flap = Math.sin(time * 14 + ent.phase) * 8;
  ctx.fillStyle = "#1c1830";
  ctx.beginPath();
  ctx.ellipse(x + ent.w / 2, y + ent.h / 2, 8, 6, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(x + ent.w / 2, y + ent.h / 2);
  ctx.quadraticCurveTo(x - 6, y + flap, x + 4, y + ent.h);
  ctx.quadraticCurveTo(x + 8, y + 4, x + ent.w / 2, y + ent.h / 2);
  ctx.moveTo(x + ent.w / 2, y + ent.h / 2);
  ctx.quadraticCurveTo(x + ent.w + 6, y + flap, x + ent.w - 4, y + ent.h);
  ctx.quadraticCurveTo(x + ent.w - 8, y + 4, x + ent.w / 2, y + ent.h / 2);
  ctx.fill();
  ctx.fillStyle = "#f2c14e";
  ctx.fillRect(x + 14, y + 10, 2, 2);
  ctx.fillRect(x + 22, y + 10, 2, 2);
}

function drawPower(ctx: CanvasRenderingContext2D, x: number, ent: CourseEnt, time: number): void {
  const bob = Math.sin(time * 4 + ent.phase) * 4;
  const cx = x + ent.w / 2;
  const cy = ent.y + ent.h / 2 + bob;
  ctx.save();
  ctx.translate(cx, cy);
  if (ent.power === "shield") {
    ctx.strokeStyle = "#7ec8ff";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, 0, 12, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = "rgba(126,200,255,0.25)";
    ctx.fill();
  } else if (ent.power === "magnet") {
    ctx.strokeStyle = "#e24b4b";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(0, 2, 9, Math.PI, 0);
    ctx.stroke();
    ctx.strokeStyle = "#d8dde6";
    ctx.beginPath();
    ctx.moveTo(-9, 2);
    ctx.lineTo(-9, 10);
    ctx.moveTo(9, 2);
    ctx.lineTo(9, 10);
    ctx.stroke();
  } else {
    ctx.strokeStyle = "#f2c14e";
    ctx.fillStyle = "#f2c14e";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, 0, 7, 0, Math.PI * 2);
    ctx.stroke();
    for (let i = 0; i < 6; i += 1) {
      ctx.rotate(Math.PI / 3);
      ctx.fillRect(8, -2, 5, 4);
    }
  }
  ctx.restore();
}

function drawGhost(ctx: CanvasRenderingContext2D, scene: Scene): void {
  if (scene.ghostX === null) return;
  const x = screenX(scene.ghostX, scene.cameraX);
  const clamped = Math.max(28, Math.min(scene.viewW - 70, x));
  const label = x < 28 ? "← Squeek" : x > scene.viewW - 70 ? "Squeek →" : "Squeek";
  ctx.save();
  ctx.globalAlpha = 0.72;
  drawHamster(ctx, clamped, GROUND - 36, 40, 36, {
    run: scene.time * 10,
    duck: false,
    onGround: true,
    squash: 0,
    night: true,
    ghost: true,
    blink: false,
  });
  ctx.globalAlpha = 1;
  ctx.fillStyle = "#d7e4ff";
  ctx.font = "700 12px Outfit, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(label, clamped + 20, GROUND - 44);
  ctx.restore();
  ctx.textAlign = "left";
}

function drawBestGhost(ctx: CanvasRenderingContext2D, scene: Scene): void {
  const ghost = scene.bestGhost;
  if (!ghost) return;
  const x = screenX(ghost.x, scene.cameraX);
  if (x < -80 || x > scene.viewW + 40) return;
  ctx.save();
  ctx.globalAlpha = 0.45;
  drawHamster(ctx, x, ghost.y, 52, 48, {
    run: scene.time * 10,
    duck: ghost.duck,
    onGround: true,
    squash: 0,
    night: false,
    ghost: false,
    blink: false,
    holder: true,
  });
  ctx.globalAlpha = 0.9;
  ctx.fillStyle = "#2ee6c7";
  ctx.font = "700 12px Outfit, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("Best", x + 26, ghost.y - 8);
  ctx.restore();
  ctx.textAlign = "left";
}

function drawEvent(ctx: CanvasRenderingContext2D, scene: Scene): void {
  ctx.save();
  ctx.font = "700 18px Outfit, sans-serif";
  ctx.textAlign = "center";
  const width = Math.min(scene.viewW - 40, ctx.measureText(scene.eventText).width + 28);
  const x = (scene.viewW - width) / 2;
  ctx.fillStyle = "rgba(8, 12, 24, 0.82)";
  roundRect(ctx, x, 74, width, 32, 16);
  ctx.fill();
  ctx.fillStyle = "#2ee6c7";
  ctx.fillText(scene.eventText, scene.viewW / 2, 96);
  ctx.restore();
  ctx.textAlign = "left";
}

function drawPlayer(ctx: CanvasRenderingContext2D, scene: Scene): void {
  if (scene.invuln > 0 && Math.floor(scene.time * 14) % 2 === 0) return;
  const p = scene.player;
  drawHamster(ctx, screenX(p.x, scene.cameraX), p.y, p.w, p.h, {
    run: p.run,
    duck: p.duck,
    onGround: p.onGround,
    squash: p.squash,
    night: scene.visual === "night",
    ghost: false,
    blink: Math.sin(scene.time * 0.7) > 0.97,
    holder: scene.holder,
  });
  if (scene.shield) {
    ctx.strokeStyle = "rgba(126,200,255,0.9)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.ellipse(screenX(p.x, scene.cameraX) + p.w / 2, p.y + p.h / 2, p.w * 0.7, p.h * 0.75, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  if (scene.sprocket > 0) {
    ctx.strokeStyle = scene.accent;
    ctx.globalAlpha = 0.7;
    ctx.lineWidth = 2;
    const px = screenX(p.x, scene.cameraX);
    for (let i = 1; i <= 3; i += 1) {
      ctx.beginPath();
      ctx.moveTo(px - i * 10, p.y + 16);
      ctx.lineTo(px - i * 16, p.y + 22);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
}

interface HamsterOpts {
  run: number;
  duck: boolean;
  onGround: boolean;
  squash: number;
  night: boolean;
  ghost: boolean;
  blink: boolean;
  holder?: boolean;
}

function drawHamster(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  opts: HamsterOpts,
): void {
  const fur = opts.ghost ? "#9db0d4" : "#e7a15a";
  const belly = opts.ghost ? "#d5e0f5" : "#f6d7b8";
  const dark = opts.ghost ? "#6d82ad" : "#c47b34";
  ctx.save();
  ctx.translate(x + w / 2, y + h);
  const duckScale = opts.duck ? 0.62 : 1 - opts.squash * 0.18;
  const wide = opts.duck ? 1.18 : 1 + opts.squash * 0.12;
  ctx.scale(wide, duckScale);
  const bob = opts.onGround ? Math.sin(opts.run * 1.3) * 1.4 : 0;
  ctx.translate(0, -h + bob);

  ctx.fillStyle = "rgba(20,10,6,0.18)";
  ctx.beginPath();
  ctx.ellipse(0, h - 2, w * 0.32, 4, 0, 0, Math.PI * 2);
  ctx.fill();

  const swing = opts.onGround ? Math.sin(opts.run) * 7 : 3;
  ctx.strokeStyle = dark;
  ctx.lineWidth = 3;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(-8, h - 16);
  ctx.lineTo(-12 - swing, h - 2);
  ctx.moveTo(8, h - 16);
  ctx.lineTo(12 + swing, h - 2);
  ctx.stroke();

  ctx.strokeStyle = fur;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(-16, 16);
  ctx.quadraticCurveTo(-28, 8, -22, 22);
  ctx.stroke();

  ctx.fillStyle = fur;
  ctx.beginPath();
  ctx.ellipse(0, h * 0.42, w * 0.42, h * 0.36, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = belly;
  ctx.beginPath();
  ctx.ellipse(2, h * 0.5, w * 0.24, h * 0.22, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = fur;
  ctx.beginPath();
  ctx.ellipse(-10, 8, 8, 10, -0.3, 0, Math.PI * 2);
  ctx.ellipse(12, 6, 8, 10, 0.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = opts.holder ? "#f2c14e" : "#f0a0b0";
  ctx.beginPath();
  ctx.ellipse(-10, 9, 4, 5, -0.3, 0, Math.PI * 2);
  ctx.ellipse(12, 7, 4, 5, 0.2, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = fur;
  ctx.beginPath();
  ctx.arc(6, 12, 13, 0, Math.PI * 2);
  ctx.fill();

  if (opts.blink) {
    ctx.strokeStyle = "#2a1c14";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(2, 11);
    ctx.lineTo(8, 11);
    ctx.moveTo(12, 10);
    ctx.lineTo(18, 10);
    ctx.stroke();
  } else {
    ctx.fillStyle = "#fffaf3";
    ctx.beginPath();
    ctx.ellipse(4, 11, 4.2, 4.6, 0, 0, Math.PI * 2);
    ctx.ellipse(14, 10, 4.2, 4.6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#2a1c14";
    ctx.beginPath();
    ctx.arc(5.4, 11.6, 2.1, 0, Math.PI * 2);
    ctx.arc(15.4, 10.6, 2.1, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.fillStyle = "#f099a8";
  ctx.beginPath();
  ctx.ellipse(1, 16, 3.2, 2.1, 0, 0, Math.PI * 2);
  ctx.ellipse(16, 15, 3.2, 2.1, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#c45b6a";
  ctx.beginPath();
  ctx.ellipse(11, 15, 2.3, 1.6, 0, 0, Math.PI * 2);
  ctx.fill();

  if (opts.holder && !opts.ghost) {
    ctx.fillStyle = "#f2c14e";
    ctx.fillRect(-6, 20, 24, 5);
    ctx.fillStyle = "#2a1b12";
    ctx.fillRect(4, 20, 4, 5);
  }
  if (opts.night && !opts.ghost) {
    ctx.fillStyle = "rgba(255, 214, 120, 0.35)";
    ctx.beginPath();
    ctx.moveTo(18, 12);
    ctx.lineTo(36, 6);
    ctx.lineTo(36, 22);
    ctx.fill();
  }
  ctx.restore();
}

function drawParticles(ctx: CanvasRenderingContext2D, scene: Scene): void {
  for (const p of scene.particles) {
    ctx.globalAlpha = Math.max(0, p.life / p.max);
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(screenX(p.x, scene.cameraX), p.y, p.size, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function drawFloaters(ctx: CanvasRenderingContext2D, scene: Scene): void {
  ctx.font = "700 16px Outfit, sans-serif";
  ctx.textAlign = "center";
  for (const floater of scene.floaters) {
    ctx.globalAlpha = Math.max(0, floater.life);
    ctx.fillStyle = floater.color;
    ctx.fillText(floater.text, screenX(floater.x, scene.cameraX), floater.y);
  }
  ctx.globalAlpha = 1;
  ctx.textAlign = "left";
}
