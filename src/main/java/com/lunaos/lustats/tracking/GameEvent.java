package com.lunaos.lustats.tracking;

/**
 * A single timeline event (a death or an earned advancement). Plain public
 * fields so Gson can serialize it straight to the web API. Fields that do not
 * apply to a given {@link #type} stay {@code null}.
 */
public final class GameEvent {
    public static final String TYPE_DEATH = "death";
    public static final String TYPE_ADVANCEMENT = "advancement";

    /** Monotonic id used by the dashboard to fetch only events newer than it. */
    public long seq;
    public String type;
    public long time;
    public String timestamp;

    public String playerId;
    public String playerName;

    public String dimension;
    public int x;
    public int y;
    public int z;

    // --- death ---
    /** Vanilla damage source id, e.g. "mob", "fall", "player", "lava". */
    public String cause;
    /** Fully localized vanilla death message. */
    public String message;
    /** Entity type id of the killer, e.g. "minecraft:creeper", or null. */
    public String killerType;
    /** Localized killer name (mob or player), or null. */
    public String killerName;
    /** UUID of the killer when the killer is a player, else null. */
    public String killerPlayerId;

    // --- advancement ---
    public String advancementId;
    public String advancementTitle;
    /** "task", "goal" or "challenge". */
    public String advancementKind;
}
