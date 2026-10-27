package com.lunaos.lustats.tracking;

import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import com.lunaos.lustats.LuStatsMod;
import com.lunaos.lustats.config.LuStatsConfig;
import net.fabricmc.loader.api.FabricLoader;
import net.minecraft.util.Util;
import net.minecraft.core.BlockPos;
import net.minecraft.server.MinecraftServer;
import net.minecraft.server.level.ServerPlayer;

import java.io.IOException;
import java.io.Reader;
import java.io.Writer;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Deque;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Tracks per-player activity: AFK state (from the vanilla last-action clock, so
 * steering a boat or minecart counts as activity exactly as the idle-kick does)
 * and full movement — a recent path plus a bucketed heatmap. Ticked from the
 * server thread once per second; read from web threads, so state is guarded by
 * {@link #lock}. Persisted to {@code config/lustats-movement.json}.
 */
public final class ActivityTracker {
    private static final Gson GSON = new GsonBuilder().disableHtmlEscaping().create();
    /** Cap a single accumulation delta so a reconnect never counts offline time. */
    private static final long MAX_DELTA_MILLIS = 5000L;

    private final Object lock = new Object();
    private final Map<String, PlayerActivity> players = new LinkedHashMap<>();
    private final Path path;

    private LuStatsConfig.Tracking config;

    public ActivityTracker(final LuStatsConfig.Tracking config) {
        this.config = config;
        this.path = FabricLoader.getInstance().getConfigDir().resolve("lustats-movement.json");
        load();
    }

    public void setConfig(final LuStatsConfig.Tracking config) {
        synchronized (lock) {
            this.config = config;
        }
    }

    public void tick(final MinecraftServer server) {
        synchronized (lock) {
            long nowMonotonic = Util.getMillis();
            long nowWall = System.currentTimeMillis();
            long afkThresholdMillis = config.afkThresholdSeconds * 1000L;
            long sampleIntervalMillis = config.movementSampleSeconds * 1000L;

            for (ServerPlayer player : server.getPlayerList().getPlayers()) {
                String id = player.getGameProfile().id().toString();
                PlayerActivity activity = players.computeIfAbsent(id, key -> new PlayerActivity());
                activity.name = player.getGameProfile().name();
                activity.lastSeen = nowWall;

                long idleMillis = Math.max(0, nowMonotonic - player.getLastActionTime());
                boolean afk = idleMillis >= afkThresholdMillis;
                activity.afk = afk;
                activity.idleMillis = idleMillis;

                if (activity.lastAccountedMonotonic > 0) {
                    long delta = Math.min(MAX_DELTA_MILLIS, Math.max(0, nowMonotonic - activity.lastAccountedMonotonic));
                    if (afk) {
                        activity.totalAfkMillis += delta;
                    } else {
                        activity.totalActiveMillis += delta;
                    }
                }
                activity.lastAccountedMonotonic = nowMonotonic;

                BlockPos pos = player.blockPosition();
                String dimension = player.level().dimension().identifier().toString();
                activity.dimension = dimension;
                activity.x = pos.getX();
                activity.y = pos.getY();
                activity.z = pos.getZ();

                if (nowWall - activity.lastSampleWall >= sampleIntervalMillis) {
                    activity.lastSampleWall = nowWall;
                    recordMovement(activity, dimension, pos.getX(), pos.getY(), pos.getZ(), nowWall);
                }
            }
        }
    }

    private void recordMovement(final PlayerActivity activity, final String dimension,
                                final int x, final int y, final int z, final long wall) {
        MovePoint point = new MovePoint();
        point.t = wall;
        point.dim = dimension;
        point.x = x;
        point.y = y;
        point.z = z;
        activity.path.addLast(point);
        while (activity.path.size() > config.movementMaxPointsPerPlayer) {
            activity.path.removeFirst();
        }

        int bucket = Math.max(1, config.movementBucketSize);
        int bx = Math.floorDiv(x, bucket) * bucket;
        int bz = Math.floorDiv(z, bucket) * bucket;
        String key = dimension + "|" + bx + "|" + bz;
        activity.heat.merge(key, 1, Integer::sum);
        while (activity.heat.size() > config.movementMaxBucketsPerPlayer) {
            Iterator<String> iterator = activity.heat.keySet().iterator();
            iterator.next();
            iterator.remove();
        }
        activity.distanceSamples++;
    }

    // ---- read side (web threads) ----

    public List<PlayerActivityDto> snapshot(final MinecraftServer server) {
        synchronized (lock) {
            java.util.Set<String> online = new java.util.HashSet<>();
            for (ServerPlayer player : server.getPlayerList().getPlayers()) {
                online.add(player.getGameProfile().id().toString());
            }
            List<PlayerActivityDto> out = new ArrayList<>();
            for (Map.Entry<String, PlayerActivity> entry : players.entrySet()) {
                PlayerActivity activity = entry.getValue();
                PlayerActivityDto dto = new PlayerActivityDto();
                dto.id = entry.getKey();
                dto.name = activity.name;
                dto.online = online.contains(entry.getKey());
                dto.afk = dto.online && activity.afk;
                dto.idleSeconds = dto.online ? activity.idleMillis / 1000L : 0;
                dto.totalActiveSeconds = activity.totalActiveMillis / 1000L;
                dto.totalAfkSeconds = activity.totalAfkMillis / 1000L;
                dto.dimension = activity.dimension;
                dto.x = activity.x;
                dto.y = activity.y;
                dto.z = activity.z;
                dto.lastSeen = activity.lastSeen;
                dto.pathPoints = activity.path.size();
                dto.heatBuckets = activity.heat.size();
                out.add(dto);
            }
            return out;
        }
    }

    /** Movement detail for one player, or aggregated across all when id is null/blank. */
    public MovementDto movement(final String playerId, final int maxPoints) {
        synchronized (lock) {
            List<String> ids = playerId == null || playerId.isBlank() ? new ArrayList<>(players.keySet()) : List.of(playerId);
            MovementDto dto = movementOf(ids, maxPoints);
            dto.playerId = playerId;
            return dto;
        }
    }

    /** Movement of the given players: merged heatmap, plus the path when exactly one player is selected. */
    public MovementDto movementOf(final java.util.Collection<String> playerIds, final int maxPoints) {
        synchronized (lock) {
            MovementDto dto = new MovementDto();
            dto.bucketSize = Math.max(1, config.movementBucketSize);

            Map<String, Integer> mergedHeat = new LinkedHashMap<>();
            List<PlayerActivity> selected = new ArrayList<>();
            for (String id : playerIds) {
                PlayerActivity activity = players.get(id);
                if (activity != null) {
                    selected.add(activity);
                }
            }

            for (PlayerActivity activity : selected) {
                for (Map.Entry<String, Integer> entry : activity.heat.entrySet()) {
                    mergedHeat.merge(entry.getKey(), entry.getValue(), Integer::sum);
                }
            }
            for (Map.Entry<String, Integer> entry : mergedHeat.entrySet()) {
                String[] parts = entry.getKey().split("\\|", 3);
                if (parts.length != 3) {
                    continue;
                }
                HeatBucketDto bucket = new HeatBucketDto();
                bucket.dim = parts[0];
                try {
                    bucket.x = Integer.parseInt(parts[1]);
                    bucket.z = Integer.parseInt(parts[2]);
                } catch (NumberFormatException ignored) {
                    continue;
                }
                bucket.count = entry.getValue();
                dto.heat.add(bucket);
            }

            // Only a single player's path makes sense to draw as a line.
            if (selected.size() == 1) {
                List<MovePoint> path = new ArrayList<>(selected.get(0).path);
                int from = maxPoints > 0 && path.size() > maxPoints ? path.size() - maxPoints : 0;
                for (int index = from; index < path.size(); index++) {
                    MovePoint source = path.get(index);
                    MovePointDto point = new MovePointDto();
                    point.t = source.t;
                    point.dim = source.dim;
                    point.x = source.x;
                    point.y = source.y;
                    point.z = source.z;
                    dto.points.add(point);
                }
            }
            return dto;
        }
    }

    public void flush() {
        synchronized (lock) {
            save();
        }
    }

    private void load() {
        if (!Files.isRegularFile(path)) {
            return;
        }
        try (Reader reader = Files.newBufferedReader(path, StandardCharsets.UTF_8)) {
            MovementFile file = GSON.fromJson(reader, MovementFile.class);
            if (file != null && file.players != null) {
                players.clear();
                players.putAll(file.players);
                for (PlayerActivity activity : players.values()) {
                    activity.lastAccountedMonotonic = 0;
                    if (activity.path == null) {
                        activity.path = new ArrayDeque<>();
                    }
                    if (activity.heat == null) {
                        activity.heat = new LinkedHashMap<>();
                    }
                }
            }
        } catch (Exception exception) {
            LuStatsMod.LOGGER.warn("Failed to load Lu-Stats movement data at {}.", path, exception);
        }
    }

    private void save() {
        try {
            Files.createDirectories(path.getParent());
            MovementFile file = new MovementFile();
            file.players = new LinkedHashMap<>(players);
            try (Writer writer = Files.newBufferedWriter(path, StandardCharsets.UTF_8)) {
                GSON.toJson(file, writer);
            }
        } catch (IOException exception) {
            LuStatsMod.LOGGER.warn("Failed to save Lu-Stats movement data at {}.", path, exception);
        }
    }

    // ---- persistent model ----

    static final class PlayerActivity {
        String name;
        long totalActiveMillis;
        long totalAfkMillis;
        long lastSeen;
        String dimension;
        int x;
        int y;
        int z;
        int distanceSamples;
        Deque<MovePoint> path = new ArrayDeque<>();
        Map<String, Integer> heat = new LinkedHashMap<>();

        // transient runtime state (recomputed each session)
        transient boolean afk;
        transient long idleMillis;
        transient long lastAccountedMonotonic;
        transient long lastSampleWall;
    }

    static final class MovePoint {
        long t;
        String dim;
        int x;
        int y;
        int z;
    }

    private static final class MovementFile {
        public Map<String, PlayerActivity> players = new LinkedHashMap<>();
    }

    // ---- DTOs for the web API ----

    public static final class PlayerActivityDto {
        public String id;
        public String name;
        public boolean online;
        public boolean afk;
        public long idleSeconds;
        public long totalActiveSeconds;
        public long totalAfkSeconds;
        public String dimension;
        public int x;
        public int y;
        public int z;
        public long lastSeen;
        public int pathPoints;
        public int heatBuckets;
    }

    public static final class MovementDto {
        public String playerId;
        public int bucketSize;
        public List<MovePointDto> points = new ArrayList<>();
        public List<HeatBucketDto> heat = new ArrayList<>();
    }

    public static final class MovePointDto {
        public long t;
        public String dim;
        public int x;
        public int y;
        public int z;
    }

    public static final class HeatBucketDto {
        public String dim;
        public int x;
        public int z;
        public int count;
    }
}
