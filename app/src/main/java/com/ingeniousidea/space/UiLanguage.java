package com.ingeniousidea.space;

import android.content.Context;
import org.json.JSONObject;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.Map;

/** Single cached source for user-visible English UI wording used by native code. */
public final class UiLanguage {
    private static final Object LOCK = new Object();
    private static volatile JSONObject cached;

    private UiLanguage() {}

    private static JSONObject data(Context context) {
        JSONObject ready = cached;
        if (ready != null) return ready;
        synchronized (LOCK) {
            if (cached != null) return cached;
            JSONObject loaded = new JSONObject();
            if (context != null) {
                try (InputStream input = context.getAssets().open("language/english.json");
                     ByteArrayOutputStream out = new ByteArrayOutputStream()) {
                    byte[] buffer = new byte[4096];
                    int read;
                    while ((read = input.read(buffer)) != -1) out.write(buffer, 0, read);
                    loaded = new JSONObject(new String(out.toByteArray(), StandardCharsets.UTF_8));
                } catch (Exception ignored) { }
            }
            cached = loaded;
            return loaded;
        }
    }

    public static String text(Context context, String key) {
        return text(context, key, key);
    }

    public static String text(Context context, String key, String fallback) {
        Object value = valueAtPath(data(context), key);
        if (value instanceof String && !((String) value).trim().isEmpty()) return (String) value;
        return fallback == null ? "" : fallback;
    }

    public static long longValue(Context context, String key, long fallback) {
        Object value = valueAtPath(data(context), key);
        return value instanceof Number ? ((Number) value).longValue() : fallback;
    }

    public static String format(Context context, String key, Map<String, ?> values) {
        String result = text(context, key, key);
        if (values == null) return result;
        for (Map.Entry<String, ?> entry : values.entrySet()) {
            Object value = entry.getValue();
            result = result.replace("{" + entry.getKey() + "}", value == null ? "" : String.valueOf(value));
        }
        return result;
    }

    public static String format(Context context, String key, String variable, Object value) {
        return text(context, key, key).replace("{" + variable + "}", value == null ? "" : String.valueOf(value));
    }

    private static Object valueAtPath(JSONObject root, String path) {
        if (root == null || path == null || path.isEmpty()) return null;
        Object current = root;
        for (String part : path.split("\\.")) {
            if (!(current instanceof JSONObject)) return null;
            JSONObject object = (JSONObject) current;
            if (!object.has(part)) return null;
            current = object.opt(part);
        }
        return current;
    }
}
