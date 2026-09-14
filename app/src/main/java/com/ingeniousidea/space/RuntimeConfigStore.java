package com.ingeniousidea.space;

import android.content.Context;
import android.content.SharedPreferences;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;

/**
 * Single source of truth for Jet Note's bundled config.json and the optional
 * in-app runtime/debug override.
 *
 * A runtime override belongs to the bundled config version it was created
 * from. If a newly installed APK contains a different config.json, the old
 * override is discarded automatically so stale SharedPreferences cannot mask
 * source edits made to config.json.
 */
final class RuntimeConfigStore {
    static final String PREFS = "jet_note_debug_config";
    static final String CURRENT = "current";
    static final String PREVIOUS = "previous";
    private static final String BUNDLED_FINGERPRINT = "bundled_fingerprint_sha256";

    private RuntimeConfigStore() { }

    static String readBundled(Context context) throws Exception {
        try (InputStream in = context.getAssets().open("config.json")) {
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            byte[] buffer = new byte[8192];
            int count;
            while ((count = in.read(buffer)) != -1) out.write(buffer, 0, count);
            return out.toString(StandardCharsets.UTF_8.name());
        }
    }

    static synchronized String readEffective(Context context) {
        String bundled;
        try {
            bundled = readBundled(context);
            new JSONObject(bundled);
        } catch (Exception error) {
            bundled = "{}";
        }

        String bundledFingerprint = fingerprint(bundled);
        SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        String runtime = prefs.getString(CURRENT, null);
        String recordedFingerprint = prefs.getString(BUNDLED_FINGERPRINT, null);

        if (runtime != null && !runtime.trim().isEmpty()) {
            try {
                new JSONObject(runtime);

                if (recordedFingerprint == null) {
                    // Compatibility with builds created before fingerprint tracking.
                    // setRuntimeConfigJson used to save the pre-edit effective config
                    // into PREVIOUS, so matching PREVIOUS proves this runtime override
                    // was created from the currently bundled config.
                    String previous = prefs.getString(PREVIOUS, null);
                    if (previous != null && fingerprint(previous).equals(bundledFingerprint)) {
                        prefs.edit().putString(BUNDLED_FINGERPRINT, bundledFingerprint).apply();
                        return runtime;
                    }

                    clearStaleOverride(prefs, bundledFingerprint);
                    return bundled;
                }

                if (!recordedFingerprint.equals(bundledFingerprint)) {
                    clearStaleOverride(prefs, bundledFingerprint);
                    return bundled;
                }

                return runtime;
            } catch (Exception invalidRuntimeConfiguration) {
                clearStaleOverride(prefs, bundledFingerprint);
                return bundled;
            }
        }

        if (!bundledFingerprint.equals(recordedFingerprint)) {
            prefs.edit().putString(BUNDLED_FINGERPRINT, bundledFingerprint).apply();
        }
        return bundled;
    }

    static synchronized boolean saveRuntime(Context context, String json) {
        try {
            JSONObject parsed = new JSONObject(json);
            String normalized = parsed.toString(2);
            String bundled = readBundled(context);
            new JSONObject(bundled);
            String bundledFingerprint = fingerprint(bundled);

            // readEffective first so a stale override from an older APK can never
            // become PREVIOUS for a new runtime edit.
            String current = readEffective(context);
            SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
            return prefs.edit()
                    .putString(PREVIOUS, current)
                    .putString(CURRENT, normalized)
                    .putString(BUNDLED_FINGERPRINT, bundledFingerprint)
                    .commit();
        } catch (Exception error) {
            return false;
        }
    }

    static synchronized boolean undoRuntime(Context context) {
        // Synchronize the runtime state with the currently bundled config before
        // using PREVIOUS. An APK update may have invalidated both saved values.
        readEffective(context);
        SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        String previous = prefs.getString(PREVIOUS, null);
        if (previous == null) return false;
        try {
            new JSONObject(previous);
            String current = prefs.getString(CURRENT, null);
            SharedPreferences.Editor edit = prefs.edit().putString(CURRENT, previous);
            if (current != null) edit.putString(PREVIOUS, current);
            else edit.remove(PREVIOUS);
            return edit.commit();
        } catch (Exception error) {
            return false;
        }
    }

    private static void clearStaleOverride(SharedPreferences prefs, String bundledFingerprint) {
        prefs.edit()
                .remove(CURRENT)
                .remove(PREVIOUS)
                .putString(BUNDLED_FINGERPRINT, bundledFingerprint)
                .apply();
    }

    private static String fingerprint(String text) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] bytes = digest.digest(text.getBytes(StandardCharsets.UTF_8));
            StringBuilder value = new StringBuilder(bytes.length * 2);
            for (byte b : bytes) value.append(String.format("%02x", b & 0xff));
            return value.toString();
        } catch (Exception error) {
            // SHA-256 is guaranteed by the Java/Android runtime. This fallback only
            // keeps the configuration path usable on a severely broken runtime.
            return Integer.toHexString(text.hashCode());
        }
    }
}
