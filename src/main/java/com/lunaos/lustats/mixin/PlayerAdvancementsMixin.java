package com.lunaos.lustats.mixin;

import com.lunaos.lustats.tracking.EventHooks;
import net.minecraft.advancements.AdvancementHolder;
import net.minecraft.server.PlayerAdvancements;
import net.minecraft.server.level.ServerPlayer;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.Shadow;
import org.spongepowered.asm.mixin.Unique;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfoReturnable;

import java.util.HashSet;
import java.util.Set;

/**
 * Fires a Lu-Stats timeline event when a player completes an advancement.
 * Vanilla has no public advancement-granted event, so we inject at the tail of
 * {@code PlayerAdvancements.award} and report once the advancement is fully
 * done, de-duplicating per advancement id.
 */
@Mixin(PlayerAdvancements.class)
public abstract class PlayerAdvancementsMixin {
    @Shadow
    private ServerPlayer player;

    @Unique
    private final Set<String> lustats$announced = new HashSet<>();

    @Inject(
        method = "award(Lnet/minecraft/advancements/AdvancementHolder;Ljava/lang/String;)Z",
        at = @At("RETURN")
    )
    private void lustats$onAward(final AdvancementHolder holder, final String criterion,
                                 final CallbackInfoReturnable<Boolean> cir) {
        if (player == null || holder == null) {
            return;
        }
        PlayerAdvancements self = (PlayerAdvancements) (Object) this;
        if (!self.getOrStartProgress(holder).isDone()) {
            return;
        }
        if (!lustats$announced.add(holder.id().toString())) {
            return;
        }
        EventHooks.onAdvancement(player, holder);
    }
}
