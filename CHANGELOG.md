# Changelog

All notable changes to Lu-Stats will be documented in this file.

## [1.1.0] - 2026-10-27

### Added
- Completely reworked dashboard in the **BACAP Tracker** web-GUI style (pixel /
  inventory look, Monocraft font, light/dark theme): Start/leaderboard, the
  advancement explorer, per-player pages, per-advancement pages and player
  comparison.
- **Advancement/achievement tracking** built from the live advancement registry
  (covers the BlazeandCave's Advancements Pack datapack and vanilla), enriched
  with a bundled BACAP documentation overlay. New API: `/api/info`,
  `/api/advancements`, `/api/players`, `/api/player`, `/api/advancement` and an
  SSE `/api/events` live stream with in-game-style unlock toasts.
- **Real player heads** (current skin) via a server-side head proxy
  (`/api/head`), resolving skins by name so it works on offline-mode servers;
  cached, with a generated fallback head.
- **Player opt-out**: `/lustats privat` lets any player hide themselves from the
  dashboard (no operator needed); default is visible. Toggle gated by
  `web.allowPrivate`.
- Config: `web.siteTitle`, `web.allowPrivate`, `web.maxLiveConnectionsPerIp`.

### Changed
- The web server now serves the single-page dashboard from `/web` with a strict
  same-origin CSP and SPA deep-link fallback.

### Credits
- The dashboard look, fonts (Monocraft, OFL) and the advancement documentation
  overlay are adapted from **BACAP Tracker**; the advancement data is from
  **BlazeandCave's Advancements Pack**.

## [1.0.0] - 2026-10-27

Initial Lu-Stats release for Minecraft `26.3`, derived from
[Stats4Us](https://github.com/deanxbox/Stats4Us) (MIT).

### Added
- Live, self-updating web dashboard (polls every few seconds) with a "Live"
  status badge showing online count and event totals.
- Event timeline of deaths and earned advancements, with an hourly
  events-over-time chart.
- Death tracking: cause, full vanilla death message, killer (mob or player) and
  location, recorded to `config/lustats-events.json`.
- Advancement tracking via a `PlayerAdvancements` mixin (tasks, goals,
  challenges; recipes excluded).
- AFK tracking from the vanilla activity clock, so boat/minecart steering and
  any client input counts as active; per-player active vs. AFK time is
  accumulated.
- Full movement tracking: sampled positions into a recent path and a bucketed
  heatmap, per player (or aggregated) and per dimension, persisted to
  `config/lustats-movement.json`.
- Bidirectional cross-linking across players, mobs and death causes on the
  dashboard.
- New dashboard tabs: Timeline, Deaths, and Map & AFK; the Players tab gains an
  activity panel, recent deaths and clickable mob-kill cross-references.
- New web API endpoints: `/api/events`, `/api/activity`, `/api/movement`.
- `tracking.*` configuration section.

### Changed
- Rebranded from Stats4Us to Lu-Stats (`com.lunaos.lustats`, mod id `lustats`,
  `/lustats` commands).
- Dashboard HTML/CSS/JS moved to a served resource (`assets/lustats/index.html`).

### Credits
- Based on Stats4Us by deanxbox, used under the MIT License. See `LICENSE`.
