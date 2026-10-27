# Lu-Stats

Lu-Stats is a **server-side Fabric mod for Minecraft `26.3`** that exposes player
statistics and live activity through a self-hosted web dashboard. It builds on
[Stats4Us](https://github.com/deanxbox/Stats4Us) (MIT) and adds live event
tracking, AFK and movement analytics, a death/advancement timeline, and
bidirectional cross-linking between players, mobs and death causes.

> Server-side only — nothing is required on the client. Players just play; the
> dashboard runs on the server and is opened in a browser.

## Features

### Dashboard (from Stats4Us)
- Reads vanilla statistics from the world `stats/` files plus live in-memory
  stats for online players.
- Per-player detail pages, a searchable leaderboard (every player ranked), and a
  full stat catalog.
- Player comparison (horizontal bar, pie and sortable table) — see how far each
  player is on any statistic.
- Usernames resolved for players who have not joined yet (user cache,
  whitelist/ops/ban lists and a background Mojang lookup).
- Operator `/lustats` commands to view and edit stats and hide players.

### New in Lu-Stats
- **Live web interface.** The dashboard updates itself every few seconds — a
  pulsing "Live" badge shows online count and event totals. No refresh needed.
- **Event timeline.** Deaths and earned advancements as they happen, newest
  first, with an hourly events-over-time chart.
- **Death tracking.** Every death is recorded with its cause, the full vanilla
  death message, the killer (mob or player) and the location.
- **Bidirectional linking.** Click a player, a mob or a death cause and jump
  straight to the related view:
  - player ⇄ their deaths, their killers, the mobs they kill;
  - mob ⇄ the players who kill it most and the players it kills most;
  - cause ⇄ the deaths filtered by that cause.
- **AFK tracking.** AFK is read from the vanilla activity clock, so steering a
  **boat or minecart** (any client input) keeps a player counted as active —
  genuine interaction, not just standing still. Per-player active vs. AFK time
  is accumulated.
- **Full movement tracking.** Player positions are sampled over time into a
  recent path and a bucketed **heatmap**, rendered per player (or aggregated)
  and per dimension.

## Dashboard tabs

| Tab | What it shows |
| --- | --- |
| Players | Profile, featured stats, **activity (AFK)**, **recent deaths**, **clickable mob kills**, full stat table |
| Leaderboards | Every player ranked for any statistic |
| Graphs & Charts | Player comparison (how far each player is) |
| Timeline | Live feed of deaths & advancements + events-over-time chart |
| Deaths | Deaths-by-cause / deadliest-mob / most-deaths panels + searchable death log |
| Map & AFK | Online/AFK cards (active & AFK time) + movement heatmap and path |
| All Stats | Full stat catalog |

## Configuration

The mod writes `config/lustats.json` on first launch. Tracking and history are
persisted in `config/lustats-events.json`, `config/lustats-movement.json`,
`config/lustats-history.json` and `config/lustats-names.json`.

Key fields:

- `web.enabled` / `web.bindAddress` (default `0.0.0.0`) / `web.port` (default `8765`).
- `tracking.enabled` — master switch for the event log, AFK and movement tracking.
- `tracking.trackDeaths` / `tracking.trackAdvancements`.
- `tracking.maxEvents` — timeline events kept (default `5000`).
- `tracking.afkThresholdSeconds` — AFK after this idle time (default `300`).
- `tracking.movementSampleSeconds` — position sample interval (default `5`).
- `tracking.movementBucketSize` — heatmap grid size in blocks (default `8`).
- `tracking.movementMaxPointsPerPlayer` / `tracking.movementMaxBucketsPerPlayer`.
- `display.*` — which stat categories/keys are shown, hidden players, etc.
- `history.*` — periodic history sampling.

Open the dashboard at `http://<server-ip>:<web.port>/`.

> **Exposure note:** the dashboard has no built-in authentication. If you expose
> `web.port` publicly, put it behind trusted network rules or a reverse proxy
> with authentication.

## Commands

Operator-only (`/lustats`): `web`, `reload`, `hide`/`unhide`/`hidden`,
`stats [search]`, `player <player> [search]`, `get`, `set`, `add`.

## Building

Requires **JDK 25** (Minecraft 26.3 targets Java 25).

```bash
./gradlew build
```

The mod jar is written to `build/libs/lustats-<version>.jar`.

Run a test server locally with `./gradlew runServer` (accept the EULA in
`run/eula.txt`).

## Credits & license

Lu-Stats is derived from **[Stats4Us](https://github.com/deanxbox/Stats4Us)** by
deanxbox, used under the MIT License. Lu-Stats is also MIT licensed — see
[`LICENSE`](LICENSE), which retains both copyright notices.
