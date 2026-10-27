package com.lunaos.lustats;

import com.lunaos.lustats.command.LuStatsCommands;
import com.lunaos.lustats.config.ConfigManager;
import com.lunaos.lustats.config.LuStatsConfig;
import com.lunaos.lustats.stats.StatsService;
import com.lunaos.lustats.tracking.EventHooks;
import com.lunaos.lustats.web.StatsWebServer;
import net.fabricmc.api.ModInitializer;
import net.fabricmc.fabric.api.event.lifecycle.v1.ServerLifecycleEvents;
import net.fabricmc.fabric.api.event.lifecycle.v1.ServerTickEvents;
import net.minecraft.server.MinecraftServer;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

public final class LuStatsMod implements ModInitializer {
    public static final String MOD_ID = "lustats";
    public static final Logger LOGGER = LoggerFactory.getLogger(MOD_ID);

    private static ConfigManager configManager;
    private static StatsService statsService;
    private static StatsWebServer webServer;
    private static int tickCounter;

    @Override
    public void onInitialize() {
        configManager = new ConfigManager();
        configManager.load();

        LuStatsCommands.register();
        EventHooks.registerDeathEvent();

        ServerLifecycleEvents.SERVER_STARTED.register(LuStatsMod::onServerStarted);
        ServerLifecycleEvents.SERVER_STOPPING.register(LuStatsMod::onServerStopping);
        ServerTickEvents.END_SERVER_TICK.register(server -> {
            tickCounter++;
            if (statsService != null && tickCounter >= 20) {
                tickCounter = 0;
                statsService.tick();
            }
        });
    }

    private static void onServerStarted(final MinecraftServer server) {
        tickCounter = 0;
        statsService = new StatsService(server, configManager);
        startWebServer(server);
    }

    private static void onServerStopping(final MinecraftServer server) {
        stopWebServer();
        if (statsService != null) {
            statsService.close();
        }
        statsService = null;
        tickCounter = 0;
    }

    public static LuStatsConfig config() {
        return configManager.config();
    }

    public static StatsService statsService() {
        return statsService;
    }

    public static void saveConfig() {
        configManager.save();
        if (statsService != null) {
            statsService.refreshConfig();
        }
    }

    public static void reload(final MinecraftServer server) {
        configManager.load();
        if (statsService != null) {
            statsService.refreshConfig();
        }

        stopWebServer();
        startWebServer(server);
    }

    public static String webAddress() {
        if (webServer == null || !webServer.isRunning()) {
            return "disabled";
        }

        return webServer.address();
    }

    private static void startWebServer(final MinecraftServer server) {
        LuStatsConfig config = configManager.config();
        if (!config.web.enabled) {
            LOGGER.info("LuStats web dashboard disabled by config.");
            return;
        }

        webServer = new StatsWebServer(server, statsService, config);
        webServer.start();
    }

    private static void stopWebServer() {
        if (webServer != null) {
            webServer.stop();
            webServer = null;
        }
    }
}
