package com.lunaos.lustats.stats;

import com.lunaos.lustats.LuStatsMod;
import com.lunaos.lustats.tracking.ActivityTracker;
import com.lunaos.lustats.tracking.GameEvent;
import net.minecraft.server.MinecraftServer;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * Builds the website's statistics payloads: the stat catalog, leaderboards per
 * stat, a player's stats, deaths, the live event feed and movement. Players
 * hidden on the website ({@link LuStatsMod#hiddenOnWeb}) are left out of every
 * payload. Player values are cached briefly. Call on the server thread.
 */
public final class StatsApi {
    /** Pseudo-stats from the activity tracker, in ticks like vanilla time stats. */
    public static final String ACTIVE_KEY = "lustats:activity|lustats:active_time";
    public static final String AFK_KEY = "lustats:activity|lustats:afk_time";
    private static final String DEATHS_KEY = "minecraft:custom|minecraft:deaths";
    private static final String KILLED_BY = "minecraft:killed_by|";
    private static final long TTL = 5000L;
    private static final int TOP = 5;
    private static final int PLAYER_DEATHS = 25;
    private static final int RECENT_DEATHS = 300;
    private static final int MAX_FEED = 500;

    private final MinecraftServer server;
    private final StatsService stats;
    private List<StatsService.PlayerValues> players = List.of();
    private Map<String, ActivityTracker.PlayerActivityDto> activity = Map.of();
    private long builtAt;

    public StatsApi(final MinecraftServer server, final StatsService stats) {
        this.server = server;
        this.stats = stats;
    }

    public void invalidate() {
        builtAt = 0;
    }

    // ---- payloads ----

    public Catalog catalog() {
        List<StatsService.PlayerValues> ps = players();
        Map<String, Row> leaders = new HashMap<>();
        for (StatsService.PlayerValues p : ps) {
            for (Map.Entry<String, Integer> entry : p.values().entrySet()) {
                Row leader = leaders.get(entry.getKey());
                if (leader == null || entry.getValue() > leader.v) {
                    Row row = new Row();
                    row.name = p.name();
                    row.online = p.online();
                    row.v = entry.getValue();
                    leaders.put(entry.getKey(), row);
                }
            }
        }
        Catalog out = new Catalog();
        out.players = ps.size();
        out.featured = featured();
        Set<String> featured = new HashSet<>(out.featured);
        List<StatInfo> infos = new ArrayList<>();
        for (StatDescriptor descriptor : stats.displayedDescriptors()) {
            if (leaders.containsKey(descriptor.key) || featured.contains(descriptor.key)) {
                infos.add(info(descriptor));
            }
        }
        if (trackingEnabled()) {
            infos.add(activityInfo(ACTIVE_KEY, "Active Time"));
            infos.add(activityInfo(AFK_KEY, "AFK Time"));
        }
        for (StatInfo info : infos) {
            Row leader = leaders.get(info.key);
            if (leader != null) {
                info.top = leader.name;
                info.topV = leader.v;
            }
        }
        out.stats = infos;
        return out;
    }

    public Overview overview() {
        List<StatsService.PlayerValues> ps = players();
        Overview out = new Overview();
        out.players = ps.size();
        for (StatsService.PlayerValues p : ps) {
            if (p.online()) {
                out.online++;
            }
        }
        for (String key : featured()) {
            Board board = board(key);
            if (board == null) {
                continue;
            }
            if (board.rows.size() > TOP) {
                board.rows = new ArrayList<>(board.rows.subList(0, TOP));
            }
            out.boards.add(board);
        }
        for (StatsService.PlayerValues p : ps) {
            ActivityTracker.PlayerActivityDto a = activity.get(p.uuid());
            if (p.online()) {
                OnlinePlayer o = new OnlinePlayer();
                o.name = p.name();
                o.afk = a != null && a.afk;
                o.idle = a != null ? a.idleSeconds : 0;
                out.onlinePlayers.add(o);
            }
        }
        return out;
    }

    /** Every player with a non-zero value for the stat, highest first; null for an unknown stat. */
    public Board board(final String key) {
        if (key == null || !known(key)) {
            return null;
        }
        Board out = new Board();
        out.key = key;
        for (StatsService.PlayerValues p : players()) {
            Integer value = p.values().get(key);
            if (value == null || value == 0) {
                continue;
            }
            Row row = new Row();
            row.name = p.name();
            row.online = p.online();
            row.v = value;
            out.rows.add(row);
            out.total += value;
        }
        out.rows.sort(Comparator.comparingLong((Row r) -> -r.v).thenComparing(r -> r.name, String.CASE_INSENSITIVE_ORDER));
        return out;
    }

    public PlayerStats player(final String name) {
        List<StatsService.PlayerValues> ps = players();
        StatsService.PlayerValues found = find(ps, name);
        if (found == null) {
            return null;
        }
        PlayerStats out = new PlayerStats();
        out.name = found.name();
        out.uuid = found.uuid();
        out.online = found.online();
        out.players = ps.size();
        out.values = new LinkedHashMap<>(found.values());
        for (Map.Entry<String, Integer> entry : found.values().entrySet()) {
            int rank = 1;
            for (StatsService.PlayerValues other : ps) {
                Integer value = other.values().get(entry.getKey());
                if (value != null && value > entry.getValue()) {
                    rank++;
                }
            }
            out.ranks.put(entry.getKey(), rank);
        }

        ActivityTracker.PlayerActivityDto a = activity.get(found.uuid());
        if (a != null) {
            Activity act = new Activity();
            act.afk = a.afk;
            act.idle = a.idleSeconds;
            act.active = a.totalActiveSeconds;
            act.afkTime = a.totalAfkSeconds;
            act.lastSeen = a.lastSeen;
            act.dim = a.dimension;
            act.x = a.x;
            act.y = a.y;
            act.z = a.z;
            out.activity = act;
        }

        Map<String, Integer> causes = new HashMap<>();
        Map<String, Killer> killers = new LinkedHashMap<>();
        Map<String, Integer> victims = new HashMap<>();
        for (GameEvent event : stats.eventLog().recent(0)) {
            if (!GameEvent.TYPE_DEATH.equals(event.type)) {
                continue;
            }
            if (found.uuid().equals(event.killerPlayerId) && !LuStatsMod.hiddenOnWeb(event.playerId)) {
                victims.merge(event.playerName, 1, Integer::sum);
            }
            if (!found.uuid().equals(event.playerId)) {
                continue;
            }
            EventDto dto = event(event);
            if (dto == null) {
                continue;
            }
            out.deathsLogged++;
            if (out.deaths.size() < PLAYER_DEATHS) {
                out.deaths.add(dto);
            }
            causes.merge(dto.cause == null ? "generic" : dto.cause, 1, Integer::sum);
            countKiller(killers, dto);
        }
        out.causes = counts(causes);
        out.killers = sortedKillers(killers);
        out.victims = counts(victims);
        return out;
    }

    /** Newest events first; {@code after} returns only events with a higher seq (for catching up). */
    public Feed feed(final long after, final int limit, final String type, final String player) {
        int max = limit <= 0 ? 100 : Math.min(limit, MAX_FEED);
        Feed out = new Feed();
        out.latest = stats.eventLog().latestSeq();
        for (GameEvent event : stats.eventLog().recent(0)) {
            if (event.seq <= after) {
                break;
            }
            if (type != null && !type.isBlank() && !type.equals(event.type)) {
                continue;
            }
            if (player != null && !player.isBlank() && !player.equalsIgnoreCase(event.playerName)) {
                continue;
            }
            EventDto dto = event(event);
            if (dto == null) {
                continue;
            }
            out.events.add(dto);
            if (out.events.size() >= max) {
                break;
            }
        }
        return out;
    }

    public Deaths deaths() {
        Deaths out = new Deaths();
        Map<String, Integer> causes = new HashMap<>();
        Map<String, Killer> killers = new LinkedHashMap<>();
        Map<String, Integer> victims = new HashMap<>();
        Map<String, Integer> pvp = new HashMap<>();
        for (GameEvent event : stats.eventLog().recent(0)) {
            if (!GameEvent.TYPE_DEATH.equals(event.type)) {
                continue;
            }
            EventDto dto = event(event);
            if (dto == null) {
                continue;
            }
            out.logged++;
            out.since = dto.at;
            if (out.recent.size() < RECENT_DEATHS) {
                out.recent.add(dto);
            }
            causes.merge(dto.cause == null ? "generic" : dto.cause, 1, Integer::sum);
            victims.merge(dto.player, 1, Integer::sum);
            countKiller(killers, dto);
            if (dto.killerPlayer != null) {
                pvp.merge(dto.killerPlayer, 1, Integer::sum);
            }
        }
        out.causes = counts(causes);
        out.killers = sortedKillers(killers);
        out.victims = counts(victims);
        out.pvp = counts(pvp);

        // Complete history from the vanilla stats (also before Lu-Stats was installed); players are under pvp.
        Map<String, Integer> mobs = new HashMap<>();
        for (StatsService.PlayerValues p : players()) {
            for (Map.Entry<String, Integer> entry : p.values().entrySet()) {
                if (entry.getKey().startsWith(KILLED_BY) && !entry.getKey().equals(KILLED_BY + "minecraft:player")) {
                    mobs.merge(entry.getKey().substring(KILLED_BY.length()), entry.getValue(), Integer::sum);
                }
            }
        }
        out.mobs = counts(mobs);
        Board board = board(DEATHS_KEY);
        if (board != null) {
            out.total = board.total;
            out.perPlayer = board.rows;
        }
        return out;
    }

    /** Merged heatmap of all visible players, or one player's heatmap and path; null if unknown. */
    public ActivityTracker.MovementDto movement(final String name) {
        List<StatsService.PlayerValues> ps = players();
        if (name == null || name.isBlank()) {
            List<String> ids = new ArrayList<>();
            for (StatsService.PlayerValues p : ps) {
                ids.add(p.uuid());
            }
            return stats.activityTracker().movementOf(ids, 0);
        }
        StatsService.PlayerValues found = find(ps, name);
        if (found == null) {
            return null;
        }
        ActivityTracker.MovementDto dto = stats.activityTracker().movementOf(List.of(found.uuid()), 0);
        dto.playerId = found.uuid();
        return dto;
    }

    /** Web view of a timeline event, or null when its player is hidden on the website. */
    public static EventDto event(final GameEvent event) {
        if (event == null || LuStatsMod.hiddenOnWeb(event.playerId)) {
            return null;
        }
        EventDto dto = new EventDto();
        dto.seq = event.seq;
        dto.type = event.type;
        dto.at = event.time;
        dto.player = event.playerName;
        dto.dim = event.dimension;
        dto.x = event.x;
        dto.y = event.y;
        dto.z = event.z;
        if (GameEvent.TYPE_DEATH.equals(event.type)) {
            dto.cause = event.cause;
            dto.message = event.message;
            dto.killerType = event.killerType;
            dto.killer = event.killerName;
            if (event.killerPlayerId != null) {
                if (LuStatsMod.hiddenOnWeb(event.killerPlayerId)) {
                    // The vanilla message names the killer, so it goes too.
                    dto.killer = null;
                    dto.message = null;
                } else {
                    dto.killerPlayer = event.killerName;
                }
            }
        } else {
            dto.adv = event.advancementId;
            dto.title = event.advancementTitle;
            dto.kind = event.advancementKind;
        }
        return dto;
    }

    // ---- helpers ----

    private List<StatsService.PlayerValues> players() {
        long now = System.currentTimeMillis();
        if (now - builtAt < TTL) {
            return players;
        }
        Map<String, ActivityTracker.PlayerActivityDto> byId = new HashMap<>();
        if (trackingEnabled()) {
            for (ActivityTracker.PlayerActivityDto dto : stats.activityTracker().snapshot(server)) {
                byId.put(dto.id, dto);
            }
        }
        List<StatsService.PlayerValues> out = new ArrayList<>();
        for (StatsService.PlayerValues p : stats.playerValues()) {
            if (LuStatsMod.hiddenOnWeb(p.uuid())) {
                continue;
            }
            ActivityTracker.PlayerActivityDto a = byId.get(p.uuid());
            if (a == null) {
                out.add(p);
                continue;
            }
            Map<String, Integer> values = new HashMap<>(p.values());
            putTicks(values, ACTIVE_KEY, a.totalActiveSeconds);
            putTicks(values, AFK_KEY, a.totalAfkSeconds);
            out.add(new StatsService.PlayerValues(p.uuid(), p.name(), p.online(), values));
        }
        players = out;
        activity = byId;
        builtAt = now;
        return out;
    }

    private static void putTicks(final Map<String, Integer> values, final String key, final long seconds) {
        if (seconds > 0) {
            values.put(key, (int) Math.min(Integer.MAX_VALUE, seconds * 20L));
        }
    }

    private static StatsService.PlayerValues find(final List<StatsService.PlayerValues> ps, final String name) {
        if (name == null) {
            return null;
        }
        for (StatsService.PlayerValues p : ps) {
            if (name.equalsIgnoreCase(p.name())) {
                return p;
            }
        }
        return null;
    }

    private List<String> featured() {
        Set<String> out = new LinkedHashSet<>(stats.featuredKeys());
        if (trackingEnabled()) {
            out.add(ACTIVE_KEY);
        }
        return new ArrayList<>(out);
    }

    private boolean known(final String key) {
        if (key.equals(ACTIVE_KEY) || key.equals(AFK_KEY)) {
            return trackingEnabled();
        }
        for (StatDescriptor descriptor : stats.displayedDescriptors()) {
            if (descriptor.key.equals(key)) {
                return true;
            }
        }
        return false;
    }

    private static boolean trackingEnabled() {
        return LuStatsMod.config().tracking.enabled;
    }

    private static StatInfo info(final StatDescriptor descriptor) {
        StatInfo info = new StatInfo();
        info.key = descriptor.key;
        info.type = descriptor.typeId;
        info.value = descriptor.valueId;
        info.cat = descriptor.category;
        info.name = descriptor.name;
        info.unit = descriptor.unit;
        return info;
    }

    private static StatInfo activityInfo(final String key, final String name) {
        StatInfo info = new StatInfo();
        info.key = key;
        info.type = "lustats:activity";
        info.value = key.substring(key.indexOf('|') + 1);
        info.cat = "Activity";
        info.name = name;
        info.unit = "time";
        return info;
    }

    private static void countKiller(final Map<String, Killer> killers, final EventDto dto) {
        String key;
        if (dto.killerPlayer != null) {
            key = "player:" + dto.killerPlayer;
        } else if (dto.killerType != null) {
            key = dto.killerType;
        } else {
            return;
        }
        Killer killer = killers.computeIfAbsent(key, k -> new Killer());
        killer.type = dto.killerType;
        killer.name = dto.killer;
        killer.player = dto.killerPlayer != null;
        killer.n++;
    }

    private static List<Killer> sortedKillers(final Map<String, Killer> killers) {
        List<Killer> out = new ArrayList<>(killers.values());
        out.sort(Comparator.comparingInt((Killer k) -> -k.n));
        return out;
    }

    private static List<Count> counts(final Map<String, Integer> map) {
        List<Count> out = new ArrayList<>();
        for (Map.Entry<String, Integer> entry : map.entrySet()) {
            Count count = new Count();
            count.id = entry.getKey();
            count.n = entry.getValue();
            out.add(count);
        }
        out.sort(Comparator.comparingInt((Count c) -> -c.n).thenComparing(c -> c.id));
        return out;
    }

    // ---- DTOs (Gson: public fields, nulls omitted) ----

    /** GET /api/stats/catalog: stats that at least one visible player has, plus the featured ones. */
    public static final class Catalog {
        public int players;
        public List<String> featured = new ArrayList<>();
        public List<StatInfo> stats = new ArrayList<>();
    }

    public static final class StatInfo {
        public String key;
        public String type;
        public String value;
        public String cat;
        public String name;
        public String unit;
        /** Leading player and their value, absent when nobody has the stat yet. */
        public String top;
        public Long topV;
    }

    /** GET /api/stats/overview */
    public static final class Overview {
        public int players;
        public int online;
        public List<Board> boards = new ArrayList<>();
        public List<OnlinePlayer> onlinePlayers = new ArrayList<>();
    }

    public static final class OnlinePlayer {
        public String name;
        public boolean afk;
        public long idle;
    }

    /** GET /api/stats/top?key= */
    public static final class Board {
        public String key;
        public long total;
        public List<Row> rows = new ArrayList<>();
    }

    public static final class Row {
        public String name;
        public boolean online;
        public long v;
    }

    /** GET /api/stats/player?name= */
    public static final class PlayerStats {
        public String name;
        public String uuid;
        public boolean online;
        public int players;
        public Map<String, Integer> values = new LinkedHashMap<>();
        public Map<String, Integer> ranks = new LinkedHashMap<>();
        public Activity activity;
        public int deathsLogged;
        public List<EventDto> deaths = new ArrayList<>();
        public List<Count> causes = new ArrayList<>();
        public List<Killer> killers = new ArrayList<>();
        public List<Count> victims = new ArrayList<>();
    }

    public static final class Activity {
        public boolean afk;
        public long idle;
        public long active;
        public long afkTime;
        public long lastSeen;
        public String dim;
        public int x;
        public int y;
        public int z;
    }

    /** GET /api/feed */
    public static final class Feed {
        public long latest;
        public List<EventDto> events = new ArrayList<>();
    }

    /** One death or advancement on the live feed (also pushed as SSE "feed"). */
    public static final class EventDto {
        public long seq;
        public String type;
        public long at;
        public String player;
        public String dim;
        public int x;
        public int y;
        public int z;
        public String cause;
        public String message;
        public String killerType;
        public String killer;
        public String killerPlayer;
        public String adv;
        public String title;
        public String kind;
    }

    /** GET /api/deaths */
    public static final class Deaths {
        public long total;
        public int logged;
        public long since;
        public List<Count> causes = new ArrayList<>();
        public List<Killer> killers = new ArrayList<>();
        public List<Count> victims = new ArrayList<>();
        public List<Count> pvp = new ArrayList<>();
        public List<Count> mobs = new ArrayList<>();
        public List<Row> perPlayer = new ArrayList<>();
        public List<EventDto> recent = new ArrayList<>();
    }

    public static final class Count {
        public String id;
        public int n;
    }

    public static final class Killer {
        public String type;
        public String name;
        public boolean player;
        public int n;
    }
}
