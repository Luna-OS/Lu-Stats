package com.lunaos.lustats.adv;

import com.google.gson.JsonElement;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Web-API DTOs. Field names and declaration order match exactly what the
 * BACAP-style frontend (store.js / pages.js / explorer.js) consumes, so the
 * frontend can be reused unchanged. Gson serializes public fields in order and
 * omits nulls by default.
 */
public final class Dtos {
    private Dtos() {
    }

    /** GET /api/info */
    public static final class Info {
        public String title;
        public String modVersion;
        public boolean bacapLoaded;
        public String docVersion;
        public String docUpdated;
        public String mcVersion;
        public int total;
        public long indexVersion;
        public boolean live;
        public boolean privateMode;
        public long started;
    }

    /** GET /api/advancements */
    public static final class Index {
        public long version;
        public boolean bacapLoaded;
        public int total;
        public JsonElement meta;
        public List<Tab> tabs = new ArrayList<>();
        public List<Adv> advancements = new ArrayList<>();
    }

    public static final class Tab {
        public String name;
        public String id;
        public String key;
        public String title;
        public String de;
        public String docTab;
        public String color;
        public String pattern;
        public String icon;
        public int count;
        public String note = "";
        public String banner = "";
        public List<String> ids = new ArrayList<>();
    }

    public static final class Adv {
        public String id;
        public String parent;
        public List<String> children = new ArrayList<>();
        public String tab;
        public String title;
        public String desc;
        public String frame;
        public String tier;
        public boolean hidden;
        public boolean counted;
        public String icon;
        public float x;
        public float y;
        public int xp;
        public List<List<String>> groups = new ArrayList<>();
        public Stat stat;
        public JsonElement doc;
    }

    public static final class Stat {
        public String key;
        public long min;
        public String unit;
    }

    /** A player summary ("head" record — not an image). */
    public static final class Head {
        public String name;
        public String uuid;
        public boolean online;
        public long lastSeen;
        public int done;
        public int xp;
        public long lastUnlock;
        public Map<String, Integer> byTab = new LinkedHashMap<>();
    }

    /** GET /api/players */
    public static final class Players {
        public long version;
        public long indexVersion;
        public int total;
        public List<Head> players = new ArrayList<>();
        public List<Recent> recent = new ArrayList<>();
    }

    public static final class Recent {
        public String player;
        public String adv;
        public long at;

        public Recent() {
        }

        public Recent(final String player, final String adv, final long at) {
            this.player = player;
            this.adv = adv;
            this.at = at;
        }
    }

    /** GET /api/player?name= */
    public static final class PlayerDetail {
        public long indexVersion;
        public int total;
        public Head player;
        public Map<String, Progress> progress = new LinkedHashMap<>();
        public Map<String, Long> stats = new LinkedHashMap<>();
    }

    /** {"d":1,"at":..} when done, else {"g":[...],"at":..}. Nulls omitted by Gson. */
    public static final class Progress {
        public Integer d;
        public List<Integer> g;
        public long at;
    }

    /** GET /api/advancement?id= */
    public static final class AdvPlayers {
        public String id;
        public long indexVersion;
        public List<AdvPlayer> players = new ArrayList<>();
    }

    public static final class AdvPlayer {
        public String name;
        public boolean online;
        public boolean done;
        public Long at;
        public int got;
        public Long stat;
    }
}
