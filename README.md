# Lu-Stats

Lu-Stats is a **server-side Fabric mod for Minecraft `26.3`** with a
self-hosted, live web dashboard in the BACAP Tracker style: advancement progress
for every player, all vanilla statistics with a leaderboard per stat, every
death with its cause, a live event feed, AFK time and a movement map. It builds
on [Stats4Us](https://github.com/deanxbox/Stats4Us) (MIT).

> Server-side only — nothing is required on the client. Players just play; the
> dashboard runs on the server and is opened in a browser.

## Features

- **Advancements.** Per-player progress for vanilla and BlazeandCave's
  Advancements Pack (BACAP), an advancement explorer, "who has it" pages and a
  player comparison, read from the live advancement registry.
- **Statistics.** Every vanilla statistic (general, mined, crafted, used,
  broken, picked up, dropped, mobs killed, killed by) with a **leaderboard per
  stat**, featured leaderboards on the stats page, and a per-player stats page
  with their rank in each stat. Values are shown in their unit (time,
  distance, hearts, count).
- **Deaths.** Every death is recorded with its cause, the vanilla death message,
  the killer (mob or player) and the location: deaths by cause, deadliest mobs
  (from the complete vanilla stats), most deaths, PvP and a searchable log.
- **Live.** Deaths and earned advancements appear instantly (Server-Sent
  Events) as in-game style toasts and in a live feed with a 24-hour chart.
- **AFK tracking.** AFK is read from the vanilla activity clock, so steering a
  boat or minecart (any client input) keeps a player counted as active.
  Active and AFK time get their own leaderboards.
- **Movement map.** Positions are sampled into a recent path and a bucketed
  heatmap per dimension, per player or for everyone together.
- **Real player heads** from the current skin, also on offline-mode servers.
- **Privacy.** Players hide themselves with `/lustats privat`; operators hide
  players with `/lustats hide`. Hidden players disappear from every page,
  leaderboard, feed and map; a death caused by a hidden player shows only
  "a player".

## Dashboard pages

| Page | What it shows |
| --- | --- |
| Start | Players, advancement ranking, recently unlocked, latest deaths |
| Advancements | Explorer of all advancements (tree, list, in-game view) |
| Stats | Who is online/AFK, featured leaderboards, every stat (searchable), map of everyone |
| Stats › one stat | Full leaderboard for that stat |
| Tode (deaths) | Totals, causes, deadliest mobs, most deaths, PvP, live death log |
| Live | Live feed of deaths and advancements, 24-hour chart |
| Player | Advancement progress, or (tab "Statistiken") stats with ranks, deaths, activity, map |
| Vergleich | Two players side by side: stats and advancements |

## Configuration

The mod writes `config/lustats.json` on first launch. Tracking and history are
persisted in `config/lustats-events.json`, `config/lustats-movement.json`,
`config/lustats-history.json`, `config/lustats-names.json` and
`config/lustats-players.json` (the `/lustats privat` choices).

Key fields:

- `web.enabled` / `web.bindAddress` (default `0.0.0.0`) / `web.port` (default `8765`).
- `web.siteTitle` — title in the header and browser tab.
- `web.allowPrivate` — allow `/lustats privat` (default `true`).
- `web.maxLiveConnectionsPerIp` — live connections per IP (default `6`). Behind
  a reverse proxy every visitor shares the proxy's IP, so raise it there.
- `tracking.enabled` — master switch for the event log, AFK and movement tracking.
- `tracking.trackDeaths` / `tracking.trackAdvancements`.
- `tracking.maxEvents` — timeline events kept (default `5000`).
- `tracking.afkThresholdSeconds` — AFK after this idle time (default `300`).
- `tracking.movementSampleSeconds` — position sample interval (default `5`).
- `tracking.movementBucketSize` — heatmap grid size in blocks (default `8`).
- `tracking.movementMaxPointsPerPlayer` / `tracking.movementMaxBucketsPerPlayer`.
- `display.*` — which stat categories/keys are shown, featured stats, hidden players.
- `history.*` — periodic history sampling.

Open the dashboard at `http://<server-ip>:<web.port>/`.

> **Exposure note:** the dashboard has no built-in authentication. If you expose
> `web.port` publicly, put it behind trusted network rules or a reverse proxy
> with authentication.

### JSON API

`/api/info`, `/api/advancements`, `/api/players`, `/api/player?name=`,
`/api/advancement?id=`, `/api/stats/catalog`, `/api/stats/overview`,
`/api/stats/top?key=`, `/api/stats/player?name=`, `/api/feed`, `/api/deaths`,
`/api/movement[?name=]`, `/api/head?name=` and the live stream `/api/events`.

## Commands

- Everyone: `/lustats privat` — hide or show yourself on the website.
- Operators: `/lustats web`, `reload`, `hide`/`unhide`/`hidden`,
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

The dashboard look, the Monocraft font (OFL) and the advancement documentation
overlay are adapted from **BACAP Tracker**; the advancement data is from
**BlazeandCave's Advancements Pack**.
