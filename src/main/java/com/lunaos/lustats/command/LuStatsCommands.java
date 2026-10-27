package com.lunaos.lustats.command;

import com.lunaos.lustats.LuStatsMod;
import com.lunaos.lustats.stats.StatDescriptor;
import com.lunaos.lustats.stats.StatResolver;
import com.lunaos.lustats.stats.StatsService;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import com.mojang.brigadier.arguments.IntegerArgumentType;
import com.mojang.brigadier.arguments.StringArgumentType;
import com.mojang.brigadier.context.CommandContext;
import com.mojang.brigadier.suggestion.Suggestions;
import com.mojang.brigadier.suggestion.SuggestionsBuilder;
import net.fabricmc.fabric.api.command.v2.CommandRegistrationCallback;
import net.minecraft.commands.CommandSourceStack;
import net.minecraft.network.chat.Component;
import net.minecraft.server.MinecraftServer;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.server.permissions.Permission;
import net.minecraft.server.permissions.PermissionLevel;
import net.minecraft.stats.ServerStatsCounter;
import net.minecraft.stats.Stat;
import net.minecraft.world.level.storage.LevelResource;

import java.io.Reader;
import java.nio.charset.StandardCharsets;
import java.nio.file.DirectoryStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;

import static net.minecraft.commands.Commands.argument;
import static net.minecraft.commands.Commands.literal;

public final class LuStatsCommands {
    private static final Permission EDIT_STATS_PERMISSION = new Permission.HasCommandLevel(PermissionLevel.GAMEMASTERS);
    private static final java.util.function.Predicate<CommandSourceStack> OP =
        source -> source.permissions().hasPermission(EDIT_STATS_PERMISSION);
    private static final int MAX_CHAT_ROWS = 20;

    private LuStatsCommands() {
    }

    public static void register() {
        CommandRegistrationCallback.EVENT.register((dispatcher, registryAccess, environment) -> dispatcher.register(
            literal("lustats")
                .executes(LuStatsCommands::help)
                .then(literal("help")
                    .executes(LuStatsCommands::help))
                .then(literal("web")
                    .executes(LuStatsCommands::web))
                .then(literal("privat")
                    .executes(LuStatsCommands::privat))
                .then(literal("reload")
                    .requires(OP)
                    .executes(LuStatsCommands::reload))
                .then(literal("hide")
                    .requires(OP)
                    .then(argument("player", StringArgumentType.word())
                        .suggests(LuStatsCommands::suggestPlayers)
                        .executes(context -> setHidden(context, true))))
                .then(literal("unhide")
                    .requires(OP)
                    .then(argument("player", StringArgumentType.word())
                        .suggests(LuStatsCommands::suggestHiddenPlayers)
                        .executes(context -> setHidden(context, false))))
                .then(literal("hidden")
                    .requires(OP)
                    .executes(LuStatsCommands::listHidden))
                .then(literal("stats")
                    .requires(OP)
                    .executes(context -> listStats(context, ""))
                    .then(argument("search", StringArgumentType.greedyString())
                        .suggests(LuStatsCommands::suggestStats)
                        .executes(context -> listStats(context, StringArgumentType.getString(context, "search")))))
                .then(literal("player")
                    .requires(OP)
                    .then(argument("player", StringArgumentType.word())
                        .suggests(LuStatsCommands::suggestPlayers)
                        .executes(context -> playerStats(context, ""))
                        .then(argument("search", StringArgumentType.greedyString())
                            .suggests(LuStatsCommands::suggestStats)
                            .executes(context -> playerStats(context, StringArgumentType.getString(context, "search"))))))
                .then(literal("get")
                    .requires(OP)
                    .then(argument("player", StringArgumentType.word())
                        .suggests(LuStatsCommands::suggestPlayers)
                        .executes(context -> playerStats(context, ""))
                        .then(argument("stat", StringArgumentType.greedyString())
                            .suggests(LuStatsCommands::suggestStats)
                            .executes(LuStatsCommands::get))))
                .then(literal("set")
                    .requires(OP)
                    .then(argument("player", StringArgumentType.word())
                        .suggests(LuStatsCommands::suggestPlayers)
                        .then(argument("amount", IntegerArgumentType.integer(0))
                            .then(argument("stat", StringArgumentType.greedyString())
                                .suggests(LuStatsCommands::suggestStats)
                                .executes(context -> set(context, false))))))
                .then(literal("add")
                    .requires(OP)
                    .then(argument("player", StringArgumentType.word())
                        .suggests(LuStatsCommands::suggestPlayers)
                        .then(argument("amount", IntegerArgumentType.integer())
                            .then(argument("stat", StringArgumentType.greedyString())
                                .suggests(LuStatsCommands::suggestStats)
                                .executes(context -> set(context, true))))))
        ));
    }

    private static int help(final CommandContext<CommandSourceStack> context) {
        context.getSource().sendSuccess(() -> Component.literal("""
            Lu-Stats commands:
            /lustats web
            /lustats privat  (hide/show yourself on the website)
            /lustats reload
            /lustats hide <online/offline player or uuid>
            /lustats unhide <online/offline player or uuid>
            /lustats hidden
            /lustats stats [search]
            /lustats player <online/offline player or uuid> [search]
            /lustats get <online/offline player or uuid> <stat name/key>
            /lustats set <online/offline player or uuid> <amount> <stat name/key>
            /lustats add <online/offline player or uuid> <amount> <stat name/key>
            Examples: /lustats get Steve deaths | /lustats set Steve 0 deaths
            """), false);
        return 1;
    }

    private static int reload(final CommandContext<CommandSourceStack> context) {
        LuStatsMod.reload(context.getSource().getServer());
        context.getSource().sendSuccess(() -> Component.literal("LuStats config reloaded. Web dashboard: " + LuStatsMod.webAddress()), true);
        return 1;
    }

    private static int web(final CommandContext<CommandSourceStack> context) {
        context.getSource().sendSuccess(() -> Component.literal("Lu-Stats web dashboard: " + LuStatsMod.webAddress()), false);
        return 1;
    }

    /** Player-executable opt-out: toggles the player's own visibility on the dashboard. */
    private static int privat(final CommandContext<CommandSourceStack> context) {
        ServerPlayer player = context.getSource().getPlayer();
        if (player == null) {
            context.getSource().sendFailure(Component.literal("Nur Spieler koennen /lustats privat benutzen."));
            return 0;
        }
        if (!LuStatsMod.config().web.allowPrivate) {
            context.getSource().sendFailure(Component.literal("Diese Funktion ist auf dem Server ausgeschaltet."));
            return 0;
        }
        boolean hidden = LuStatsMod.consent().toggleHidden(player.getUUID(), player.getGameProfile().name());
        if (LuStatsMod.advancementSystem() != null) {
            LuStatsMod.advancementSystem().invalidate();
        }
        context.getSource().sendSuccess(() -> Component.literal(hidden
            ? "Du bist jetzt auf der Lu-Stats Website ausgeblendet: keine Spielerseite, nicht in der Rangliste, keine Live-Meldungen. Nochmal /lustats privat macht dich wieder sichtbar."
            : "Du bist auf der Lu-Stats Website wieder sichtbar."), false);
        return 1;
    }

    private static int setHidden(final CommandContext<CommandSourceStack> context, final boolean hidden) {
        try {
            List<String> hiddenPlayers = LuStatsMod.config().display.hiddenPlayers;
            StatsTarget target = hidden ? resolveTarget(context) : resolveHiddenTarget(context, hiddenPlayers);
            int existingIndex = indexOfIgnoreCase(hiddenPlayers, target.id);
            if (hidden == (existingIndex >= 0)) {
                context.getSource().sendSuccess(() -> Component.literal(target.displayName + " is already " + (hidden ? "hidden." : "visible.")), false);
                return 0;
            }

            if (hidden) {
                hiddenPlayers.add(target.id);
            } else {
                hiddenPlayers.remove(existingIndex);
            }
            LuStatsMod.saveConfig();
            context.getSource().sendSuccess(
                () -> Component.literal(target.displayName + " is now " + (hidden ? "hidden from" : "visible on") + " the LuStats dashboard."),
                true
            );
            return 1;
        } catch (IllegalArgumentException exception) {
            context.getSource().sendFailure(Component.literal(exception.getMessage()));
            return 0;
        }
    }

    private static int listHidden(final CommandContext<CommandSourceStack> context) {
        List<String> hiddenPlayers = LuStatsMod.config().display.hiddenPlayers;
        if (hiddenPlayers.isEmpty()) {
            context.getSource().sendSuccess(() -> Component.literal("LuStats has no hidden players."), false);
            return 0;
        }

        Map<String, String> names = loadKnownNames(context.getSource().getServer());
        context.getSource().sendSuccess(() -> Component.literal("Hidden LuStats players (" + hiddenPlayers.size() + "):"), false);
        for (String id : hiddenPlayers.stream().limit(MAX_CHAT_ROWS).toList()) {
            context.getSource().sendSuccess(() -> Component.literal("- " + names.getOrDefault(id, id) + " [" + id + "]"), false);
        }
        if (hiddenPlayers.size() > MAX_CHAT_ROWS) {
            context.getSource().sendSuccess(() -> Component.literal("Showing first " + MAX_CHAT_ROWS + "."), false);
        }
        return hiddenPlayers.size();
    }

    private static StatsTarget resolveHiddenTarget(final CommandContext<CommandSourceStack> context, final List<String> hiddenPlayers) {
        String rawPlayer = StringArgumentType.getString(context, "player");
        Map<String, String> names = loadKnownNames(context.getSource().getServer());
        for (String id : hiddenPlayers) {
            if (id.equalsIgnoreCase(rawPlayer) || names.getOrDefault(id, id).equalsIgnoreCase(rawPlayer)) {
                return new StatsTarget(names.getOrDefault(id, id), id, null, null, false);
            }
        }
        throw new IllegalArgumentException("Player '" + rawPlayer + "' is not hidden from LuStats.");
    }

    private static int listStats(final CommandContext<CommandSourceStack> context, final String search) {
        List<StatDescriptor> stats = search.isBlank() ? StatResolver.buildCatalog() : StatResolver.search(search);
        context.getSource().sendSuccess(
            () -> Component.literal("LuStats stats matching '" + (search.isBlank() ? "all" : search) + "' (" + stats.size() + "):"),
            false
        );

        for (StatDescriptor descriptor : stats.stream().limit(MAX_CHAT_ROWS).toList()) {
            context.getSource().sendSuccess(
                () -> Component.literal("- " + descriptor.name + " [" + descriptor.category + "] key: " + descriptor.key),
                false
            );
        }

        if (stats.size() > MAX_CHAT_ROWS) {
            context.getSource().sendSuccess(() -> Component.literal("Showing first " + MAX_CHAT_ROWS + ". Add a search term to narrow results."), false);
        }

        return stats.size();
    }

    private static int playerStats(final CommandContext<CommandSourceStack> context, final String search) {
        try {
            StatsTarget target = resolveTarget(context);
            List<StatDescriptor> stats = search.isBlank() ? StatResolver.buildCatalog() : StatResolver.search(search);
            List<StatDescriptor> nonZeroStats = stats.stream()
                .filter(descriptor -> target.stats.getValue(descriptor.stat) != 0)
                .toList();

            context.getSource().sendSuccess(
                () -> Component.literal(target.displayName + " stats matching '" + (search.isBlank() ? "all non-zero" : search) + "' (" + nonZeroStats.size() + ")" + target.statusSuffix() + ":"),
                false
            );

            for (StatDescriptor descriptor : nonZeroStats.stream().limit(MAX_CHAT_ROWS).toList()) {
                int value = target.stats.getValue(descriptor.stat);
                context.getSource().sendSuccess(
                    () -> Component.literal("- " + descriptor.name + ": " + descriptor.stat.format(value) + " (" + value + ") [" + descriptor.key + "]"),
                    false
                );
            }

            if (nonZeroStats.size() > MAX_CHAT_ROWS) {
                context.getSource().sendSuccess(() -> Component.literal("Showing first " + MAX_CHAT_ROWS + ". Add a search term to narrow results."), false);
            }

            return nonZeroStats.size();
        } catch (IllegalArgumentException exception) {
            context.getSource().sendFailure(Component.literal(exception.getMessage()));
            return 0;
        }
    }

    private static int get(final CommandContext<CommandSourceStack> context) {
        try {
            StatsTarget target = resolveTarget(context);
            StatDescriptor descriptor = statDescriptor(context);
            int value = target.stats.getValue(descriptor.stat);
            context.getSource().sendSuccess(
                () -> Component.literal(target.displayName + " " + descriptor.name + " = " + descriptor.stat.format(value) + " (" + value + ") [" + descriptor.key + "]" + target.statusSuffix()),
                false
            );
            return value;
        } catch (IllegalArgumentException exception) {
            context.getSource().sendFailure(Component.literal(exception.getMessage()));
            return 0;
        }
    }

    private static int set(final CommandContext<CommandSourceStack> context, final boolean add) {
        try {
            StatsTarget target = resolveTarget(context);
            StatDescriptor descriptor = statDescriptor(context);
            Stat<?> stat = descriptor.stat;
            int amount = IntegerArgumentType.getInteger(context, "amount");
            int oldValue = target.stats.getValue(stat);
            int newValue = add ? (int) Math.max(0, Math.min(Integer.MAX_VALUE, (long) oldValue + amount)) : amount;

            target.stats.setValue(target.onlinePlayer, stat, newValue);
            target.stats.save();
            if (target.onlinePlayer != null) {
                target.stats.sendStats(target.onlinePlayer);
            }

            String action = add ? "Updated" : "Set";
            String executor = context.getSource().getTextName();
            LuStatsMod.LOGGER.info(
                "{} {} {} {} from {} ({}) to {} ({}) [{}]{}",
                executor,
                action.toLowerCase(),
                target.displayName,
                descriptor.name,
                stat.format(oldValue),
                oldValue,
                stat.format(newValue),
                newValue,
                descriptor.key,
                target.statusSuffix()
            );
            context.getSource().sendSuccess(
                () -> Component.literal(executor + " " + action.toLowerCase() + " " + target.displayName + " " + descriptor.name + " to " + stat.format(newValue) + " (" + newValue + ") [" + descriptor.key + "]" + target.statusSuffix()),
                true
            );
            return newValue;
        } catch (IllegalArgumentException exception) {
            context.getSource().sendFailure(Component.literal(exception.getMessage()));
            return 0;
        }
    }

    private static StatDescriptor statDescriptor(final CommandContext<CommandSourceStack> context) {
        return StatResolver.resolveFlexible(StringArgumentType.getString(context, "stat"));
    }

    private static StatsTarget resolveTarget(final CommandContext<CommandSourceStack> context) {
        MinecraftServer server = context.getSource().getServer();
        String rawPlayer = StringArgumentType.getString(context, "player");

        ServerPlayer onlineByName = server.getPlayerList().getPlayer(rawPlayer);
        if (onlineByName != null) {
            return new StatsTarget(onlineByName.getGameProfile().name(), onlineByName.getUUID().toString(), onlineByName.getStats(), onlineByName, true);
        }

        UUID rawUuid = parseUuid(rawPlayer);
        if (rawUuid != null) {
            ServerPlayer onlineByUuid = server.getPlayerList().getPlayer(rawUuid);
            if (onlineByUuid != null) {
                return new StatsTarget(onlineByUuid.getGameProfile().name(), onlineByUuid.getUUID().toString(), onlineByUuid.getStats(), onlineByUuid, true);
            }
        }

        Map<String, String> namesById = loadKnownNames(server);
        Path statsDirectory = server.getWorldPath(LevelResource.PLAYER_STATS_DIR);
        PlayerFile targetFile = findPlayerFile(rawPlayer, rawUuid, namesById, statsDirectory);
        if (targetFile == null) {
            throw new IllegalArgumentException("Unknown offline player '" + rawPlayer + "'. Use a UUID or a player with an existing stats file/usercache entry.");
        }

        ServerStatsCounter stats = new ServerStatsCounter(server, targetFile.path);
        return new StatsTarget(targetFile.name, targetFile.id, stats, null, false);
    }

    private static PlayerFile findPlayerFile(final String rawPlayer, final UUID rawUuid, final Map<String, String> namesById, final Path statsDirectory) {
        if (rawUuid != null) {
            String id = rawUuid.toString();
            return new PlayerFile(id, namesById.getOrDefault(id, id), statsDirectory.resolve(id + ".json"));
        }

        for (Map.Entry<String, String> entry : namesById.entrySet()) {
            if (entry.getValue().equalsIgnoreCase(rawPlayer)) {
                return new PlayerFile(entry.getKey(), entry.getValue(), statsDirectory.resolve(entry.getKey() + ".json"));
            }
        }

        Path legacyNameFile = statsDirectory.resolve(rawPlayer + ".json");
        if (Files.isRegularFile(legacyNameFile)) {
            return new PlayerFile(rawPlayer, rawPlayer, legacyNameFile);
        }

        try (DirectoryStream<Path> stream = Files.newDirectoryStream(statsDirectory, "*.json")) {
            for (Path file : stream) {
                String id = stripJson(file.getFileName().toString());
                if (id.equalsIgnoreCase(rawPlayer)) {
                    return new PlayerFile(id, namesById.getOrDefault(id, id), file);
                }
            }
        } catch (Exception ignored) {
            return null;
        }

        return null;
    }

    private static Map<String, String> loadKnownNames(final MinecraftServer server) {
        StatsService service = LuStatsMod.statsService();
        return service == null ? new LinkedHashMap<>() : new LinkedHashMap<>(service.names().knownNames());
    }

    private static CompletableFuture<Suggestions> suggestStats(final CommandContext<CommandSourceStack> context, final SuggestionsBuilder builder) {
        return suggestMatching(StatResolver.statSuggestions(), builder);
    }

    private static CompletableFuture<Suggestions> suggestPlayers(final CommandContext<CommandSourceStack> context, final SuggestionsBuilder builder) {
        MinecraftServer server = context.getSource().getServer();
        for (String name : server.getPlayerNames()) {
            suggestIfMatches(builder, name);
        }

        loadKnownNames(server).values()
            .stream()
            .sorted(String.CASE_INSENSITIVE_ORDER)
            .forEach(name -> suggestIfMatches(builder, name));

        Path statsDirectory = server.getWorldPath(LevelResource.PLAYER_STATS_DIR);
        if (Files.isDirectory(statsDirectory)) {
            try (DirectoryStream<Path> stream = Files.newDirectoryStream(statsDirectory, "*.json")) {
                for (Path file : stream) {
                    suggestIfMatches(builder, stripJson(file.getFileName().toString()));
                }
            } catch (Exception ignored) {
            }
        }

        return builder.buildFuture();
    }

    private static CompletableFuture<Suggestions> suggestHiddenPlayers(final CommandContext<CommandSourceStack> context, final SuggestionsBuilder builder) {
        Map<String, String> names = loadKnownNames(context.getSource().getServer());
        for (String id : LuStatsMod.config().display.hiddenPlayers) {
            suggestIfMatches(builder, names.getOrDefault(id, id));
            suggestIfMatches(builder, id);
        }
        return builder.buildFuture();
    }

    private static CompletableFuture<Suggestions> suggestMatching(final Iterable<String> values, final SuggestionsBuilder builder) {
        for (String value : values) {
            suggestIfMatches(builder, value);
        }

        return builder.buildFuture();
    }

    private static void suggestIfMatches(final SuggestionsBuilder builder, final String value) {
        String remaining = builder.getRemaining().toLowerCase();
        if (value.toLowerCase().contains(remaining)) {
            builder.suggest(value);
        }
    }

    private static UUID parseUuid(final String value) {
        try {
            return UUID.fromString(value);
        } catch (IllegalArgumentException ignored) {
            return null;
        }
    }

    private static int indexOfIgnoreCase(final List<String> values, final String value) {
        for (int index = 0; index < values.size(); index++) {
            if (values.get(index).equalsIgnoreCase(value)) {
                return index;
            }
        }
        return -1;
    }

    private static String stripJson(final String fileName) {
        return fileName.endsWith(".json") ? fileName.substring(0, fileName.length() - ".json".length()) : fileName;
    }

    private record StatsTarget(
        String displayName,
        String id,
        ServerStatsCounter stats,
        ServerPlayer onlinePlayer,
        boolean online
    ) {
        private String statusSuffix() {
            return online ? " (online)" : " (offline)";
        }
    }

    private record PlayerFile(String id, String name, Path path) {
    }
}
