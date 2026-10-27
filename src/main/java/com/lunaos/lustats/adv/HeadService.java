package com.lunaos.lustats.adv;

import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import com.lunaos.lustats.LuStatsMod;
import com.mojang.authlib.GameProfile;
import com.mojang.authlib.properties.Property;
import net.minecraft.server.MinecraftServer;
import net.minecraft.server.level.ServerPlayer;

import javax.imageio.ImageIO;
import java.awt.Graphics2D;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.util.Collection;
import java.util.Locale;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Resolves a player's real skin head server-side and serves it as a PNG, so the
 * dashboard can show current skins while keeping the strict same-origin CSP
 * (img-src 'self'). Resolution: online player's texture property, else a
 * name lookup via the profile resolver (works on offline-mode servers too).
 * Results are cached; a deterministic generated head is the fallback.
 */
public final class HeadService {
    private static final int OUT = 64;
    private static final long OK_TTL = 15 * 60_000L;
    private static final long FAIL_TTL = 60_000L;

    private record Cached(byte[] png, long expires) {
    }

    private final ConcurrentHashMap<String, Cached> cache = new ConcurrentHashMap<>();

    public byte[] head(final MinecraftServer server, final String rawName) {
        String name = rawName == null ? "" : rawName.trim();
        String key = name.toLowerCase(Locale.ROOT);
        Cached cached = cache.get(key);
        long now = System.currentTimeMillis();
        if (cached != null && cached.expires > now) {
            return cached.png;
        }

        byte[] png = null;
        try {
            String url = resolveSkinUrl(server, name);
            if (url != null) {
                BufferedImage skin = download(url);
                if (skin != null) {
                    png = toPng(cropHead(skin));
                }
            }
        } catch (Exception exception) {
            LuStatsMod.LOGGER.debug("Head resolve failed for {}: {}", name, exception.toString());
        }

        boolean ok = png != null;
        if (!ok) {
            png = toPng(generated(name));
        }
        cache.put(key, new Cached(png, now + (ok ? OK_TTL : FAIL_TTL)));
        return png;
    }

    private String resolveSkinUrl(final MinecraftServer server, final String name) {
        GameProfile profile = null;
        ServerPlayer online = server.getPlayerList().getPlayerByName(name);
        if (online != null) {
            profile = online.getGameProfile();
            String fromOnline = urlFromProfile(profile);
            if (fromOnline != null) {
                return fromOnline;
            }
        }
        try {
            Optional<GameProfile> resolved = server.services().profileResolver().fetchByName(name);
            if (resolved.isPresent()) {
                return urlFromProfile(resolved.get());
            }
        } catch (Exception exception) {
            LuStatsMod.LOGGER.debug("profileResolver failed for {}: {}", name, exception.toString());
        }
        return null;
    }

    private String urlFromProfile(final GameProfile profile) {
        if (profile == null) {
            return null;
        }
        try {
            Collection<Property> textures = profile.properties().get("textures");
            if (textures.isEmpty()) {
                return null;
            }
            Property property = textures.iterator().next();
            String json = new String(Base64.getDecoder().decode(property.value()), StandardCharsets.UTF_8);
            JsonObject root = JsonParser.parseString(json).getAsJsonObject();
            JsonObject tex = root.getAsJsonObject("textures");
            if (tex == null || !tex.has("SKIN")) {
                return null;
            }
            JsonObject skin = tex.getAsJsonObject("SKIN");
            return skin.has("url") ? skin.get("url").getAsString() : null;
        } catch (Exception exception) {
            return null;
        }
    }

    private BufferedImage download(final String url) {
        try {
            HttpURLConnection connection = (HttpURLConnection) URI.create(url).toURL().openConnection();
            connection.setConnectTimeout(4000);
            connection.setReadTimeout(4000);
            connection.setRequestProperty("User-Agent", "Lu-Stats");
            try (InputStream stream = connection.getInputStream()) {
                return ImageIO.read(stream);
            }
        } catch (Exception exception) {
            return null;
        }
    }

    private BufferedImage cropHead(final BufferedImage skin) {
        BufferedImage head = new BufferedImage(OUT, OUT, BufferedImage.TYPE_INT_ARGB);
        Graphics2D g = head.createGraphics();
        // Base face 8x8 at (8,8).
        g.drawImage(skin, 0, 0, OUT, OUT, 8, 8, 16, 16, null);
        // Hat/overlay 8x8 at (40,8), composited on top if present.
        if (skin.getWidth() >= 48 && skin.getHeight() >= 16) {
            g.drawImage(skin, 0, 0, OUT, OUT, 40, 8, 48, 16, null);
        }
        g.dispose();
        return head;
    }

    /** Deterministic fallback head when no skin can be resolved. */
    private BufferedImage generated(final String name) {
        BufferedImage image = new BufferedImage(OUT, OUT, BufferedImage.TYPE_INT_ARGB);
        int h = fnv(name.toLowerCase(Locale.ROOT));
        int[] skins = {0xf1c7a5, 0xe0ac84, 0xc68a63, 0xa46a46, 0x7d4a2f, 0x5a3522};
        int[] hairs = {0x2b1d10, 0x4a3320, 0x6b4a2a, 0x8a8a8a, 0x1a1a1a, 0xb8860b};
        int skin = skins[Math.floorMod(h, skins.length)] | 0xff000000;
        int hair = hairs[Math.floorMod(h >> 3, hairs.length)] | 0xff000000;
        int eye = 0xff202020;
        int cell = OUT / 8;
        int[][] face = new int[8][8];
        for (int[] row : face) {
            java.util.Arrays.fill(row, skin);
        }
        for (int x = 0; x < 8; x++) {
            face[0][x] = hair;
            face[1][x] = hair;
        }
        face[3][1] = hair;
        face[3][6] = hair;
        face[4][2] = eye;
        face[4][5] = eye;
        for (int y = 0; y < 8; y++) {
            for (int x = 0; x < 8; x++) {
                int argb = face[y][x];
                for (int dy = 0; dy < cell; dy++) {
                    for (int dx = 0; dx < cell; dx++) {
                        image.setRGB(x * cell + dx, y * cell + dy, argb);
                    }
                }
            }
        }
        return image;
    }

    private static int fnv(final String value) {
        int hash = 0x811c9dc5;
        for (int i = 0; i < value.length(); i++) {
            hash ^= value.charAt(i);
            hash *= 0x01000193;
        }
        return hash;
    }

    private byte[] toPng(final BufferedImage image) {
        try {
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            ImageIO.write(image, "png", out);
            return out.toByteArray();
        } catch (Exception exception) {
            return new byte[0];
        }
    }
}
