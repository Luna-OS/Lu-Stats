# Changelog

All notable changes to Lu-Stats will be documented in this file.

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
