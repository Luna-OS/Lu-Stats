package com.lunaos.lustats.adv;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import com.lunaos.lustats.LuStatsMod;
import net.fabricmc.loader.api.FabricLoader;

import java.io.InputStream;
import java.io.Reader;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.HashMap;
import java.util.Locale;
import java.util.Map;

/**
 * The BlazeandCave's Advancements Pack documentation overlay. Loaded from an
 * optional {@code config/lustats/bacap-data.json} override, else the bundled
 * {@code /lustats/bacap-data.json} resource. Provides the {@code meta} block,
 * per-tab colours and the per-advancement doc entries, matched to live
 * advancements by title (and tab + title).
 */
public final class DocData {
    private JsonObject meta = new JsonObject();
    private final Map<String, JsonObject> tabByName = new HashMap<>();
    private final Map<String, JsonObject> advByTitle = new HashMap<>();
    private final Map<String, JsonObject> advByTabTitle = new HashMap<>();
    private boolean loaded;

    public void load() {
        meta = new JsonObject();
        tabByName.clear();
        advByTitle.clear();
        advByTabTitle.clear();
        loaded = false;

        JsonObject root = readOverride();
        if (root == null) {
            root = readBundled();
        }
        if (root == null) {
            return;
        }
        try {
            if (root.has("meta") && root.get("meta").isJsonObject()) {
                meta = root.getAsJsonObject("meta");
            }
            if (root.has("tabs") && root.get("tabs").isJsonArray()) {
                for (JsonElement element : root.getAsJsonArray("tabs")) {
                    if (!element.isJsonObject()) {
                        continue;
                    }
                    JsonObject tab = element.getAsJsonObject();
                    String name = string(tab, "name");
                    if (name != null) {
                        tabByName.put(norm(name), tab);
                    }
                }
            }
            if (root.has("advancements") && root.get("advancements").isJsonArray()) {
                JsonArray advancements = root.getAsJsonArray("advancements");
                for (JsonElement element : advancements) {
                    if (!element.isJsonObject()) {
                        continue;
                    }
                    JsonObject adv = element.getAsJsonObject();
                    String name = string(adv, "name");
                    String tab = string(adv, "tab");
                    if (name == null) {
                        continue;
                    }
                    advByTitle.putIfAbsent(norm(name), adv);
                    if (tab != null) {
                        advByTabTitle.put(norm(tab) + "\u0001" + norm(name), adv);
                    }
                }
            }
            loaded = true;
            LuStatsMod.LOGGER.info("Lu-Stats loaded advancement docs: {} tabs, {} entries.", tabByName.size(), advByTitle.size());
        } catch (Exception exception) {
            LuStatsMod.LOGGER.warn("Failed to parse Lu-Stats advancement docs.", exception);
        }
    }

    public boolean loaded() {
        return loaded;
    }

    public JsonObject meta() {
        return meta;
    }

    public String metaString(final String key) {
        return string(meta, key);
    }

    public JsonObject tab(final String name) {
        return name == null ? null : tabByName.get(norm(name));
    }

    /** Doc entry for a live advancement, matched by tab + title, then title alone. */
    public JsonObject advancement(final String tab, final String title) {
        if (title == null) {
            return null;
        }
        if (tab != null) {
            JsonObject byTab = advByTabTitle.get(norm(tab) + "\u0001" + norm(title));
            if (byTab != null) {
                return byTab;
            }
        }
        return advByTitle.get(norm(title));
    }

    private JsonObject readOverride() {
        try {
            Path path = FabricLoader.getInstance().getConfigDir().resolve("lustats").resolve("bacap-data.json");
            if (!Files.isRegularFile(path)) {
                return null;
            }
            try (Reader reader = Files.newBufferedReader(path, StandardCharsets.UTF_8)) {
                JsonElement parsed = JsonParser.parseReader(reader);
                return parsed.isJsonObject() ? parsed.getAsJsonObject() : null;
            }
        } catch (Exception exception) {
            LuStatsMod.LOGGER.warn("Failed to read advancement doc override.", exception);
            return null;
        }
    }

    private JsonObject readBundled() {
        try (InputStream stream = DocData.class.getResourceAsStream("/lustats/bacap-data.json")) {
            if (stream == null) {
                return null;
            }
            String text = new String(stream.readAllBytes(), StandardCharsets.UTF_8);
            JsonElement parsed = JsonParser.parseString(text);
            return parsed.isJsonObject() ? parsed.getAsJsonObject() : null;
        } catch (Exception exception) {
            LuStatsMod.LOGGER.warn("Failed to read bundled advancement docs.", exception);
            return null;
        }
    }

    private static String string(final JsonObject object, final String key) {
        if (object == null || !object.has(key) || object.get(key).isJsonNull()) {
            return null;
        }
        try {
            return object.get(key).getAsString();
        } catch (Exception exception) {
            return null;
        }
    }

    private static String norm(final String value) {
        return value.trim().toLowerCase(Locale.ROOT);
    }
}
