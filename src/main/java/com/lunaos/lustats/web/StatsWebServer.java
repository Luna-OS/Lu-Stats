package com.lunaos.lustats.web;

import com.lunaos.lustats.LuStatsMod;
import com.lunaos.lustats.config.LuStatsConfig;
import com.lunaos.lustats.stats.StatsService;
import com.lunaos.lustats.stats.StatsSnapshotDto;
import com.lunaos.lustats.tracking.ActivityTracker;
import com.lunaos.lustats.tracking.GameEvent;
import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;
import net.minecraft.server.MinecraftServer;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.Inet4Address;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.NetworkInterface;
import java.nio.charset.StandardCharsets;
import java.util.Enumeration;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.zip.GZIPOutputStream;

public final class StatsWebServer {
    private static final Gson GSON = new GsonBuilder()
        .disableHtmlEscaping()
        .create();

    private final MinecraftServer minecraftServer;
    private final StatsService statsService;
    private final LuStatsConfig config;

    private HttpServer httpServer;
    private ExecutorService executor;
    private String address = "disabled";

    public StatsWebServer(final MinecraftServer minecraftServer, final StatsService statsService, final LuStatsConfig config) {
        this.minecraftServer = minecraftServer;
        this.statsService = statsService;
        this.config = config;
    }

    public void start() {
        try {
            InetAddress bindAddress = InetAddress.getByName(config.web.bindAddress);
            InetSocketAddress socketAddress = new InetSocketAddress(bindAddress, config.web.port);
            httpServer = HttpServer.create(socketAddress, 0);
            httpServer.createContext("/", this::handleIndex);
            httpServer.createContext("/favicon.png", this::handleFavicon);
            httpServer.createContext("/api/stats", this::handleStats);
            httpServer.createContext("/api/events", this::handleEvents);
            httpServer.createContext("/api/activity", this::handleActivity);
            httpServer.createContext("/api/movement", this::handleMovement);
            executor = Executors.newFixedThreadPool(6, runnable -> {
                Thread thread = new Thread(runnable, "LuStats Web");
                thread.setDaemon(true);
                return thread;
            });
            httpServer.setExecutor(executor);
            httpServer.start();
            address = displayAddress();
            LuStatsMod.LOGGER.info(
                "LuStats web dashboard listening on {}:{}; open {}",
                config.web.bindAddress,
                config.web.port,
                address
            );
        } catch (IOException exception) {
            LuStatsMod.LOGGER.error("Failed to start LuStats web dashboard on {}:{}.", config.web.bindAddress, config.web.port, exception);
        }
    }

    public void stop() {
        if (httpServer != null) {
            httpServer.stop(0);
            httpServer = null;
            if (executor != null) {
                executor.shutdownNow();
                executor = null;
            }
            LuStatsMod.LOGGER.info("LuStats web dashboard stopped.");
        }
    }

    public boolean isRunning() {
        return httpServer != null;
    }

    public String address() {
        return address;
    }

    private String displayAddress() {
        String host = "0.0.0.0".equals(config.web.bindAddress) || "::".equals(config.web.bindAddress)
            ? detectedHostAddress()
            : config.web.bindAddress;
        host = host.contains(":") ? "[" + host + "]" : host;
        return "http://" + host + ":" + config.web.port + "/";
    }

    private String detectedHostAddress() {
        try {
            String fallback = null;
            Enumeration<NetworkInterface> interfaces = NetworkInterface.getNetworkInterfaces();
            while (interfaces.hasMoreElements()) {
                NetworkInterface networkInterface = interfaces.nextElement();
                if (!networkInterface.isUp() || networkInterface.isLoopback() || networkInterface.isVirtual()) {
                    continue;
                }

                Enumeration<InetAddress> addresses = networkInterface.getInetAddresses();
                while (addresses.hasMoreElements()) {
                    InetAddress address = addresses.nextElement();
                    if (!(address instanceof Inet4Address)
                        || address.isLoopbackAddress()
                        || address.isAnyLocalAddress()
                        || address.isMulticastAddress()
                        || address.isLinkLocalAddress()) {
                        continue;
                    }
                    if (address.isSiteLocalAddress()) {
                        return address.getHostAddress();
                    }
                    if (fallback == null) {
                        fallback = address.getHostAddress();
                    }
                }
            }

            if (fallback != null) {
                return fallback;
            }

            InetAddress localHost = InetAddress.getLocalHost();
            if (localHost instanceof Inet4Address
                && !localHost.isLoopbackAddress()
                && !localHost.isAnyLocalAddress()
                && !localHost.isMulticastAddress()
                && !localHost.isLinkLocalAddress()) {
                return localHost.getHostAddress();
            }
        } catch (Exception exception) {
            LuStatsMod.LOGGER.debug("Failed to detect local LuStats dashboard address.", exception);
        }

        return "localhost";
    }

    private void handleIndex(final HttpExchange exchange) throws IOException {
        if (!"GET".equalsIgnoreCase(exchange.getRequestMethod())) {
            send(exchange, 405, "text/plain", "Method not allowed");
            return;
        }

        send(exchange, 200, "text/html", indexHtml());
    }

    private void handleFavicon(final HttpExchange exchange) throws IOException {
        if (!"GET".equalsIgnoreCase(exchange.getRequestMethod())) {
            send(exchange, 405, "text/plain", "Method not allowed");
            return;
        }

        try (InputStream stream = StatsWebServer.class.getResourceAsStream("/assets/lustats/icon.png")) {
            if (stream == null) {
                send(exchange, 404, "text/plain", "Not found");
                return;
            }
            send(exchange, 200, "image/png", stream.readAllBytes());
        }
    }

    private void handleStats(final HttpExchange exchange) throws IOException {
        if (!"GET".equalsIgnoreCase(exchange.getRequestMethod())) {
            send(exchange, 405, "application/json", "{\"error\":\"Method not allowed\"}");
            return;
        }

        CompletableFuture<StatsSnapshotDto> future = new CompletableFuture<>();
        minecraftServer.execute(() -> {
            try {
                future.complete(statsService.snapshot());
            } catch (Exception exception) {
                future.completeExceptionally(exception);
            }
        });

        try {
            StatsSnapshotDto snapshot = future.get(config.web.requestTimeoutSeconds, TimeUnit.SECONDS);
            send(exchange, 200, "application/json", GSON.toJson(snapshot));
        } catch (Exception exception) {
            LuStatsMod.LOGGER.warn("Failed to create LuStats web snapshot.", exception);
            send(exchange, 500, "application/json", "{\"error\":\"Failed to collect statistics\"}");
        }
    }

    private void handleEvents(final HttpExchange exchange) throws IOException {
        if (!"GET".equalsIgnoreCase(exchange.getRequestMethod())) {
            send(exchange, 405, "application/json", "{\"error\":\"Method not allowed\"}");
            return;
        }

        Map<String, String> query = parseQuery(exchange);
        long after = parseLong(query.get("after"), 0);
        int limit = (int) parseLong(query.get("limit"), 300);

        EventsResponse response = new EventsResponse();
        response.latestSeq = statsService.eventLog().latestSeq();
        response.events = statsService.eventLog().since(after, limit);
        send(exchange, 200, "application/json", GSON.toJson(response));
    }

    private void handleActivity(final HttpExchange exchange) throws IOException {
        if (!"GET".equalsIgnoreCase(exchange.getRequestMethod())) {
            send(exchange, 405, "application/json", "{\"error\":\"Method not allowed\"}");
            return;
        }

        CompletableFuture<List<ActivityTracker.PlayerActivityDto>> future = new CompletableFuture<>();
        minecraftServer.execute(() -> {
            try {
                future.complete(statsService.activityTracker().snapshot(minecraftServer));
            } catch (Exception exception) {
                future.completeExceptionally(exception);
            }
        });

        try {
            ActivityResponse response = new ActivityResponse();
            response.generatedAt = java.time.Instant.now().toString();
            response.players = future.get(config.web.requestTimeoutSeconds, TimeUnit.SECONDS);
            send(exchange, 200, "application/json", GSON.toJson(response));
        } catch (Exception exception) {
            LuStatsMod.LOGGER.warn("Failed to create LuStats activity snapshot.", exception);
            send(exchange, 500, "application/json", "{\"error\":\"Failed to collect activity\"}");
        }
    }

    private void handleMovement(final HttpExchange exchange) throws IOException {
        if (!"GET".equalsIgnoreCase(exchange.getRequestMethod())) {
            send(exchange, 405, "application/json", "{\"error\":\"Method not allowed\"}");
            return;
        }

        Map<String, String> query = parseQuery(exchange);
        String player = query.get("player");
        int maxPoints = (int) parseLong(query.get("maxPoints"), 0);
        ActivityTracker.MovementDto movement = statsService.activityTracker().movement(player, maxPoints);
        send(exchange, 200, "application/json", GSON.toJson(movement));
    }

    private Map<String, String> parseQuery(final HttpExchange exchange) {
        Map<String, String> out = new HashMap<>();
        String raw = exchange.getRequestURI().getRawQuery();
        if (raw == null || raw.isBlank()) {
            return out;
        }
        for (String pair : raw.split("&")) {
            int eq = pair.indexOf('=');
            if (eq < 0) {
                out.put(urlDecode(pair), "");
            } else {
                out.put(urlDecode(pair.substring(0, eq)), urlDecode(pair.substring(eq + 1)));
            }
        }
        return out;
    }

    private static String urlDecode(final String value) {
        return java.net.URLDecoder.decode(value, StandardCharsets.UTF_8);
    }

    private static long parseLong(final String value, final long fallback) {
        if (value == null || value.isBlank()) {
            return fallback;
        }
        try {
            return Long.parseLong(value.trim());
        } catch (NumberFormatException exception) {
            return fallback;
        }
    }

    private static final class EventsResponse {
        long latestSeq;
        List<GameEvent> events;
    }

    private static final class ActivityResponse {
        String generatedAt;
        List<ActivityTracker.PlayerActivityDto> players;
    }

    private void send(final HttpExchange exchange, final int status, final String contentType, final String body) throws IOException {
        send(exchange, status, contentType + "; charset=utf-8", body.getBytes(StandardCharsets.UTF_8));
    }

    private void send(final HttpExchange exchange, final int status, final String contentType, byte[] bytes) throws IOException {
        if (exchange.getRequestHeaders().getFirst("Accept-Encoding") != null
            && exchange.getRequestHeaders().getFirst("Accept-Encoding").contains("gzip")) {
            ByteArrayOutputStream compressed = new ByteArrayOutputStream();
            try (GZIPOutputStream gzip = new GZIPOutputStream(compressed)) {
                gzip.write(bytes);
            }
            bytes = compressed.toByteArray();
            exchange.getResponseHeaders().set("Content-Encoding", "gzip");
            exchange.getResponseHeaders().set("Vary", "Accept-Encoding");
        }
        exchange.getResponseHeaders().set("Content-Type", contentType);
        exchange.getResponseHeaders().set("Cache-Control", "no-store");
        exchange.getResponseHeaders().set("Content-Security-Policy", "default-src 'none'; connect-src 'self'; img-src 'self' data:; script-src 'unsafe-inline'; style-src 'unsafe-inline'; frame-ancestors 'none'");
        exchange.getResponseHeaders().set("Referrer-Policy", "no-referrer");
        exchange.getResponseHeaders().set("X-Content-Type-Options", "nosniff");
        exchange.sendResponseHeaders(status, bytes.length);
        try (OutputStream stream = exchange.getResponseBody()) {
            stream.write(bytes);
        }
    }

    private static volatile String cachedIndexHtml;

    private String indexHtml() {
        String cached = cachedIndexHtml;
        if (cached != null) {
            return cached;
        }
        try (InputStream stream = StatsWebServer.class.getResourceAsStream("/assets/lustats/index.html")) {
            if (stream == null) {
                return "<!doctype html><title>Lu-Stats</title><p>Dashboard resource missing.</p>";
            }
            cached = new String(stream.readAllBytes(), StandardCharsets.UTF_8);
            cachedIndexHtml = cached;
            return cached;
        } catch (IOException exception) {
            LuStatsMod.LOGGER.error("Failed to load Lu-Stats dashboard page.", exception);
            return "<!doctype html><title>Lu-Stats</title><p>Failed to load dashboard. Check the server log.</p>";
        }
    }
}
