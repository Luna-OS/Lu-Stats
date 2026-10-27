package com.lunaos.lustats.adv;

import com.google.gson.JsonObject;
import com.lunaos.lustats.LuStatsMod;
import net.minecraft.advancements.Advancement;
import net.minecraft.advancements.AdvancementHolder;
import net.minecraft.advancements.AdvancementNode;
import net.minecraft.advancements.AdvancementTree;
import net.minecraft.advancements.DisplayInfo;
import net.minecraft.resources.Identifier;
import net.minecraft.server.MinecraftServer;
import net.minecraft.server.ServerAdvancementManager;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/**
 * Builds the advancement index for the web API from the live
 * {@link ServerAdvancementManager} (so it reflects whatever datapack is loaded,
 * including Blaze and Cave's), enriched with the {@link DocData} overlay. Also
 * keeps the per-advancement requirement groups so player progress can be
 * computed online and offline.
 */
public final class AdvIndex {
    /** Immutable per-advancement data the progress reader needs. */
    public record Entry(String id, String tab, boolean counted, List<List<String>> criteriaGroups,
                        String title, String frame) {
    }

    private static final Map<String, String> TAB_PATTERN = Map.ofEntries(
        Map.entry("mining", "stone"),
        Map.entry("building", "oak_planks"),
        Map.entry("farming", "husbandry"),
        Map.entry("animals", "husbandry"),
        Map.entry("monsters", "mossy_cobblestone"),
        Map.entry("weaponry", "smithing_table_top"),
        Map.entry("biomes", "dirt"),
        Map.entry("adventure", "adventure"),
        Map.entry("redstone", "piston_side"),
        Map.entry("enchanting", "obsidian"),
        Map.entry("statistics", "bedrock"),
        Map.entry("nether", "netherrack"),
        Map.entry("potions", "glowstone"),
        Map.entry("end", "end"),
        Map.entry("husbandry", "husbandry"),
        Map.entry("the end", "end"),
        Map.entry("nether ", "netherrack")
    );

    private Dtos.Index dto = new Dtos.Index();
    private final Map<String, Entry> byId = new HashMap<>();
    private long version;
    private int countedTotal;
    private boolean bacapLoaded;

    public synchronized void rebuild(final MinecraftServer server, final DocData doc) {
        Dtos.Index out = new Dtos.Index();
        Map<String, Entry> entries = new HashMap<>();
        boolean bacap = false;

        ServerAdvancementManager manager = server.getAdvancements();
        AdvancementTree tree = manager.tree();

        // Pass 1: every displayed advancement -> Adv DTO + Entry.
        Map<String, Dtos.Adv> advById = new LinkedHashMap<>();
        Map<String, String> rootIdByAdv = new HashMap<>();
        for (AdvancementHolder holder : manager.getAllAdvancements()) {
            Advancement advancement = holder.value();
            if (advancement.display().isEmpty()) {
                continue; // recipe / technical advancement
            }
            DisplayInfo display = advancement.display().get();
            String id = holder.id().toString();
            if (id.startsWith("blazeandcave")) {
                bacap = true;
            }

            AdvancementNode node = tree.get(holder);
            String rootId = node != null && node.root() != null ? node.root().holder().id().toString() : id;
            rootIdByAdv.put(id, rootId);

            Dtos.Adv adv = new Dtos.Adv();
            adv.id = id;
            adv.parent = advancement.parent().map(Identifier::toString).orElse(null);
            adv.tab = rootId;
            adv.title = display.title().getString();
            adv.desc = display.description().getString();
            adv.frame = display.type().getSerializedName();
            adv.hidden = display.hidden();
            adv.counted = true;
            adv.x = node != null ? node.x() : 0f;
            adv.y = node != null ? node.y() : 0f;
            try {
                adv.icon = display.icon().item().getRegisteredName();
            } catch (Exception exception) {
                adv.icon = "minecraft:stone";
            }

            List<List<String>> groups = advancement.requirements().requirements();
            List<List<String>> criteriaGroups = new ArrayList<>();
            for (List<String> group : groups) {
                List<String> copy = new ArrayList<>(group);
                criteriaGroups.add(copy);
                List<String> pair = new ArrayList<>(2);
                pair.add(label(copy));
                pair.add("Kriterium");
                adv.groups.add(pair);
            }

            // Doc overlay (title/tab match against the BACAP spreadsheet).
            String tabName = tabName(server, rootId);
            JsonObject docEntry = doc.advancement(tabName, adv.title);
            if (docEntry != null) {
                adv.doc = docEntry;
                adv.tier = str(docEntry, "tier", adv.frame);
                adv.xp = intOf(docEntry, "xp", 0);
            } else {
                adv.tier = adv.frame;
            }

            advById.put(id, adv);
            entries.put(id, new Entry(id, rootId, adv.counted, criteriaGroups, adv.title, adv.frame));
        }

        // Pass 2: children links (encounter order within tree).
        Map<String, List<String>> childrenOf = new LinkedHashMap<>();
        for (Dtos.Adv adv : advById.values()) {
            if (adv.parent != null && advById.containsKey(adv.parent)) {
                childrenOf.computeIfAbsent(adv.parent, key -> new ArrayList<>()).add(adv.id);
            }
        }
        for (Dtos.Adv adv : advById.values()) {
            List<String> kids = childrenOf.get(adv.id);
            if (kids != null) {
                adv.children = kids;
            }
        }

        // Pass 3: tabs from roots, with DFS id order.
        List<Dtos.Tab> tabs = new ArrayList<>();
        for (AdvancementNode root : tree.roots()) {
            String rootId = root.holder().id().toString();
            Dtos.Adv rootAdv = advById.get(rootId);
            if (rootAdv == null) {
                continue; // root without display
            }
            Dtos.Tab tab = new Dtos.Tab();
            tab.id = rootId;
            tab.name = rootAdv.title;
            tab.title = rootAdv.title;
            tab.de = rootAdv.title;
            tab.docTab = rootAdv.title;
            tab.key = slug(rootAdv.title.isEmpty() ? rootId : rootAdv.title);
            tab.icon = rootAdv.icon;
            tab.pattern = TAB_PATTERN.getOrDefault(rootAdv.title.toLowerCase(Locale.ROOT), "stone");
            JsonObject docTab = doc.tab(rootAdv.title);
            tab.color = docTab != null ? str(docTab, "color", "#888888") : "#888888";
            tab.note = docTab != null ? str(docTab, "note", "") : "";
            tab.banner = docTab != null ? str(docTab, "banner", "") : "";
            dfsOrder(rootId, childrenOf, tab.ids, new java.util.HashSet<>());
            tab.count = tab.ids.size();
            tabs.add(tab);
        }
        tabs.sort((a, b) -> a.name == null ? 0 : a.name.compareToIgnoreCase(b.name == null ? "" : b.name));

        int counted = 0;
        for (Dtos.Adv adv : advById.values()) {
            if (adv.counted) {
                counted++;
            }
        }

        out.tabs = tabs;
        out.advancements = new ArrayList<>(advById.values());
        out.total = counted;
        out.bacapLoaded = bacap;
        out.meta = doc.meta();
        out.version = ++version;

        this.dto = out;
        this.byId.clear();
        this.byId.putAll(entries);
        this.countedTotal = counted;
        this.bacapLoaded = bacap;
        LuStatsMod.LOGGER.info("Lu-Stats advancement index built: {} advancements, {} tabs, bacap={}.",
            advById.size(), tabs.size(), bacap);
    }

    private static void dfsOrder(final String id, final Map<String, List<String>> childrenOf,
                                 final List<String> out, final java.util.Set<String> seen) {
        if (!seen.add(id)) {
            return;
        }
        out.add(id);
        List<String> kids = childrenOf.get(id);
        if (kids != null) {
            for (String kid : kids) {
                dfsOrder(kid, childrenOf, out, seen);
            }
        }
    }

    private static String tabName(final MinecraftServer server, final String rootId) {
        try {
            AdvancementHolder holder = server.getAdvancements().get(Identifier.parse(rootId));
            if (holder != null && holder.value().display().isPresent()) {
                return holder.value().display().get().title().getString();
            }
        } catch (Exception ignored) {
            // fall through
        }
        return null;
    }

    private static String label(final List<String> group) {
        if (group.isEmpty()) {
            return "";
        }
        String first = group.get(0);
        int slash = first.lastIndexOf('/');
        String name = slash >= 0 ? first.substring(slash + 1) : first;
        return name.replace('_', ' ');
    }

    private static String slug(final String value) {
        String lower = value.toLowerCase(Locale.ROOT).replaceAll("[^a-z0-9]+", "-");
        return lower.replaceAll("(^-+|-+$)", "");
    }

    private static String str(final JsonObject object, final String key, final String fallback) {
        if (object == null || !object.has(key) || object.get(key).isJsonNull()) {
            return fallback;
        }
        try {
            return object.get(key).getAsString();
        } catch (Exception exception) {
            return fallback;
        }
    }

    private static int intOf(final JsonObject object, final String key, final int fallback) {
        if (object == null || !object.has(key) || object.get(key).isJsonNull()) {
            return fallback;
        }
        try {
            return object.get(key).getAsInt();
        } catch (Exception exception) {
            return fallback;
        }
    }

    public synchronized Dtos.Index dto() {
        return dto;
    }

    public synchronized long version() {
        return version;
    }

    public synchronized int countedTotal() {
        return countedTotal;
    }

    public synchronized boolean bacapLoaded() {
        return bacapLoaded;
    }

    public synchronized Entry entry(final String id) {
        return byId.get(id);
    }

    public synchronized Map<String, Entry> entries() {
        return new HashMap<>(byId);
    }
}
