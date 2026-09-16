package com.ingeniousidea.space;

import android.content.Context;
import android.content.SharedPreferences;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

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
    private static final String CONFIG_STORAGE_VERSION = "config_storage_version";
    private static final int OVERRIDE_STORAGE_VERSION = 2;
    private static final String LEGACY_CURRENT_BACKUP = "legacy_current_v1_backup";

    private RuntimeConfigStore() { }

    private static JSONObject readAssetObject(Context context, String path) throws Exception {
        try (InputStream in = context.getAssets().open(path)) {
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            byte[] buffer = new byte[8192];
            int count;
            while ((count = in.read(buffer)) != -1) out.write(buffer, 0, count);
            return new JSONObject(out.toString(StandardCharsets.UTF_8.name()));
        }
    }

    private static JSONObject deepMergeDisjoint(JSONObject left, JSONObject right) throws Exception {
        JSONObject result = new JSONObject(left.toString());
        java.util.Iterator<String> keys = right.keys();
        while (keys.hasNext()) {
            String key = keys.next();
            Object value = right.get(key);
            if (!result.has(key)) {
                result.put(key, value);
                continue;
            }
            Object existing = result.get(key);
            if (existing instanceof JSONObject && value instanceof JSONObject) {
                result.put(key, deepMergeDisjoint((JSONObject) existing, (JSONObject) value));
                continue;
            }
            throw new IllegalStateException("Duplicate config path while merging: " + key);
        }
        return result;
    }

    static List<String> listBundledSectionNames(Context context) throws Exception {
        String[] names = context.getAssets().list("config");
        List<String> result = new ArrayList<>();
        if (names != null) {
            for (String name : names) {
                if (name != null && name.endsWith(".json") && !name.contains("/") && !name.contains("\\")) {
                    result.add(name);
                }
            }
        }
        Collections.sort(result);
        // Keep the two historically central files easy to find in Debug mode.
        result.remove("config.json");
        result.remove("anim.json");
        result.add(0, "anim.json");
        result.add(0, "config.json");
        return result;
    }

    private static String normalizeSectionName(String section) {
        String name = section == null ? "" : section.trim();
        if (!name.endsWith(".json")) name += ".json";
        if (name.contains("/") || name.contains("\\") || name.contains("..")) return "";
        return name;
    }

    static String listBundledSectionsJson(Context context) {
        try {
            org.json.JSONArray array = new org.json.JSONArray();
            for (String name : listBundledSectionNames(context)) array.put(name);
            return array.toString();
        } catch (Exception error) {
            return "[]";
        }
    }

    static String readBundled(Context context) throws Exception {
        JSONObject merged = new JSONObject();
        for (String name : listBundledSectionNames(context)) {
            merged = deepMergeDisjoint(merged, readAssetObject(context, "config/" + name));
        }
        return merged.toString(2);
    }

    static String readEffectiveSection(Context context, String section) {
        try {
            String name = normalizeSectionName(section);
            if (name.isEmpty() || !listBundledSectionNames(context).contains(name)) return "{}";
            JSONObject schema = readAssetObject(context, "config/" + name);
            JSONObject effective = new JSONObject(readEffective(context));
            return projectExistingValues(schema, effective).toString(2);
        } catch (Exception error) {
            return "{}";
        }
    }

    static synchronized boolean saveRuntimeSection(Context context, String section, String json) {
        try {
            String name = normalizeSectionName(section);
            if (name.isEmpty() || !listBundledSectionNames(context).contains(name)) return false;
            JSONObject sectionSchema = readAssetObject(context, "config/" + name);
            JSONObject incoming = new JSONObject(json);
            // Missing fields mean "use bundled default". Full section snapshots and sparse
            // override sections are both accepted; saveRuntime() stores only the resulting diff.
            JSONObject validatedSection = mergeUserValuesIntoBundledSchema(sectionSchema, incoming);
            JSONObject effective = new JSONObject(readEffective(context));
            replaceSchemaPaths(effective, sectionSchema, validatedSection);
            return saveRuntime(context, effective.toString());
        } catch (Exception error) {
            return false;
        }
    }

    private static JSONObject projectExistingValues(JSONObject schema, JSONObject source) throws Exception {
        JSONObject result = new JSONObject();
        java.util.Iterator<String> keys = schema.keys();
        while (keys.hasNext()) {
            String key = keys.next();
            Object schemaValue = schema.get(key);
            Object sourceValue = source.has(key) ? source.get(key) : schemaValue;
            if (schemaValue instanceof JSONObject && sourceValue instanceof JSONObject) {
                result.put(key, projectExistingValues((JSONObject) schemaValue, (JSONObject) sourceValue));
            } else {
                result.put(key, sourceValue);
            }
        }
        return result;
    }

    private static void replaceSchemaPaths(JSONObject target, JSONObject schema, JSONObject values) throws Exception {
        java.util.Iterator<String> keys = schema.keys();
        while (keys.hasNext()) {
            String key = keys.next();
            Object schemaValue = schema.get(key);
            Object value = values.get(key);
            if (schemaValue instanceof JSONObject && value instanceof JSONObject) {
                JSONObject child = target.optJSONObject(key);
                if (child == null) {
                    child = new JSONObject();
                    target.put(key, child);
                }
                replaceSchemaPaths(child, (JSONObject) schemaValue, (JSONObject) value);
            } else {
                target.put(key, value);
            }
        }
    }

    /**
     * V2 storage model:
     *   effective = bundled defaults + explicit user overrides.
     * CURRENT stores overrides only. Reading never writes the effective snapshot back.
     */
    static synchronized String readEffective(Context context) {
        try {
            JSONObject bundled = new JSONObject(readBundled(context));
            SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
            ensureOverrideStorageV2(prefs, bundled);
            JSONObject overrides = readOverrides(prefs);
            return applyOverrides(bundled, overrides).toString(2);
        } catch (Exception error) {
            return "{}";
        }
    }

    /** Save a full effective document, but persist only values that differ from the APK defaults. */
    static synchronized boolean saveRuntime(Context context, String json) {
        try {
            JSONObject bundled = new JSONObject(readBundled(context));
            JSONObject incoming = mergeUserValuesIntoBundledSchema(bundled, new JSONObject(json));
            SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
            ensureOverrideStorageV2(prefs, bundled);
            JSONObject previousOverrides = readOverrides(prefs);
            JSONObject nextOverrides = diffFromBundled(bundled, incoming);
            return prefs.edit()
                    .putString(PREVIOUS, previousOverrides.toString(2))
                    .putString(CURRENT, nextOverrides.toString(2))
                    .putInt(CONFIG_STORAGE_VERSION, OVERRIDE_STORAGE_VERSION)
                    .putString(BUNDLED_FINGERPRINT, fingerprint(bundled.toString()))
                    .commit();
        } catch (Exception error) {
            return false;
        }
    }

    /** Return only explicit overrides belonging to one config section. Used by config-folder backup. */
    static synchronized String readOverrideSection(Context context, String section) {
        try {
            String name = normalizeSectionName(section);
            if (name.isEmpty() || !listBundledSectionNames(context).contains(name)) return "{}";
            JSONObject bundled = new JSONObject(readBundled(context));
            SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
            ensureOverrideStorageV2(prefs, bundled);
            JSONObject sectionSchema = readAssetObject(context, "config/" + name);
            return projectOverridesForSchema(sectionSchema, readOverrides(prefs)).toString(2);
        } catch (Exception error) {
            return "{}";
        }
    }

    private static JSONObject readOverrides(SharedPreferences prefs) {
        String text = prefs.getString(CURRENT, null);
        if (text == null || text.trim().isEmpty()) return new JSONObject();
        try { return new JSONObject(text); }
        catch (Exception ignored) { return new JSONObject(); }
    }

    /**
     * Legacy V1 CURRENT was a complete effective snapshot, so old APK defaults were
     * indistinguishable from deliberate edits. Carrying it forward would freeze every
     * old default forever. Preserve it as a safety backup, but start V2 with no overrides.
     * This migration changes config only; posts/media are untouched.
     */
    private static void ensureOverrideStorageV2(SharedPreferences prefs, JSONObject bundled) {
        if (prefs.getInt(CONFIG_STORAGE_VERSION, 1) >= OVERRIDE_STORAGE_VERSION) return;
        String legacy = prefs.getString(CURRENT, null);
        SharedPreferences.Editor edit = prefs.edit();
        if (legacy != null && !legacy.trim().isEmpty()) edit.putString(LEGACY_CURRENT_BACKUP, legacy);
        edit.putString(CURRENT, "{}")
                .remove(PREVIOUS)
                .putInt(CONFIG_STORAGE_VERSION, OVERRIDE_STORAGE_VERSION)
                .putString(BUNDLED_FINGERPRINT, fingerprint(bundled.toString()))
                .commit();
    }

    /**
     * Project an incoming effective document through the current bundled schema.
     * Unknown/removed keys are discarded, missing keys fall back to bundled defaults,
     * and nested objects are handled recursively.
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

    private static JSONObject applyOverrides(JSONObject bundled, JSONObject overrides) throws Exception {
        JSONObject result = new JSONObject();
        java.util.Iterator<String> keys = bundled.keys();
        while (keys.hasNext()) {
            String key = keys.next();
            Object base = bundled.get(key);
            if (!overrides.has(key)) { result.put(key, base); continue; }
            Object override = overrides.get(key);
            if (base instanceof JSONObject && override instanceof JSONObject) {
                result.put(key, applyOverrides((JSONObject) base, (JSONObject) override));
            } else {
                result.put(key, override);
            }
        }
        return result;
    }

    /** Compute the minimal recursive override object. Equal-to-default values disappear. */
    private static JSONObject diffFromBundled(JSONObject bundled, JSONObject effective) throws Exception {
        JSONObject result = new JSONObject();
        java.util.Iterator<String> keys = bundled.keys();
        while (keys.hasNext()) {
            String key = keys.next();
            Object base = bundled.get(key);
            Object value = effective.has(key) ? effective.get(key) : base;
            if (base instanceof JSONObject && value instanceof JSONObject) {
                JSONObject child = diffFromBundled((JSONObject) base, (JSONObject) value);
                if (child.length() > 0) result.put(key, child);
            } else if (!jsonValueEquals(base, value)) {
                result.put(key, value);
            }
        }
        return result;
    }

    private static boolean jsonValueEquals(Object a, Object b) {
        if (a == b) return true;
        if (a == null || b == null) return false;
        if (a instanceof Number && b instanceof Number) {
            return Double.compare(((Number) a).doubleValue(), ((Number) b).doubleValue()) == 0;
        }
        return String.valueOf(a).equals(String.valueOf(b));
    }

    private static JSONObject projectOverridesForSchema(JSONObject schema, JSONObject overrides) throws Exception {
        JSONObject result = new JSONObject();
        java.util.Iterator<String> keys = schema.keys();
        while (keys.hasNext()) {
            String key = keys.next();
            if (!overrides.has(key)) continue;
            Object schemaValue = schema.get(key);
            Object overrideValue = overrides.get(key);
            if (schemaValue instanceof JSONObject && overrideValue instanceof JSONObject) {
                JSONObject child = projectOverridesForSchema((JSONObject) schemaValue, (JSONObject) overrideValue);
                if (child.length() > 0) result.put(key, child);
            } else {
                result.put(key, overrideValue);
            }
        }
        return result;
    }

    static synchronized boolean undoRuntime(Context context) {
        try {
            JSONObject bundled = new JSONObject(readBundled(context));
            SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
            ensureOverrideStorageV2(prefs, bundled);
            String previous = prefs.getString(PREVIOUS, null);
            if (previous == null) return false;
            JSONObject previousOverrides = new JSONObject(previous);
            JSONObject currentOverrides = readOverrides(prefs);
            return prefs.edit()
                    .putString(CURRENT, previousOverrides.toString(2))
                    .putString(PREVIOUS, currentOverrides.toString(2))
                    .commit();
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
