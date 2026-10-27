package com.lunaos.lustats.tracking;

import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import com.lunaos.lustats.LuStatsMod;
import net.fabricmc.loader.api.FabricLoader;

import java.io.IOException;
import java.io.Reader;
import java.io.Writer;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Deque;
import java.util.List;

/**
 * Thread-safe, persisted ring buffer of timeline {@link GameEvent}s. Written
 * from the server thread (death/advancement hooks) and read from web threads,
 * so every access is guarded by {@link #lock}. Persisted to
 * {@code config/lustats-events.json}.
 */
public final class EventLog {
    private static final Gson GSON = new GsonBuilder().disableHtmlEscaping().create();

    private final Object lock = new Object();
    private final Deque<GameEvent> events = new ArrayDeque<>();
    private final Path path;

    private int maxEvents;
    private long nextSeq = 1;
    private boolean dirty;

    public EventLog(final int maxEvents) {
        this.maxEvents = Math.max(10, maxEvents);
        this.path = FabricLoader.getInstance().getConfigDir().resolve("lustats-events.json");
        load();
    }

    public void setMaxEvents(final int maxEvents) {
        synchronized (lock) {
            this.maxEvents = Math.max(10, maxEvents);
            trim();
        }
    }

    /** Assigns the next seq/timestamp, appends and marks dirty. */
    public void add(final GameEvent event) {
        synchronized (lock) {
            event.seq = nextSeq++;
            if (event.time == 0) {
                event.time = System.currentTimeMillis();
            }
            if (event.timestamp == null) {
                event.timestamp = java.time.Instant.ofEpochMilli(event.time).toString();
            }
            events.addLast(event);
            trim();
            dirty = true;
        }
    }

    /** All events with {@code seq > after}, oldest first, capped to {@code limit}. */
    public List<GameEvent> since(final long after, final int limit) {
        synchronized (lock) {
            List<GameEvent> out = new ArrayList<>();
            for (GameEvent event : events) {
                if (event.seq > after) {
                    out.add(event);
                }
            }
            if (limit > 0 && out.size() > limit) {
                return new ArrayList<>(out.subList(out.size() - limit, out.size()));
            }
            return out;
        }
    }

    /** The most recent {@code limit} events, newest first. */
    public List<GameEvent> recent(final int limit) {
        synchronized (lock) {
            List<GameEvent> out = new ArrayList<>(events);
            java.util.Collections.reverse(out);
            if (limit > 0 && out.size() > limit) {
                return new ArrayList<>(out.subList(0, limit));
            }
            return out;
        }
    }

    public long latestSeq() {
        synchronized (lock) {
            return nextSeq - 1;
        }
    }

    public int size() {
        synchronized (lock) {
            return events.size();
        }
    }

    private void trim() {
        while (events.size() > maxEvents) {
            events.removeFirst();
        }
    }

    public void flush() {
        synchronized (lock) {
            if (dirty) {
                save();
            }
        }
    }

    private void load() {
        if (!Files.isRegularFile(path)) {
            return;
        }
        try (Reader reader = Files.newBufferedReader(path, StandardCharsets.UTF_8)) {
            EventFile file = GSON.fromJson(reader, EventFile.class);
            if (file != null && file.events != null) {
                events.clear();
                events.addAll(file.events);
                trim();
                long max = 0;
                for (GameEvent event : events) {
                    max = Math.max(max, event.seq);
                }
                nextSeq = max + 1;
            }
        } catch (Exception exception) {
            LuStatsMod.LOGGER.warn("Failed to load Lu-Stats events at {}.", path, exception);
        }
    }

    private void save() {
        try {
            Files.createDirectories(path.getParent());
            EventFile file = new EventFile();
            file.events = new ArrayList<>(events);
            try (Writer writer = Files.newBufferedWriter(path, StandardCharsets.UTF_8)) {
                GSON.toJson(file, writer);
            }
            dirty = false;
        } catch (IOException exception) {
            LuStatsMod.LOGGER.warn("Failed to save Lu-Stats events at {}.", path, exception);
        }
    }

    private static final class EventFile {
        public List<GameEvent> events = new ArrayList<>();
    }
}
