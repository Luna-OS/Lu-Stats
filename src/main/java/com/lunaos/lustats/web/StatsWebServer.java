package com.lunaos.lustats.web;

import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import com.lunaos.lustats.LuStatsMod;
import com.lunaos.lustats.adv.AdvancementSystem;
import com.lunaos.lustats.config.LuStatsConfig;
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
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.util.Enumeration;
import java.util.HashMap;
import java.util.Map;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.function.Supplier;
import java.util.zip.GZIPOutputStream;

/**
 * Serves the BACAP-style dashboard: the static {@code /web} single-page app plus
 * the advancement JSON API, a player-head proxy and a live SSE stream. Player
 * data is built on the server thread; heads and SSE run on the web executor.
 */
public final class StatsWebServer {
    private static final Gson GSON = new GsonBuilder().disableHtmlEscaping().create();
    private static final String CSP =
        "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; "
        + "img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; "
        + "frame-ancestors 'none'; base-uri 'none'; form-action 'none'; object-src 'none'";

    private final MinecraftServer minecraftServer;
    private final AdvancementSystem adv;
    private final LuStatsConfig config;

    private HttpServer httpServer;
    private ExecutorService executor;
    private String address = "disabled";

    public StatsWebServer(final MinecraftServer minecraftServer, final AdvancementSystem adv, final LuStatsConfig config) {
        this.minecraftServer = minecraftServer;
        this.adv = adv;
        this.config = config;
    }

    public void start() {
        try {
            InetAddress bindAddress = InetAddress.getByName(config.web.bindAddress);
            InetSocketAddress socketAddress = new InetSocketAddress(bindAddress, config.web.port);
            httpServer = HttpServer.create(socketAddress, 0);
            httpServer.createContext("/", this::handleRoot);
            httpServer.createContext("/api/info", this::handleInfo);
            httpServer.createContext("/api/advancements", this::handleAdvancements);
            httpServer.createContext("/api/players", this::handlePlayers);
            httpServer.createContext("/api/player", this::handlePlayer);
            httpServer.createContext("/api/advancement", this::handleAdvancement);
            httpServer.createContext("/api/events", this::handleEvents);
            httpServer.createContext("/api/head", this::handleHead);
            executor = Executors.newCachedThreadPool(runnable -> {
                Thread thread = new Thread(runnable, "LuStats Web");
                thread.setDaemon(true);
                return thread;
            });
            httpServer.setExecutor(executor);
            httpServer.start();
            address = displayAddress();
            LuStatsMod.LOGGER.info("Lu-Stats web dashboard listening on {}:{}; open {}",
                config.web.bindAddress, config.web.port, address);
        } catch (IOException exception) {
            LuStatsMod.LOGGER.error("Failed to start Lu-Stats web dashboard on {}:{}.",
                config.web.bindAddress, config.web.port, exception);
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
            LuStatsMod.LOGGER.info("Lu-Stats web dashboard stopped.");
        }
    }

    public boolean isRunning() {
        return httpServer != null;
    }

    public String address() {
        return address;
    }

    // ---- static assets + SPA ----

    private void handleRoot(final HttpExchange exchange) throws IOException {
        if (!isRead(exchange)) {
            methodNotAllowed(exchange);
            return;
        }
        String path = exchange.getRequestURI().getPath();
        if (path == null || path.equals("/")) {
            serveAsset(exchange, "index.html");
            return;
        }
        if (path.contains("..")) {
            sendText(exchange, 400, "Bad request");
            return;
        }
        String resource = path.startsWith("/") ? path.substring(1) : path;
        if (hasAsset(resource)) {
            serveAsset(exchange, resource);
            return;
        }
        // SPA fallback: unknown non-API path -> index.html (client router handles it).
        serveAsset(exchange, "index.html");
    }

    private boolean hasAsset(final String resource) {
        try (InputStream stream = StatsWebServer.class.getResourceAsStream("/web/" + resource)) {
            return stream != null;
        } catch (IOException exception) {
            return false;
        }
    }

    private void serveAsset(final HttpExchange exchange, final String resource) throws IOException {
        try (InputStream stream = StatsWebServer.class.getResourceAsStream("/web/" + resource)) {
            if (stream == null) {
                sendText(exchange, 404, "Nicht gefunden");
                return;
            }
            byte[] bytes = stream.readAllBytes();
            String cache = resource.startsWith("fonts/") ? "public, max-age=604800" : "no-cache";
            send(exchange, 200, contentType(resource), bytes, cache);
        }
    }

    private static String contentType(final String resource) {
        String lower = resource.toLowerCase();
        if (lower.endsWith(".html")) return "text/html; charset=utf-8";
        if (lower.endsWith(".css")) return "text/css; charset=utf-8";
        if (lower.endsWith(".js")) return "text/javascript; charset=utf-8";
        if (lower.endsWith(".svg")) return "image/svg+xml";
        if (lower.endsWith(".otf")) return "font/otf";
        if (lower.endsWith(".ttf")) return "font/ttf";
        if (lower.endsWith(".png")) return "image/png";
        if (lower.endsWith(".txt")) return "text/plain; charset=utf-8";
        if (lower.endsWith(".json")) return "application/json; charset=utf-8";
        return "application/octet-stream";
    }

    // ---- JSON API ----

    private void handleInfo(final HttpExchange exchange) throws IOException {
        if (!isRead(exchange)) {
            methodNotAllowed(exchange);
            return;
        }
        sendJson(exchange, 200, GSON.toJson(adv.info()));
    }

    private void handleAdvancements(final HttpExchange exchange) throws IOException {
        if (!isRead(exchange)) {
            methodNotAllowed(exchange);
            return;
        }
        sendJson(exchange, 200, GSON.toJson(adv.index()));
    }

    private void handlePlayers(final HttpExchange exchange) throws IOException {
        if (!isRead(exchange)) {
            methodNotAllowed(exchange);
            return;
        }
        String json = onServer(() -> GSON.toJson(adv.players()));
        if (json == null) {
            sendJson(exchange, 500, "{\"error\":\"Interner Fehler\"}");
        } else {
            sendJson(exchange, 200, json);
        }
    }

    private void handlePlayer(final HttpExchange exchange) throws IOException {
        if (!isRead(exchange)) {
            methodNotAllowed(exchange);
            return;
        }
        String name = query(exchange).get("name");
        if (name == null || name.isBlank()) {
            sendJson(exchange, 400, "{\"error\":\"name fehlt\"}");
            return;
        }
        String json = onServer(() -> {
            var detail = adv.player(name);
            return detail == null ? null : GSON.toJson(detail);
        });
        if (json == null) {
            sendJson(exchange, 404, "{\"error\":\"Spieler nicht gefunden oder ausgeblendet\"}");
        } else {
            sendJson(exchange, 200, json);
        }
    }

    private void handleAdvancement(final HttpExchange exchange) throws IOException {
        if (!isRead(exchange)) {
            methodNotAllowed(exchange);
            return;
        }
        String id = query(exchange).get("id");
        if (id == null || id.isBlank()) {
            sendJson(exchange, 400, "{\"error\":\"id fehlt\"}");
            return;
        }
        String json = onServer(() -> {
            var detail = adv.advancement(id);
            return detail == null ? null : GSON.toJson(detail);
        });
        if (json == null) {
            sendJson(exchange, 404, "{\"error\":\"Advancement nicht gefunden\"}");
        } else {
            sendJson(exchange, 200, json);
        }
    }

    private void handleEvents(final HttpExchange exchange) throws IOException {
        if (!isRead(exchange)) {
            methodNotAllowed(exchange);
            return;
        }
        if (!adv.live()) {
            sendJson(exchange, 404, "{\"error\":\"Live-Updates sind ausgeschaltet\"}");
            return;
        }
        if ("HEAD".equalsIgnoreCase(exchange.getRequestMethod())) {
            applySecurity(exchange);
            exchange.sendResponseHeaders(200, -1);
            exchange.close();
            return;
        }
        applySecurity(exchange);
        adv.sse().serve(exchange, adv.index().version);
    }

    private void handleHead(final HttpExchange exchange) throws IOException {
        if (!isRead(exchange)) {
            methodNotAllowed(exchange);
            return;
        }
        Map<String, String> q = query(exchange);
        String name = q.getOrDefault("name", q.get("player"));
        if (name == null || name.isBlank()) {
            sendText(exchange, 400, "name fehlt");
            return;
        }
        byte[] png = adv.head(name);
        send(exchange, 200, "image/png", png, "public, max-age=600");
    }

    // ---- helpers ----

    private <T> T onServer(final Supplier<T> supplier) {
        CompletableFuture<T> future = new CompletableFuture<>();
        minecraftServer.execute(() -> {
            try {
                future.complete(supplier.get());
            } catch (Exception exception) {
                future.completeExceptionally(exception);
            }
        });
        try {
            return future.get(config.web.requestTimeoutSeconds, TimeUnit.SECONDS);
        } catch (Exception exception) {
            LuStatsMod.LOGGER.warn("Lu-Stats web request failed.", exception);
            return null;
        }
    }

    private Map<String, String> query(final HttpExchange exchange) {
        Map<String, String> out = new HashMap<>();
        String raw = exchange.getRequestURI().getRawQuery();
        if (raw == null || raw.isBlank()) {
            return out;
        }
        for (String pair : raw.split("&")) {
            int eq = pair.indexOf('=');
            if (eq < 0) {
                out.put(decode(pair), "");
            } else {
                out.put(decode(pair.substring(0, eq)), decode(pair.substring(eq + 1)));
            }
        }
        return out;
    }

    private static String decode(final String value) {
        return URLDecoder.decode(value, StandardCharsets.UTF_8);
    }

    private static boolean isRead(final HttpExchange exchange) {
        String method = exchange.getRequestMethod();
        return "GET".equalsIgnoreCase(method) || "HEAD".equalsIgnoreCase(method);
    }

    private void methodNotAllowed(final HttpExchange exchange) throws IOException {
        exchange.getResponseHeaders().set("Allow", "GET, HEAD");
        sendJson(exchange, 405, "{\"error\":\"Nur GET erlaubt\"}");
    }

    private void applySecurity(final HttpExchange exchange) {
        exchange.getResponseHeaders().set("X-Content-Type-Options", "nosniff");
        exchange.getResponseHeaders().set("Referrer-Policy", "no-referrer");
        exchange.getResponseHeaders().set("X-Frame-Options", "DENY");
        exchange.getResponseHeaders().set("Content-Security-Policy", CSP);
    }

    private void sendJson(final HttpExchange exchange, final int status, final String body) throws IOException {
        send(exchange, status, "application/json; charset=utf-8", body.getBytes(StandardCharsets.UTF_8), "no-store");
    }

    private void sendText(final HttpExchange exchange, final int status, final String body) throws IOException {
        send(exchange, status, "text/plain; charset=utf-8", body.getBytes(StandardCharsets.UTF_8), "no-store");
    }

    private void send(final HttpExchange exchange, final int status, final String contentType,
                      byte[] bytes, final String cacheControl) throws IOException {
        applySecurity(exchange);
        exchange.getResponseHeaders().set("Content-Type", contentType);
        exchange.getResponseHeaders().set("Cache-Control", cacheControl);
        boolean head = "HEAD".equalsIgnoreCase(exchange.getRequestMethod());

        String acceptEncoding = exchange.getRequestHeaders().getFirst("Accept-Encoding");
        boolean gzip = !head && acceptEncoding != null && acceptEncoding.contains("gzip") && gzipable(contentType);
        if (gzip) {
            ByteArrayOutputStream compressed = new ByteArrayOutputStream();
            try (GZIPOutputStream out = new GZIPOutputStream(compressed)) {
                out.write(bytes);
            }
            bytes = compressed.toByteArray();
            exchange.getResponseHeaders().set("Content-Encoding", "gzip");
            exchange.getResponseHeaders().set("Vary", "Accept-Encoding");
        }

        if (head) {
            exchange.sendResponseHeaders(status, -1);
            exchange.close();
            return;
        }
        exchange.sendResponseHeaders(status, bytes.length);
        try (OutputStream stream = exchange.getResponseBody()) {
            stream.write(bytes);
        }
    }

    private static boolean gzipable(final String contentType) {
        return contentType.startsWith("text/") || contentType.contains("json")
            || contentType.contains("javascript") || contentType.contains("svg") || contentType.contains("font");
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
                    InetAddress candidate = addresses.nextElement();
                    if (!(candidate instanceof Inet4Address)
                        || candidate.isLoopbackAddress()
                        || candidate.isAnyLocalAddress()
                        || candidate.isMulticastAddress()
                        || candidate.isLinkLocalAddress()) {
                        continue;
                    }
                    if (candidate.isSiteLocalAddress()) {
                        return candidate.getHostAddress();
                    }
                    if (fallback == null) {
                        fallback = candidate.getHostAddress();
                    }
                }
            }
            if (fallback != null) {
                return fallback;
            }
        } catch (Exception exception) {
            LuStatsMod.LOGGER.debug("Failed to detect local Lu-Stats dashboard address.", exception);
        }
        return "localhost";
    }
}
