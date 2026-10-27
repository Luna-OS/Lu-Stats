package com.lunaos.lustats.config;

import java.util.ArrayList;
import java.util.List;

public final class LuStatsConfig {
    public Web web = new Web();
    public Display display = new Display();
    public History history = new History();
    public Tracking tracking = new Tracking();

    public static final class Web {
        public boolean enabled = true;
        public String bindAddress = "0.0.0.0";
        public int port = 8765;
        public int requestTimeoutSeconds = 10;
        /** Title shown in the dashboard header and tab. */
        public String siteTitle = "Lu-Stats";
        /** Allow players to hide themselves from the dashboard via /lustats privat. */
        public boolean allowPrivate = true;
        /** Max concurrent live (SSE) connections per IP. */
        public int maxLiveConnectionsPerIp = 6;
    }

    public static final class Display {
        public boolean showZeroValues = false;
        public boolean showOfflinePlayers = true;
        public int maxStatsPerPlayer = 0;
        public List<String> enabledStatTypes = new ArrayList<>(List.of(
            "minecraft:custom",
            "minecraft:mined",
            "minecraft:crafted",
            "minecraft:used",
            "minecraft:broken",
            "minecraft:picked_up",
            "minecraft:dropped",
            "minecraft:killed",
            "minecraft:killed_by"
        ));
        public List<String> enabledStats = new ArrayList<>();
        public List<String> hiddenStats = new ArrayList<>();
        public List<String> hiddenPlayers = new ArrayList<>();
        public List<String> featuredStats = new ArrayList<>(List.of(
            "minecraft:custom|minecraft:play_time",
            "minecraft:custom|minecraft:deaths",
            "minecraft:custom|minecraft:mob_kills",
            "minecraft:custom|minecraft:player_kills",
            "minecraft:custom|minecraft:damage_dealt",
            "minecraft:custom|minecraft:damage_taken",
            "minecraft:custom|minecraft:walk_one_cm",
            "minecraft:custom|minecraft:jump"
        ));
    }

    public static final class History {
        public boolean enabled = true;
        public int sampleIntervalSeconds = 300;
        public int maxSamples = 2016;
        public List<String> trackedStats = new ArrayList<>(List.of(
            "minecraft:custom|minecraft:play_time",
            "minecraft:custom|minecraft:deaths",
            "minecraft:custom|minecraft:mob_kills",
            "minecraft:custom|minecraft:player_kills",
            "minecraft:custom|minecraft:damage_dealt",
            "minecraft:custom|minecraft:damage_taken",
            "minecraft:custom|minecraft:walk_one_cm",
            "minecraft:custom|minecraft:jump"
        ));
    }

    /**
     * Live tracking: deaths and advancements timeline, AFK detection and full
     * player movement sampling (positions + a bucketed heatmap).
     */
    public static final class Tracking {
        /** Master switch for the event log, AFK and movement tracking. */
        public boolean enabled = true;

        // --- Event timeline (deaths + advancements) ---
        /** Record player deaths (cause, death message, killer) in the timeline. */
        public boolean trackDeaths = true;
        /** Record earned advancements (tasks, goals, challenges) in the timeline. */
        public boolean trackAdvancements = true;
        /** Maximum number of timeline events kept in memory and on disk. */
        public int maxEvents = 5000;

        // --- AFK ---
        /** A player counts as AFK after this many seconds without any client action. */
        public int afkThresholdSeconds = 300;

        // --- Movement ---
        /** Sample every online player's position this often (seconds). */
        public int movementSampleSeconds = 5;
        /** Heatmap bucket size in blocks (positions are rounded to this grid). */
        public int movementBucketSize = 8;
        /** Maximum recent path points kept per player. */
        public int movementMaxPointsPerPlayer = 2000;
        /** Maximum distinct heatmap buckets kept per player (oldest-pruned). */
        public int movementMaxBucketsPerPlayer = 6000;
    }
}
