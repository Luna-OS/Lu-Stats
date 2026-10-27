package com.lunaos.lustats.adv;

import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import com.lunaos.lustats.LuStatsMod;
import net.fabricmc.loader.api.FabricLoader;

import java.io.Reader;
import java.io.Writer;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/**
 * Per-player website preferences. The {@code hidden} flag is the player's own
 * tracking opt-out: default {@code false} (everyone is tracked and shown), and
 * a player toggles it themselves with {@code /lustats privat}. Persisted to
 * {@code config/lustats-players.json}.
 */
public final class Consent {
    private static final Gson GSON = new GsonBuilder().setPrettyPrinting().disableHtmlEscaping().create();

    public static final class Entry {
        public String name = "";
        public boolean hidden = false;
    }

    private final Object lock = new Object();
    private final Map<String, Entry> byUuid = new LinkedHashMap<>();
    private final Path path;

    public Consent() {
        this.path = FabricLoader.getInstance().getConfigDir().resolve("lustats-players.json");
        load();
    }

    public boolean isHidden(final UUID uuid) {
        synchronized (lock) {
            Entry entry = byUuid.get(uuid.toString());
            return entry != null && entry.hidden;
        }
    }

    public boolean isHidden(final String uuidString) {
        synchronized (lock) {
            Entry entry = byUuid.get(uuidString);
            return entry != null && entry.hidden;
        }
    }

    /** Toggles opt-out; returns the new hidden state. */
    public boolean toggleHidden(final UUID uuid, final String name) {
        synchronized (lock) {
            Entry entry = byUuid.computeIfAbsent(uuid.toString(), key -> new Entry());
            if (name != null && !name.isBlank()) {
                entry.name = name;
            }
            entry.hidden = !entry.hidden;
            save();
            return entry.hidden;
        }
    }

    public void setHidden(final UUID uuid, final String name, final boolean hidden) {
        synchronized (lock) {
            Entry entry = byUuid.computeIfAbsent(uuid.toString(), key -> new Entry());
            if (name != null && !name.isBlank()) {
                entry.name = name;
            }
            entry.hidden = hidden;
            save();
        }
    }

    public void rememberName(final UUID uuid, final String name) {
        if (name == null || name.isBlank()) {
            return;
        }
        synchronized (lock) {
            Entry entry = byUuid.computeIfAbsent(uuid.toString(), key -> new Entry());
            if (!name.equals(entry.name)) {
                entry.name = name;
                save();
            }
        }
    }

    public Set<String> hiddenUuids() {
        synchronized (lock) {
            Set<String> out = new HashSet<>();
            for (Map.Entry<String, Entry> entry : byUuid.entrySet()) {
                if (entry.getValue().hidden) {
                    out.add(entry.getKey());
                }
            }
            return out;
        }
    }

    private void load() {
        if (!Files.isRegularFile(path)) {
            return;
        }
        try (Reader reader = Files.newBufferedReader(path, StandardCharsets.UTF_8)) {
            File file = GSON.fromJson(reader, File.class);
            if (file != null && file.players != null) {
                byUuid.clear();
                byUuid.putAll(file.players);
            }
        } catch (Exception exception) {
            LuStatsMod.LOGGER.warn("Failed to load Lu-Stats player prefs at {}.", path, exception);
        }
    }

    private void save() {
        try {
            Files.createDirectories(path.getParent());
            File file = new File();
            file.players = new LinkedHashMap<>(byUuid);
            try (Writer writer = Files.newBufferedWriter(path, StandardCharsets.UTF_8)) {
                GSON.toJson(file, writer);
            }
        } catch (Exception exception) {
            LuStatsMod.LOGGER.warn("Failed to save Lu-Stats player prefs at {}.", path, exception);
        }
    }

    private static final class File {
        public Map<String, Entry> players = new LinkedHashMap<>();
    }
}
