package com.leixj.jetnote

import android.content.Context
import org.json.JSONObject
import java.io.ByteArrayOutputStream
import java.nio.charset.StandardCharsets
import java.util.Locale
import java.util.regex.Pattern

/** Single cached source for localized, user-visible UI wording used by native code. */
object UiLanguage {
    private val LOCK = Any()
    private const val PREFERENCES = "jet_note_ui_language"
    private const val LANGUAGE_KEY = "language_code"

    @Volatile
    private var cached: JSONObject? = null

    private fun data(context: Context?): JSONObject {
        cached?.let { return it }
        synchronized(LOCK) {
            cached?.let { return it }
            var loaded = JSONObject()
            if (context != null) {
                // MAINTENANCE: Language asset filenames are case-sensitive.
                val path = assetPath(context)
                try {
                    context.assets.open(path).use { input ->
                        ByteArrayOutputStream().use { out ->
                            val buffer = ByteArray(4096)
                            while (true) {
                                val count = input.read(buffer)
                                if (count == -1) break
                                out.write(buffer, 0, count)
                            }
                            val candidate = JSONObject(
                                String(out.toByteArray(), StandardCharsets.UTF_8)
                            )
                            if (candidate.optJSONObject("ui_strings") != null) {
                                loaded = candidate
                            }
                        }
                    }
                } catch (_: Exception) {
                    // Preserve the original fallback behavior if loading fails.
                }
            }
            cached = loaded
            return loaded
        }
    }

    @JvmStatic
    fun languageCode(context: Context?): String {
        if (context != null) {
            val selected = context.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE)
                .getString(LANGUAGE_KEY, "")
            if (selected == "zh" || selected == "en") return selected
        }
        return if (Locale.getDefault().language.equals("zh", ignoreCase = true)) "zh" else "en"
    }

    @JvmStatic
    fun setLanguageCode(context: Context?, languageCode: String?): Boolean {
        if (context == null || (languageCode != "zh" && languageCode != "en")) return false
        val saved = context.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE)
            .edit().putString(LANGUAGE_KEY, languageCode).commit()
        if (saved) synchronized(LOCK) { cached = null }
        return saved
    }

    @JvmStatic
    fun assetPath(context: Context?): String =
        if (languageCode(context) == "zh") "locales/Chinese.json" else "locales/English.json"

    @JvmStatic
    fun json(context: Context?): String = data(context).toString()

    @JvmStatic
    fun text(context: Context?, key: String?): String = text(context, key, key)

    @JvmStatic
    fun text(context: Context?, key: String?, fallback: String?): String {
        val value = valueAtPath(data(context), key)
        // Java String.trim() removes only characters up to U+0020.
        if (value is String && value.trim { it <= ' ' }.isNotEmpty()) return value
        return fallback ?: ""
    }

    @JvmStatic
    fun longValue(context: Context?, key: String?, fallback: Long): Long {
        val value = valueAtPath(data(context), key)
        return if (value is Number) value.toLong() else fallback
    }

    @JvmStatic
    fun format(context: Context?, key: String?, values: Map<String?, *>?): String {
        var result = text(context, key, key)
        if (values == null) return result
        for ((variable, value) in values) {
            result = result.replace("{$variable}", value?.toString() ?: "")
        }
        return result
    }

    @JvmStatic
    fun format(context: Context?, key: String?, variable: String?, value: Any?): String =
        text(context, key, key).replace("{$variable}", value?.toString() ?: "")

    private fun valueAtPath(root: JSONObject?, path: String?): Any? {
        if (root == null || path == null || path.isEmpty()) return null
        var current: Any? = root
        // Match Java String.split(), including its trailing-empty handling.
        for (part in Pattern.compile("\\.").split(path)) {
            val obj = current as? JSONObject ?: return null
            if (!obj.has(part)) return null
            current = obj.opt(part)
        }
        return current
    }
}
