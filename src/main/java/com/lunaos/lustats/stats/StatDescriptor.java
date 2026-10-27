package com.lunaos.lustats.stats;

import net.minecraft.stats.Stat;

public final class StatDescriptor {
    public final String key;
    public final String typeId;
    public final String valueId;
    public final String category;
    public final String name;
    /** "time" (ticks), "distance" (cm), "damage" (tenths) or "count". */
    public final String unit;
    public final Stat<?> stat;

    public StatDescriptor(
        final String key,
        final String typeId,
        final String valueId,
        final String category,
        final String name,
        final String unit,
        final Stat<?> stat
    ) {
        this.key = key;
        this.typeId = typeId;
        this.valueId = valueId;
        this.category = category;
        this.name = name;
        this.unit = unit;
        this.stat = stat;
    }
}
