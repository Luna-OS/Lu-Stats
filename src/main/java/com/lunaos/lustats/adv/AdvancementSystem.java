package com.lunaos.lustats.adv;

import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import com.lunaos.lustats.LuStatsMod;
import net.minecraft.advancements.AdvancementHolder;
import net.minecraft.server.MinecraftServer;
import net.minecraft.server.level.ServerPlayer;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * Ties the advancement index, per-player progress, consent, player heads and the
 * SSE hub together and produces the web-API DTOs. Player data is cached briefly
 * and recomputed on demand; live events invalidate the cache and push toasts.
 */
public final class AdvancementSystem {
    private static final Gson GSON = new GsonBuilder().disableHtmlEscaping().create();
    private static final long PLAYERS_TTL = 5000L;
    private static final int MAX_OFFLINE = 500;
    private static final int RECENT_MAX = 60;

    private final MinecraftServer server;
    private final String modVersion;
    private final DocData doc = new DocData();
    private final AdvIndex index = new AdvIndex();
    private final Consent consent;
    private final HeadService heads = new HeadService();
    private final SseHub sse;
    private final boolean live;

    private volatile List<ProgressReader.PlayerProgress> snapshot = new ArrayList<>();
    private volatile List<Dtos.Recent> recent = new ArrayList<>();
    private volatile long builtAt;
    private long started;

    public AdvancementSystem(final MinecraftServer server, final String modVersion,
                             final Consent consent, final int maxLivePerIp, final boolean live) {
        this.server = server;
        this.modVersion = modVersion;
        this.consent = consent;
        this.sse = new SseHub(maxLivePerIp);
        this.live = live;
    }

    public void start() {
        doc.load();
        index.rebuild(server, doc);
        started = System.currentTimeMillis();
        invalidate();
    }

    public void stop() {
        sse.stop();
    }

    public SseHub sse() {
        return sse;
    }

    public boolean live() {
        return live;
    }

    public Consent consent() {
        return consent;
    }

    // ---- API payloads ----

    public Dtos.Info info() {
        Dtos.Info info = new Dtos.Info();
        info.title = LuStatsMod.config().web.siteTitle;
        info.modVersion = modVersion;
        info.bacapLoaded = index.bacapLoaded();
        info.docVersion = doc.metaString("version");
        info.docUpdated = doc.metaString("updated");
        info.mcVersion = server.getServerVersion();
        info.total = index.countedTotal();
        info.indexVersion = index.version();
        info.live = live;
        info.privateMode = LuStatsMod.config().web.allowPrivate;
        info.started = started;
        return info;
    }

    public Dtos.Index index() {
        return index.dto();
    }

    public Dtos.Players players() {
        buildPlayers();
        Dtos.Players out = new Dtos.Players();
        out.version = index.version();
        out.indexVersion = index.version();
        out.total = index.countedTotal();
        for (ProgressReader.PlayerProgress p : snapshot) {
            out.players.add(head(p));
        }
        out.recent = new ArrayList<>(recent);
        return out;
    }

    public Dtos.PlayerDetail player(final String name) {
        buildPlayers();
        ProgressReader.PlayerProgress found = null;
        for (ProgressReader.PlayerProgress p : snapshot) {
            if (p.name != null && p.name.equalsIgnoreCase(name)) {
                found = p;
                break;
            }
        }
        if (found == null) {
            return null;
        }
        Dtos.PlayerDetail out = new Dtos.PlayerDetail();
        out.indexVersion = index.version();
        out.total = index.countedTotal();
        out.player = head(found);
        for (Map.Entry<String, ProgressReader.Prog> entry : found.progress.entrySet()) {
            ProgressReader.Prog prog = entry.getValue();
            Dtos.Progress dto = new Dtos.Progress();
            if (prog.done) {
                dto.d = 1;
            } else {
                dto.g = prog.groups;
            }
            dto.at = prog.at;
            out.progress.put(entry.getKey(), dto);
        }
        out.stats = found.stats;
        return out;
    }

    public Dtos.AdvPlayers advancement(final String id) {
        if (index.entry(id) == null) {
            return null;
        }
        buildPlayers();
        Dtos.AdvPlayers out = new Dtos.AdvPlayers();
        out.id = id;
        out.indexVersion = index.version();
        for (ProgressReader.PlayerProgress p : snapshot) {
            ProgressReader.Prog prog = p.progress.get(id);
            if (prog == null) {
                continue;
            }
            Dtos.AdvPlayer ap = new Dtos.AdvPlayer();
            ap.name = p.name;
            ap.online = p.online;
            ap.done = prog.done;
            ap.at = prog.done ? prog.at : null;
            ap.got = prog.groups.size();
            ap.stat = null;
            out.players.add(ap);
        }
        return out;
    }

    public byte[] head(final String name) {
        return heads.head(server, name);
    }

    private Dtos.Head head(final ProgressReader.PlayerProgress p) {
        Dtos.Head h = new Dtos.Head();
        h.name = p.name;
        h.uuid = p.uuid;
        h.online = p.online;
        h.lastSeen = p.lastSeen;
        h.done = p.done;
        h.xp = p.xp;
        h.lastUnlock = p.lastUnlock;
        h.byTab = p.byTab;
        return h;
    }

    // ---- player snapshot + recent feed ----

    private synchronized void buildPlayers() {
        long now = System.currentTimeMillis();
        if (now - builtAt < PLAYERS_TTL && !snapshot.isEmpty()) {
            return;
        }
        List<ProgressReader.PlayerProgress> list = new ArrayList<>();
        Set<String> online = ProgressReader.onlineUuids(server);
        for (ServerPlayer player : server.getPlayerList().getPlayers()) {
            String uuid = player.getGameProfile().id().toString();
            consent.rememberName(player.getGameProfile().id(), player.getGameProfile().name());
            if (consent.isHidden(uuid)) {
                continue;
            }
            list.add(ProgressReader.online(server, index, player));
        }
        Map<String, java.nio.file.Path> offline = ProgressReader.offlineFiles(server, online);
        int count = 0;
        Map<String, String> knownNames = knownNames();
        for (Map.Entry<String, java.nio.file.Path> entry : offline.entrySet()) {
            if (count >= MAX_OFFLINE) {
                LuStatsMod.LOGGER.warn("Lu-Stats: capped offline player scan at {} (more exist).", MAX_OFFLINE);
                break;
            }
            if (consent.isHidden(entry.getKey())) {
                continue;
            }
            String name = knownNames.getOrDefault(entry.getKey(), entry.getKey());
            list.add(ProgressReader.offline(index, entry.getKey(), name, entry.getValue()));
            count++;
        }
        list.sort(Comparator.comparingInt((ProgressReader.PlayerProgress p) -> -p.done)
            .thenComparing(p -> p.name == null ? "" : p.name, String.CASE_INSENSITIVE_ORDER));

        List<Dtos.Recent> recentList = new ArrayList<>();
        for (ProgressReader.PlayerProgress p : list) {
            for (Map.Entry<String, ProgressReader.Prog> e : p.progress.entrySet()) {
                if (e.getValue().done && e.getValue().at > 0) {
                    recentList.add(new Dtos.Recent(p.name, e.getKey(), e.getValue().at));
                }
            }
        }
        recentList.sort(Comparator.comparingLong((Dtos.Recent r) -> -r.at));
        if (recentList.size() > RECENT_MAX) {
            recentList = new ArrayList<>(recentList.subList(0, RECENT_MAX));
        }

        this.snapshot = list;
        this.recent = recentList;
        this.builtAt = now;
    }

    private Map<String, String> knownNames() {
        try {
            if (LuStatsMod.statsService() != null) {
                return LuStatsMod.statsService().names().knownNames();
            }
        } catch (Exception ignored) {
            // fall through
        }
        return Map.of();
    }

    public void invalidate() {
        builtAt = 0;
    }

    // ---- live events ----

    public void onAdvancement(final ServerPlayer player, final AdvancementHolder holder) {
        if (player == null || holder == null) {
            return;
        }
        String id = holder.id().toString();
        AdvIndex.Entry entry = index.entry(id);
        if (entry == null) {
            return;
        }
        if (consent.isHidden(player.getGameProfile().id())) {
            invalidate();
            return;
        }
        invalidate();
        if (!live) {
            return;
        }
        boolean done;
        try {
            done = player.getAdvancements().getOrStartProgress(holder).isDone();
        } catch (Exception exception) {
            done = false;
        }
        if (done) {
            String data = "{\"kind\":\"done\",\"player\":" + GSON.toJson(player.getGameProfile().name())
                + ",\"adv\":" + GSON.toJson(id)
                + ",\"title\":" + GSON.toJson(entry.title())
                + ",\"frame\":" + GSON.toJson(entry.frame()) + "}";
            sse.broadcast("progress", data);
        } else {
            sse.broadcast("players", "{}");
        }
    }

    public void onJoin(final ServerPlayer player) {
        consent.rememberName(player.getGameProfile().id(), player.getGameProfile().name());
        invalidate();
        if (live && !consent.isHidden(player.getGameProfile().id())) {
            sse.broadcast("player", "{\"player\":" + GSON.toJson(player.getGameProfile().name()) + ",\"online\":true}");
        }
    }

    public void onLeave(final ServerPlayer player) {
        invalidate();
        if (live && !consent.isHidden(player.getGameProfile().id())) {
            sse.broadcast("player", "{\"player\":" + GSON.toJson(player.getGameProfile().name()) + ",\"online\":false}");
        }
    }

    public void reloadIndex() {
        doc.load();
        index.rebuild(server, doc);
        invalidate();
        if (live) {
            sse.broadcast("index", "{\"version\":" + index.version() + "}");
        }
    }
}
