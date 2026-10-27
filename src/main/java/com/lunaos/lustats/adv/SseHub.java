package com.lunaos.lustats.adv;

import com.lunaos.lustats.LuStatsMod;
import com.sun.net.httpserver.HttpExchange;

import java.io.IOException;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.Set;
import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * Minimal Server-Sent Events hub for the dashboard's live updates. One blocking
 * serve loop per connection (runs on the web server's cached executor), a
 * per-connection queue, 20s keepalive pings, and per-IP + global client caps.
 */
public final class SseHub {
    private static final int MAX_CLIENTS = 500;
    private static final String STOP = "\u0000stop";

    private static final class Client {
        final ArrayBlockingQueue<String> queue = new ArrayBlockingQueue<>(256);
        final String ip;
        volatile boolean dead;

        Client(final String ip) {
            this.ip = ip;
        }
    }

    private final Set<Client> clients = ConcurrentHashMap.newKeySet();
    private final ConcurrentHashMap<String, AtomicInteger> perIp = new ConcurrentHashMap<>();
    private final int maxPerIp;
    private volatile boolean running = true;

    public SseHub(final int maxPerIp) {
        this.maxPerIp = Math.max(1, maxPerIp);
    }

    public int clientCount() {
        return clients.size();
    }

    public void serve(final HttpExchange exchange, final long version) throws IOException {
        if (!running || clients.size() >= MAX_CLIENTS) {
            byte[] body = "{\"error\":\"Zu viele Live-Verbindungen\"}".getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().set("Retry-After", "30");
            exchange.getResponseHeaders().set("Content-Type", "application/json; charset=utf-8");
            exchange.sendResponseHeaders(429, body.length);
            try (OutputStream os = exchange.getResponseBody()) {
                os.write(body);
            }
            return;
        }

        String ip = exchange.getRemoteAddress() != null ? exchange.getRemoteAddress().getAddress().getHostAddress() : "?";
        AtomicInteger count = perIp.computeIfAbsent(ip, key -> new AtomicInteger());
        if (count.incrementAndGet() > maxPerIp) {
            count.decrementAndGet();
            byte[] body = "{\"error\":\"Zu viele Live-Verbindungen\"}".getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().set("Retry-After", "30");
            exchange.getResponseHeaders().set("Content-Type", "application/json; charset=utf-8");
            exchange.sendResponseHeaders(429, body.length);
            try (OutputStream os = exchange.getResponseBody()) {
                os.write(body);
            }
            return;
        }

        Client client = new Client(ip);
        clients.add(client);
        exchange.getResponseHeaders().set("Content-Type", "text/event-stream; charset=utf-8");
        exchange.getResponseHeaders().set("Cache-Control", "no-cache, no-transform");
        exchange.getResponseHeaders().set("X-Accel-Buffering", "no");
        exchange.sendResponseHeaders(200, 0);
        try (OutputStream out = exchange.getResponseBody()) {
            write(out, "retry: 3000\n\nevent: hello\ndata: {\"version\":" + version + "}\n\n");
            while (running && !client.dead) {
                String frame = client.queue.poll(20, TimeUnit.SECONDS);
                if (frame == null) {
                    write(out, ": ping\n\n");
                } else if (frame.equals(STOP)) {
                    break;
                } else {
                    write(out, frame);
                }
            }
        } catch (Exception ignored) {
            // client went away
        } finally {
            clients.remove(client);
            AtomicInteger c = perIp.get(ip);
            if (c != null && c.decrementAndGet() <= 0) {
                perIp.remove(ip, c);
            }
        }
    }

    public void broadcast(final String type, final String jsonData) {
        if (!running) {
            return;
        }
        String frame = "event: " + type + "\ndata: " + jsonData + "\n\n";
        for (Client client : clients) {
            if (!client.queue.offer(frame)) {
                client.dead = true;
                client.queue.clear();
                client.queue.offer(STOP);
            }
        }
    }

    public void stop() {
        running = false;
        for (Client client : clients) {
            client.dead = true;
            client.queue.offer(STOP);
        }
    }

    private static void write(final OutputStream out, final String text) throws IOException {
        out.write(text.getBytes(StandardCharsets.UTF_8));
        out.flush();
    }
}
