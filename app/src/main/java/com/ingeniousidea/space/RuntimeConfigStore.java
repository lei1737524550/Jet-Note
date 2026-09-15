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
 * Runtime values are user data, while the bundled config defines the current
 * schema. On every read/save, the current APK schema is projected over the
 * user's values: existing fields keep the user's value, newly bundled fields
 * receive their bundled default, and fields removed by the APK disappear.
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
        try {
            JSONObject bundled = new JSONObject(readBundled(context));
            SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
            String runtimeText = prefs.getString(CURRENT, null);
            JSONObject effective = bundled;
            if (runtimeText != null && !runtimeText.trim().isEmpty()) {
                try {
                    effective = mergeUserValuesIntoBundledSchema(bundled, new JSONObject(runtimeText));
                } catch (Exception ignored) {
                    effective = bundled;
                }
            }
            String normalized = effective.toString(2);
            String bundledFingerprint = fingerprint(bundled.toString());
            // Persist the migrated form so removed fields do not survive forever and
            // newly added defaults become part of the user's next export.
            prefs.edit()
                    .putString(CURRENT, normalized)
                    .putString(BUNDLED_FINGERPRINT, bundledFingerprint)
                    .apply();
            return normalized;
        } catch (Exception error) {
            return "{}";
        }
    }

    static synchronized boolean saveRuntime(Context context, String json) {
        try {
            JSONObject bundled = new JSONObject(readBundled(context));
            JSONObject incoming = new JSONObject(json);
            JSONObject merged = mergeUserValuesIntoBundledSchema(bundled, incoming);
            String current = readEffective(context);
            String bundledFingerprint = fingerprint(bundled.toString());
            SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
            return prefs.edit()
                    .putString(PREVIOUS, current)
                    .putString(CURRENT, merged.toString(2))
                    .putString(BUNDLED_FINGERPRINT, bundledFingerprint)
                    .commit();
        } catch (Exception error) {
            return false;
        }
    }

    /**
     * The bundled object owns field existence, structure AND field order. User values
     * own only the value of fields that still exist. Objects are projected recursively
     * in bundled-key order; arrays and scalar values are preserved as complete user
     * values. This means an APK update may reorganize config.json without resetting
     * the user's surviving custom values.
     */
    private static JSONObject mergeUserValuesIntoBundledSchema(JSONObject bundled, JSONObject user) throws Exception {
        JSONObject result = new JSONObject();
        java.util.Iterator<String> keys = bundled.keys();
        while (keys.hasNext()) {
            String key = keys.next();
            Object bundledValue = bundled.get(key);
            if (!user.has(key)) {
                result.put(key, bundledValue);
                continue;
            }
            Object userValue = user.get(key);
            if (bundledValue instanceof JSONObject && userValue instanceof JSONObject) {
                result.put(key, mergeUserValuesIntoBundledSchema((JSONObject) bundledValue, (JSONObject) userValue));
            } else {
                result.put(key, userValue);
            }
        }
        return result;
    }

    static synchronized boolean undoRuntime(Context context) {
        // Synchronize the runtime state with the currently bundled config before
        // using PREVIOUS. An APK update may have invalidated both saved values.
        readEffective(context);
        SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        String previous = prefs.getString(PREVIOUS, null);
        if (previous == null) return false;
        try {
            JSONObject bundled = new JSONObject(readBundled(context));
            JSONObject previousObject = new JSONObject(previous);
            // PREVIOUS may have been written by an older APK. Re-project it through
            // the current bundled schema so Undo cannot restore obsolete key order,
            // removed fields, or omit newly introduced fields.
            String migratedPrevious = mergeUserValuesIntoBundledSchema(bundled, previousObject).toString(2);
            String current = prefs.getString(CURRENT, null);
            String migratedCurrent = current;
            if (current != null) {
                try {
                    migratedCurrent = mergeUserValuesIntoBundledSchema(bundled, new JSONObject(current)).toString(2);
                } catch (Exception ignored) {
                    migratedCurrent = readEffective(context);
                }
            }
            SharedPreferences.Editor edit = prefs.edit().putString(CURRENT, migratedPrevious);
            if (migratedCurrent != null) edit.putString(PREVIOUS, migratedCurrent);
            else edit.remove(PREVIOUS);
            return edit.commit();
        } catch (Exception error) {
            return false;
        }
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
