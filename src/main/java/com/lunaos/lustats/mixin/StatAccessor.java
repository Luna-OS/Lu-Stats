package com.lunaos.lustats.mixin;

import net.minecraft.stats.Stat;
import net.minecraft.stats.StatFormatter;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.gen.Accessor;

/**
 * Exposes a stat's formatter so the dashboard knows its unit (time, distance,
 * damage or a plain count) and can format values itself.
 */
@Mixin(Stat.class)
public interface StatAccessor {
    @Accessor("formatter")
    StatFormatter lustats$getFormatter();
}
