package com.lunaos.lustats.adv;

import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import com.lunaos.lustats.LuStatsMod;
import net.minecraft.advancements.AdvancementHolder;
import net.minecraft.advancements.AdvancementProgress;
import net.minecraft.advancements.CriterionProgress;
import net.minecraft.resources.Identifier;
import net.minecraft.server.MinecraftServer;
import net.minecraft.server.PlayerAdvancements;
import net.minecraft.server.ServerAdvancementManager;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.level.storage.LevelResource;

import java.io.Reader;
import java.nio.charset.StandardCharsets;
import java.nio.file.DirectoryStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/** Computes per-player advancement progress from live players and world save files. */
public final class ProgressReader {
    private static final DateTimeFormatter TS = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss Z", Locale.ROOT);

    public static final class Prog {
        public boolean done;
        public List<Integer> groups = new ArrayList<>();
        public long at;
    }

    public static final class PlayerProgress {
        public String uuid;
        public String name;
        public boolean online;
        public long lastSeen;
        public int done;
        public int xp;
        public long lastUnlock;
        public Map<String, Integer> byTab = new LinkedHashMap<>();
        public Map<String, Prog> progress = new LinkedHashMap<>();
        public Map<String, Long> stats = new LinkedHashMap<>();
    }

    private ProgressReader() {
    }

    public static PlayerProgress online(final MinecraftServer server, final AdvIndex index, final ServerPlayer player) {
        PlayerProgress out = new PlayerProgress();
        out.uuid = player.getGameProfile().id().toString();
        out.name = player.getGameProfile().name();
        out.online = true;
        out.lastSeen = System.currentTimeMillis();

        PlayerAdvancements advancements = player.getAdvancements();
        ServerAdvancementManager manager = server.getAdvancements();
        for (AdvIndex.Entry entry : index.entries().values()) {
            AdvancementHolder holder;
            try {
                holder = manager.get(Identifier.parse(entry.id()));
            } catch (Exception exception) {
                continue;
            }
            if (holder == null) {
                continue;
            }
            AdvancementProgress progress = advancements.getOrStartProgress(holder);
            boolean done = progress.isDone();
            if (!done && !progress.hasProgress()) {
                continue;
            }

            Prog prog = new Prog();
            prog.done = done;
            long at = 0;
            for (int i = 0; i < entry.criteriaGroups().size(); i++) {
                boolean groupDone = false;
                for (String criterion : entry.criteriaGroups().get(i)) {
                    CriterionProgress cp = progress.getCriterion(criterion);
                    if (cp != null && cp.isDone()) {
                        groupDone = true;
                        Instant obtained = cp.getObtained();
                        if (obtained != null) {
                            at = Math.max(at, obtained.toEpochMilli());
                        }
                    }
                }
                if (groupDone) {
                    prog.groups.add(i);
                }
            }
            prog.at = at;
            out.progress.put(entry.id(), prog);
            accumulate(out, index, entry, done, at);
        }
        out.xp = out.done;
        return out;
    }

    public static PlayerProgress offline(final AdvIndex index, final String uuid, final String name, final Path file) {
        PlayerProgress out = new PlayerProgress();
        out.uuid = uuid;
        out.name = name != null ? name : uuid;
        out.online = false;
        try {
            out.lastSeen = Files.getLastModifiedTime(file).toMillis();
        } catch (Exception ignored) {
            out.lastSeen = 0;
        }

        Map<String, OfflineAdv> raw = parseOffline(file);
        Map<String, AdvIndex.Entry> entries = index.entries();
        for (Map.Entry<String, OfflineAdv> rawEntry : raw.entrySet()) {
            AdvIndex.Entry entry = entries.get(rawEntry.getKey());
            if (entry == null) {
                continue;
            }
            OfflineAdv data = rawEntry.getValue();
            Prog prog = new Prog();
            prog.done = data.done;
            long at = 0;
            for (int i = 0; i < entry.criteriaGroups().size(); i++) {
                boolean groupDone = false;
                for (String criterion : entry.criteriaGroups().get(i)) {
                    Long obtained = data.criteria.get(criterion);
                    if (obtained != null) {
                        groupDone = true;
                        at = Math.max(at, obtained);
                    }
                }
                if (groupDone) {
                    prog.groups.add(i);
                }
            }
            prog.at = at;
            out.progress.put(entry.id(), prog);
            accumulate(out, index, entry, data.done, at);
        }
        out.xp = out.done;
        return out;
    }

    private static void accumulate(final PlayerProgress out, final AdvIndex index, final AdvIndex.Entry entry,
                                   final boolean done, final long at) {
        if (done && entry.counted()) {
            out.done++;
            out.byTab.merge(entry.tab(), 1, Integer::sum);
            if (at > out.lastUnlock) {
                out.lastUnlock = at;
            }
        }
    }

    private record OfflineAdv(boolean done, Map<String, Long> criteria) {
    }

    private static Map<String, OfflineAdv> parseOffline(final Path file) {
        Map<String, OfflineAdv> out = new LinkedHashMap<>();
        try (Reader reader = Files.newBufferedReader(file, StandardCharsets.UTF_8)) {
            JsonElement root = JsonParser.parseReader(reader);
            if (!root.isJsonObject()) {
                return out;
            }
            for (Map.Entry<String, JsonElement> entry : root.getAsJsonObject().entrySet()) {
                if (entry.getKey().equals("DataVersion") || !entry.getValue().isJsonObject()) {
                    continue;
                }
                JsonObject adv = entry.getValue().getAsJsonObject();
                boolean done = adv.has("done") && adv.get("done").getAsBoolean();
                Map<String, Long> criteria = new LinkedHashMap<>();
                if (adv.has("criteria") && adv.get("criteria").isJsonObject()) {
                    for (Map.Entry<String, JsonElement> criterion : adv.getAsJsonObject("criteria").entrySet()) {
                        criteria.put(criterion.getKey(), parseTimestamp(criterion.getValue()));
                    }
                }
                out.put(entry.getKey(), new OfflineAdv(done, criteria));
            }
        } catch (Exception exception) {
            LuStatsMod.LOGGER.warn("Failed to read offline advancements file {}.", file, exception);
        }
        return out;
    }

    private static long parseTimestamp(final JsonElement element) {
        try {
            String value = element.getAsString();
            return OffsetDateTime.parse(value, TS).toInstant().toEpochMilli();
        } catch (Exception exception) {
            return 0;
        }
    }

    /** Lists offline player advancement files (uuid -> file), excluding the given online uuids. */
    public static Map<String, Path> offlineFiles(final MinecraftServer server, final Set<String> onlineUuids) {
        Map<String, Path> out = new LinkedHashMap<>();
        Path dir = server.getWorldPath(LevelResource.PLAYER_ADVANCEMENTS_DIR);
        if (!Files.isDirectory(dir)) {
            return out;
        }
        try (DirectoryStream<Path> stream = Files.newDirectoryStream(dir, "*.json")) {
            for (Path file : stream) {
                String fileName = file.getFileName().toString();
                String id = fileName.substring(0, fileName.length() - ".json".length());
                try {
                    UUID.fromString(id);
                } catch (IllegalArgumentException ignored) {
                    continue;
                }
                if (!onlineUuids.contains(id)) {
                    out.put(id, file);
                }
            }
        } catch (Exception exception) {
            LuStatsMod.LOGGER.warn("Failed to list offline advancement files in {}.", dir, exception);
        }
        return out;
    }

    public static Set<String> onlineUuids(final MinecraftServer server) {
        Set<String> out = new HashSet<>();
        for (ServerPlayer player : server.getPlayerList().getPlayers()) {
            out.add(player.getGameProfile().id().toString());
        }
        return out;
    }
}
