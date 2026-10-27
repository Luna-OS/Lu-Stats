package com.lunaos.lustats;

import com.lunaos.lustats.adv.AdvancementSystem;
import com.lunaos.lustats.adv.Consent;
import com.lunaos.lustats.command.LuStatsCommands;
import com.lunaos.lustats.config.ConfigManager;
import com.lunaos.lustats.config.LuStatsConfig;
import com.lunaos.lustats.stats.StatsApi;
import com.lunaos.lustats.stats.StatsService;
import com.lunaos.lustats.tracking.EventHooks;
import com.lunaos.lustats.tracking.GameEvent;
import com.lunaos.lustats.web.StatsWebServer;
import net.fabricmc.api.ModInitializer;
import net.fabricmc.fabric.api.event.lifecycle.v1.ServerLifecycleEvents;
import net.fabricmc.fabric.api.event.lifecycle.v1.ServerTickEvents;
import net.fabricmc.fabric.api.networking.v1.ServerPlayConnectionEvents;
import net.fabricmc.loader.api.FabricLoader;
import net.minecraft.server.MinecraftServer;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

public final class LuStatsMod implements ModInitializer {
    public static final String MOD_ID = "lustats";
    public static final Logger LOGGER = LoggerFactory.getLogger(MOD_ID);

    private static ConfigManager configManager;
    private static StatsService statsService;
    private static StatsApi statsApi;
    private static Consent consent;
    private static AdvancementSystem advancementSystem;
    private static StatsWebServer webServer;
    private static int tickCounter;

    @Override
    public void onInitialize() {
        configManager = new ConfigManager();
        configManager.load();
        consent = new Consent();

        LuStatsCommands.register();
        EventHooks.registerDeathEvent();

        ServerLifecycleEvents.SERVER_STARTED.register(LuStatsMod::onServerStarted);
        ServerLifecycleEvents.SERVER_STOPPING.register(LuStatsMod::onServerStopping);
        ServerLifecycleEvents.END_DATA_PACK_RELOAD.register((server, resources, success) -> {
            if (advancementSystem != null) {
                advancementSystem.reloadIndex();
            }
        });
        ServerPlayConnectionEvents.JOIN.register((handler, sender, server) -> {
            if (statsApi != null) {
                statsApi.invalidate();
            }
            if (advancementSystem != null) {
                advancementSystem.onJoin(handler.player);
            }
        });
        ServerPlayConnectionEvents.DISCONNECT.register((handler, server) -> {
            if (statsApi != null) {
                statsApi.invalidate();
            }
            if (advancementSystem != null) {
                advancementSystem.onLeave(handler.player);
            }
        });
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
        statsApi = new StatsApi(server, statsService);
        advancementSystem = new AdvancementSystem(server, modVersion(), consent,
            configManager.config().web.maxLiveConnectionsPerIp, true);
        advancementSystem.start();
        startWebServer(server);
    }

    private static void onServerStopping(final MinecraftServer server) {
        stopWebServer();
        if (advancementSystem != null) {
            advancementSystem.stop();
            advancementSystem = null;
        }
        if (statsService != null) {
            statsService.close();
        }
        statsService = null;
        statsApi = null;
        tickCounter = 0;
    }

    public static LuStatsConfig config() {
        return configManager.config();
    }

    public static StatsService statsService() {
        return statsService;
    }

    public static Consent consent() {
        return consent;
    }

    public static AdvancementSystem advancementSystem() {
        return advancementSystem;
    }

    public static String modVersion() {
        return FabricLoader.getInstance().getModContainer(MOD_ID)
            .map(container -> container.getMetadata().getVersion().getFriendlyString())
            .orElse("1.2.0");
    }

    public static void saveConfig() {
        configManager.save();
        if (statsService != null) {
            statsService.refreshConfig();
        }
        if (statsApi != null) {
            statsApi.invalidate();
        }
        if (advancementSystem != null) {
            advancementSystem.invalidate();
        }
    }

    /** A death or advancement was added to the timeline: refresh stats and push it to the live feed. */
    public static void onGameEvent(final GameEvent event) {
        if (statsApi != null) {
            statsApi.invalidate();
        }
        if (advancementSystem != null) {
            advancementSystem.broadcastFeed(StatsApi.event(event));
        }
    }

    /**
     * True when a player must not appear anywhere on the website: either their own
     * {@code /lustats privat} opt-out or an operator's {@code /lustats hide}.
     */
    public static boolean hiddenOnWeb(final String uuid) {
        if (uuid == null) {
            return false;
        }
        if (consent != null && consent.isHidden(uuid)) {
            return true;
        }
        for (String id : configManager.config().display.hiddenPlayers) {
            if (id.equalsIgnoreCase(uuid)) {
                return true;
            }
        }
        return false;
    }

    public static void reload(final MinecraftServer server) {
        configManager.load();
        if (statsService != null) {
            statsService.refreshConfig();
        }
        if (statsApi != null) {
            statsApi.invalidate();
        }
        if (advancementSystem != null) {
            advancementSystem.invalidate();
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
            LOGGER.info("Lu-Stats web dashboard disabled by config.");
            return;
        }
        webServer = new StatsWebServer(server, advancementSystem, statsApi, config);
        webServer.start();
    }

    private static void stopWebServer() {
        if (webServer != null) {
            webServer.stop();
            webServer = null;
        }
    }
}
