package com.lunaos.lustats.config;

import com.lunaos.lustats.LuStatsMod;
import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import com.google.gson.JsonSyntaxException;
import net.fabricmc.loader.api.FabricLoader;

import java.io.IOException;
import java.io.Reader;
import java.io.Writer;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;

public final class ConfigManager {
    private static final Gson GSON = new GsonBuilder()
        .setPrettyPrinting()
        .disableHtmlEscaping()
        .create();

    private final Path configPath;
    private LuStatsConfig config = new LuStatsConfig();

    public ConfigManager() {
        this.configPath = FabricLoader.getInstance().getConfigDir().resolve("lustats.json");
    }

    public LuStatsConfig config() {
        return config;
    }

    public void load() {
        if (!Files.exists(configPath)) {
            config = new LuStatsConfig();
            save();
            return;
        }

        try (Reader reader = Files.newBufferedReader(configPath, StandardCharsets.UTF_8)) {
            LuStatsConfig loaded = GSON.fromJson(reader, LuStatsConfig.class);
            config = loaded == null ? new LuStatsConfig() : loaded;
            validate();
            save();
        } catch (IOException | JsonSyntaxException exception) {
            LuStatsMod.LOGGER.error("Failed to load LuStats config at {}. Falling back to defaults.", configPath, exception);
            config = new LuStatsConfig();
            save();
        }
    }

    public void save() {
        try {
            Files.createDirectories(configPath.getParent());
            try (Writer writer = Files.newBufferedWriter(configPath, StandardCharsets.UTF_8)) {
                GSON.toJson(config, writer);
            }
        } catch (IOException exception) {
            LuStatsMod.LOGGER.error("Failed to save LuStats config at {}.", configPath, exception);
        }
    }

    private void validate() {
        if (config.web == null) {
            config.web = new LuStatsConfig.Web();
        }
        if (config.display == null) {
            config.display = new LuStatsConfig.Display();
        }
        if (config.history == null) {
            config.history = new LuStatsConfig.History();
        }
        if (config.tracking == null) {
            config.tracking = new LuStatsConfig.Tracking();
        }
        if (config.web.bindAddress == null || config.web.bindAddress.isBlank()) {
            config.web.bindAddress = "0.0.0.0";
        }
        if (config.web.port < 1 || config.web.port > 65535) {
            config.web.port = 8765;
        }
        if (config.web.requestTimeoutSeconds < 1) {
            config.web.requestTimeoutSeconds = 10;
        }
        if (config.display.enabledStatTypes == null) {
            config.display.enabledStatTypes = new LuStatsConfig.Display().enabledStatTypes;
        }
        if (config.display.enabledStats == null) {
            config.display.enabledStats = new LuStatsConfig.Display().enabledStats;
        }
        if (config.display.hiddenStats == null) {
            config.display.hiddenStats = new LuStatsConfig.Display().hiddenStats;
        }
        if (config.display.hiddenPlayers == null) {
            config.display.hiddenPlayers = new LuStatsConfig.Display().hiddenPlayers;
        }
        if (config.display.featuredStats == null) {
            config.display.featuredStats = new LuStatsConfig.Display().featuredStats;
        }
        if (config.display.maxStatsPerPlayer < 0) {
            config.display.maxStatsPerPlayer = 0;
        }
        if (config.history.sampleIntervalSeconds < 30) {
            config.history.sampleIntervalSeconds = 30;
        }
        if (config.history.maxSamples < 2) {
            config.history.maxSamples = 2;
        }
        if (config.history.trackedStats == null) {
            config.history.trackedStats = new LuStatsConfig.History().trackedStats;
        }
        if (config.tracking.maxEvents < 10) {
            config.tracking.maxEvents = 10;
        }
        if (config.tracking.afkThresholdSeconds < 10) {
            config.tracking.afkThresholdSeconds = 10;
        }
        if (config.tracking.movementSampleSeconds < 1) {
            config.tracking.movementSampleSeconds = 1;
        }
        if (config.tracking.movementBucketSize < 1) {
            config.tracking.movementBucketSize = 1;
        }
        if (config.tracking.movementMaxPointsPerPlayer < 10) {
            config.tracking.movementMaxPointsPerPlayer = 10;
        }
        if (config.tracking.movementMaxBucketsPerPlayer < 10) {
            config.tracking.movementMaxBucketsPerPlayer = 10;
        }
    }
}
