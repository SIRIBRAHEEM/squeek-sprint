# Squeek Sprint

An endless runner paced by [Squeektoshi](https://squeekchain.com)’s live wheel. The course you play is cut from a real Squeekchain settlement, so everyone on that settlement shares the same jumps, gaps and pickup slots. It is a game first: you run, jump, duck, grab seeds and try to stay ahead of the hamster who is actually on the wheel.

This is a community project built for the Squeekchain Genesis **Code** path and The Buildooooor badge. It is not affiliated with Squeekchain. GitHub: [SIRIBRAHEEM](https://github.com/SIRIBRAHEEM). X: [@siribraheem33](https://x.com/siribraheem33).

There is no wallet connection, no signing, and no real-money play. Scores live in this browser.

## How the chain drives the game

Public reads come from `https://api.squeekchain.com`. The docs allow browser calls (`Access-Control-Allow-Origin: *`). The game requests the API directly and, if that fails, retries through same-origin `/api/status` and `/api/settlements` (Vercel functions, proxied by Vite in local dev). If both fail, it does **not** invent RPM, block height or work. The HUD shows dashes and the course is labeled `fallback`.

| What you feel | Endpoint | Fields |
| --- | --- | --- |
| Day / night and the big background wheel | `GET /v1/status` | `measurement.coreStatus` (`ACTIVE`, `IDLE`, `COUNTER_FAULT`), `measurement.rpmMilli`, `measurement.freshness` |
| How fast the ground moves while he is running | `GET /v1/status` | `measurement.speedMmPerSecond`, with `rpmMilli` if rim speed is missing |
| The ghost you race | `GET /v1/status` | `measurement.distanceMm` sampled across the run. Lead is your distance minus his real millimetres since the start whistle |
| Block and round in the HUD | `GET /v1/status` | `builder.anchor.blockHeight`, `builder.anchor.settledThroughRound` (only when `builder.status` is `available`) |
| Open-round work on the title card | `GET /v1/status` | `builder.queued.openRoundWorkUnits` |
| Shared course | `GET /v1/settlements?range=24h` | Newest `recentSettlements[]` row that completed blocks: `transactionHash` is the seed, plus `settledThroughRound` and `blockHeight` |
| Pre-run call | `GET /v1/settlements?range=24h` | That row’s `workAdded`. You call whether the **next** block-completing settlement adds more or less. Rounds that complete no blocks are counted by the API but not listed, so the course can lag the settled round while he rests |
| SQK spark value | `GET /v1/settlements?range=24h` | `recentSettlements[].sqkMintedBaseUnits`, formatted with `mining.economy.decimals` and labeled with `mining.economy.symbol` |

`GET /v1/economy/state` was checked while building this. Issuance for a round is already on the settlements payload, so the game does not download the full deployment document just to print a supply figure.

Night replaces flex slots (extra seeds by day, bats or moon cheese at night). The skeleton — crates, spokes, beams, gaps, and the seeded pickup columns — does not change with the wheel, so the course stays comparable.

A hit on the call doubles that run’s score on this device once a newer `recentSettlements` row exists. Until then the row stays “call open”. A tie (same `workAdded`) does not double. Wrong calls keep the raw score.

Beating the ghost at the whistle adds 25%. The ghost is only drawn when `distanceMm` was actually returned.

## Play

1. Open the site. The strip under the title is live telemetry: RPM, wheel state, settled block, settled round, course hash.
2. Pick **More work** or **Less work**, or sprint with no call.
3. Jump crates and spokes, duck beams, clear gaps. You get three lives, a shield blocks one hit, the magnet pulls pickups, and the sprocket is a short burst that also helps you pass the ghost.
4. Game over stores the run. Share posts an X intent with the score, the course hash and this site’s URL. No API key.

**Keyboard:** Space / ↑ / W jump, ↓ / S duck, P pause, M mute. Double jump is allowed. Tap jump early and hold for a fuller hop.

**Touch:** Duck, Pause and Jump sit under the playfield. The layout is a 16:9 stage, so portrait phones keep the buttons off the canvas.

Personal bests are kept per course seed in `localStorage` (`squeek-sprint-v1`).

## Local development

```bash
npm install
npm run dev
```

Vite serves the game and proxies `/api/status` and `/api/settlements` to the public API. `npm run typecheck` runs `tsc --noEmit`. `npm run build` typechecks and writes `dist/`.

## Deploy on Vercel

1. Import this GitHub repository in Vercel.
2. Framework preset: Vite (auto-detected). Build command `npm run build`, output `dist`. No environment variables.
3. Deploy. The `/api` functions ship with the project and need no extra config.

## Direct verification placeholders

Squeekchain’s Direct check generates three values when the owner submits: a DNS record, a page tag, and a repository line. They are not known until that form is submitted, so this repo only reserves the spots.

1. Deploy the site on a domain you control.
2. Submit the project at [squeekchain.com/genesis/code](https://squeekchain.com/genesis/code) using **Direct**.
3. Add the DNS record they give you to that domain.
4. Paste the page tag into `index.html` inside `<head>`, on the blank line under the comment that starts `SQUEEKCHAIN DIRECT VERIFICATION — PAGE TAG`, then redeploy.
5. Paste the repository line on the blank line under the comment below, and push it to this public repo.
6. Press Verify on Squeekchain.

<!-- SQUEEKCHAIN DIRECT VERIFICATION — REPOSITORY LINE
Paste the repository line from the Genesis Direct verification below this comment, on its own line, then commit it to this public repo.
-->

## Offline behavior

If the API cannot be reached, the game still runs on the fixed seed `FALLBACK-OFFLINE-COURSE`. The title says live data is unavailable. RPM, block, round and the pace ghost stay blank rather than showing made-up numbers. Calls stay disabled until a real `workAdded` arrives.
