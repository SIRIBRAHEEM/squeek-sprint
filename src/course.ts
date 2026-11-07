import { ACCENTS, GROUND } from "./constants";
import { hashSeed, mulberry32 } from "./rng";
import type { CourseEnt, PowerKind, Star } from "./types";

export interface Course {
  seed: string;
  accent: string;
  ents: CourseEnt[];
  stars: Star[];
  cursor: number;
  nextId: number;
  rng: () => number;
}

const POWERS: PowerKind[] = ["shield", "magnet", "sprocket"];

export function createCourse(seed: string): Course {
  const rng = mulberry32(hashSeed(seed));
  const accent = ACCENTS[Math.floor(rng() * ACCENTS.length)] ?? ACCENTS[0];
  const starRng = mulberry32(hashSeed(`${seed}:stars`));
  const stars: Star[] = Array.from({ length: 42 }, () => ({
    x: starRng() * 960,
    y: 18 + starRng() * 210,
    r: 0.6 + starRng() * 1.5,
    tw: starRng() * Math.PI * 2,
  }));
  const course: Course = {
    seed,
    accent,
    ents: [],
    stars,
    cursor: 0,
    nextId: 1,
    rng,
  };
  for (let i = 0; i < 4; i += 1) {
    course.ents.push({
      id: course.nextId,
      kind: "seed",
      x: 340 + i * 42,
      y: GROUND - 56,
      w: 18,
      h: 18,
      roll: 0,
      form: null,
      power: null,
      taken: false,
      phase: i,
      resolved: true,
    });
    course.nextId += 1;
  }
  return course;
}

function push(course: Course, ent: Omit<CourseEnt, "id" | "taken" | "resolved" | "form"> & { form?: CourseEnt["form"] }): void {
  course.ents.push({
    form: null,
    ...ent,
    id: course.nextId,
    taken: false,
    resolved: ent.kind !== "flex",
  });
  course.nextId += 1;
}

/**
 * Infinite skeleton. Positions come only from the seed, so every player
 * on the same settlement hash gets the same jumps, gaps and pickup slots.
 * Flex slots are realized later as day seeds or night bats/cheese.
 */
function spawnNext(course: Course): void {
  const rng = course.rng;
  if (course.cursor < 760) {
    course.cursor = 760;
    return;
  }
  const far = Math.min(1, course.cursor / 14000);
  const spacing = (230 + rng() * 150) * (1 - 0.25 * far);
  const roll = rng();
  const x = course.cursor;

  if (roll < 0.16) {
    const w = Math.min(112, (72 + rng() * 24) * (1 + 0.22 * far));
    push(course, {
      kind: "gap",
      x,
      y: GROUND,
      w,
      h: 160,
      roll: rng(),
      power: null,
      phase: rng() * 6,
    });
    course.cursor = x + w + 210 + rng() * 30;
    return;
  }

  if (roll < 0.33) {
    const spoke = rng() < 0.45;
    push(course, {
      kind: spoke ? "spoke" : "crate",
      x,
      y: GROUND - 46,
      w: 46,
      h: 46,
      roll: rng(),
      power: null,
      phase: rng() * 6,
    });
    course.cursor = x + spacing;
    return;
  }

  if (roll < 0.48) {
    push(course, {
      kind: "beam",
      x,
      y: GROUND - 64,
      w: 96,
      h: 26,
      roll: rng(),
      power: null,
      phase: rng() * 6,
    });
    course.cursor = x + spacing + 10;
    return;
  }

  if (roll < 0.66) {
    const count = 3 + Math.floor(rng() * 3);
    for (let i = 0; i < count; i += 1) {
      const high = i % 2 === 1;
      push(course, {
        kind: "seed",
        x: x + i * 34,
        y: GROUND - (high ? 132 : 56),
        w: 18,
        h: 18,
        roll: rng(),
        power: null,
        phase: rng() * 6,
      });
    }
    course.cursor = x + spacing;
    return;
  }

  if (roll < 0.78) {
    push(course, {
      kind: "sqk",
      x,
      y: GROUND - (rng() < 0.5 ? 58 : 128),
      w: 20,
      h: 20,
      roll: rng(),
      power: null,
      phase: rng() * 6,
    });
    course.cursor = x + spacing;
    return;
  }

  if (roll < 0.9) {
    push(course, {
      kind: "flex",
      x,
      y: GROUND - 60,
      w: 36,
      h: 28,
      roll: rng(),
      power: null,
      phase: rng() * 6,
    });
    course.cursor = x + spacing;
    return;
  }

  const power = POWERS[Math.floor(rng() * POWERS.length)] ?? "shield";
  push(course, {
    kind: "power",
    x,
    y: GROUND - 108,
    w: 26,
    h: 26,
    roll: rng(),
    power,
    phase: rng() * 6,
  });
  course.cursor = x + spacing + 30;
}

export function ensureCourse(course: Course, untilX: number): void {
  let guard = 0;
  while (course.cursor < untilX && guard < 80) {
    spawnNext(course);
    guard += 1;
  }
}

/** Flex slots stay unfixed until they are about to appear, then they lock. */
export function realizeFlex(course: Course, night: boolean, horizon: number): void {
  for (const ent of course.ents) {
    if (ent.kind !== "flex" || ent.resolved || ent.x > horizon) continue;
    ent.resolved = true;
    if (night) {
      if (ent.roll < 0.62) {
        ent.form = "bat";
        ent.y = GROUND - 92;
        ent.w = 40;
        ent.h = 26;
      } else {
        ent.form = "cheese";
        ent.y = GROUND - 100;
        ent.w = 22;
        ent.h = 18;
      }
    } else if (ent.roll < 0.75) {
      ent.form = "seeds";
        ent.y = GROUND - 58;
      ent.w = 18;
      ent.h = 18;
    } else {
      ent.form = "cheese";
      ent.y = GROUND - 120;
      ent.w = 22;
      ent.h = 18;
    }
  }
}

export function forgetBehind(course: Course, left: number): void {
  if (course.ents.length > 240) {
    course.ents = course.ents.filter((ent) => ent.x + ent.w > left);
  }
}
