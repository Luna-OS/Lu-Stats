package com.lunaos.lustats.tracking;

import com.lunaos.lustats.LuStatsMod;
import com.lunaos.lustats.stats.StatsService;
import net.fabricmc.fabric.api.entity.event.v1.ServerLivingEntityEvents;
import net.minecraft.advancements.AdvancementHolder;
import net.minecraft.advancements.DisplayInfo;
import net.minecraft.core.BlockPos;
import net.minecraft.world.damagesource.DamageSource;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.server.level.ServerPlayer;

import java.util.Optional;

/**
 * Bridges Minecraft gameplay into the {@link EventLog}. The death hook uses the
 * public Fabric event; advancements come in from {@code PlayerAdvancementsMixin}
 * via {@link #onAdvancement}. All extraction of Minecraft types lives here so
 * the mixin stays tiny.
 */
public final class EventHooks {
    private EventHooks() {
    }

    /** Registered once at mod init; the event log may not exist yet (guarded). */
    public static void registerDeathEvent() {
        ServerLivingEntityEvents.AFTER_DEATH.register((LivingEntity entity, DamageSource source) -> {
            if (!(entity instanceof ServerPlayer player)) {
                return;
            }
            EventLog log = log();
            if (log == null || !deathsEnabled()) {
                return;
            }

            GameEvent event = new GameEvent();
            event.type = GameEvent.TYPE_DEATH;
            event.playerId = player.getGameProfile().id().toString();
            event.playerName = player.getGameProfile().name();
            fillPosition(event, player);
            event.cause = source.getMsgId();
            try {
                event.message = source.getLocalizedDeathMessage(player).getString();
            } catch (Exception ignored) {
                event.message = player.getGameProfile().name() + " died";
            }

            Entity killer = source.getEntity();
            if (killer == null) {
                killer = source.getDirectEntity();
            }
            if (killer != null) {
                event.killerType = EntityType.getKey(killer.getType()).toString();
                event.killerName = killer.getName().getString();
                if (killer instanceof ServerPlayer killerPlayer) {
                    event.killerPlayerId = killerPlayer.getGameProfile().id().toString();
                }
            }
            log.add(event);
        });
    }

    /** Called from the mixin when a player completes/updates an advancement. */
    public static void onAdvancement(final ServerPlayer player, final AdvancementHolder holder) {
        if (player != null && holder != null) {
            com.lunaos.lustats.adv.AdvancementSystem system = LuStatsMod.advancementSystem();
            if (system != null) {
                system.onAdvancement(player, holder);
            }
        }

        EventLog log = log();
        if (log == null || !advancementsEnabled() || player == null || holder == null) {
            return;
        }
        Optional<DisplayInfo> display = holder.value().display();
        if (display.isEmpty()) {
            return; // recipe or hidden advancement — not a real achievement
        }

        GameEvent event = new GameEvent();
        event.type = GameEvent.TYPE_ADVANCEMENT;
        event.playerId = player.getGameProfile().id().toString();
        event.playerName = player.getGameProfile().name();
        fillPosition(event, player);
        event.advancementId = holder.id().toString();
        try {
            event.advancementTitle = display.get().title().getString();
        } catch (Exception ignored) {
            event.advancementTitle = holder.id().toString();
        }
        try {
            event.advancementKind = display.get().type().getSerializedName();
        } catch (Exception ignored) {
            event.advancementKind = "task";
        }
        log.add(event);
    }

    private static void fillPosition(final GameEvent event, final ServerPlayer player) {
        try {
            BlockPos pos = player.blockPosition();
            event.x = pos.getX();
            event.y = pos.getY();
            event.z = pos.getZ();
            event.dimension = player.level().dimension().identifier().toString();
        } catch (Exception ignored) {
            // positions are best-effort
        }
    }

    private static EventLog log() {
        StatsService service = LuStatsMod.statsService();
        return service == null ? null : service.eventLog();
    }

    private static boolean deathsEnabled() {
        return LuStatsMod.config().tracking.enabled && LuStatsMod.config().tracking.trackDeaths;
    }

    private static boolean advancementsEnabled() {
        return LuStatsMod.config().tracking.enabled && LuStatsMod.config().tracking.trackAdvancements;
    }
}
