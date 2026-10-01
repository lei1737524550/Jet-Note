package com.leixj.jetnote

import android.app.Activity
import android.webkit.WebView
import org.json.JSONObject
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone
import java.util.UUID

/** Optional first-entry seed module. */
object WelcomeNoteInitializer {
    private const val PREFS = "jet_note_optional_first_entry_seed"
    private const val KEY_FINISHED = "welcome_super_star_seed_finished"
    private const val KEY_FIRST_ENTERED_AT = "first_entered_at_ms"
    private const val MAX_READY_CHECKS = 100
    private const val READY_CHECK_DELAY_MS = 50L
    private const val RAINBOW_IMAGE_ASSET = "seed/rainbow_star.png"
    private const val WELCOME_IMAGE_ASSET = "seed/welcome_star.png"

    @JvmStatic
    fun install(activity: Activity, webView: WebView) {
        val preferences = activity.getSharedPreferences(PREFS, Activity.MODE_PRIVATE)
        if (preferences.getBoolean(KEY_FINISHED, false)) return
        val firstEnteredAt = preferences.getLong(KEY_FIRST_ENTERED_AT, 0L).let { saved ->
            if (saved > 0L) saved else System.currentTimeMillis().also {
                preferences.edit().putLong(KEY_FIRST_ENTERED_AT, it).apply()
            }
        }
        waitForNoteService(activity, webView, firstEnteredAt, 0)
    }

    private fun waitForNoteService(activity: Activity, webView: WebView, firstEnteredAt: Long, attempt: Int) {
        if (activity.isFinishing || activity.isDestroyed) return
        webView.evaluateJavascript("(typeof entriesReady !== 'undefined' && entriesReady === true)") { raw ->
            if (raw == "true") createSeedIfWorkspaceIsEmpty(activity, webView, firstEnteredAt)
            else if (attempt < MAX_READY_CHECKS) webView.postDelayed({
                waitForNoteService(activity, webView, firstEnteredAt, attempt + 1)
            }, READY_CHECK_DELAY_MS)
        }
    }

    private fun createSeedIfWorkspaceIsEmpty(activity: Activity, webView: WebView, firstEnteredAt: Long) {
        // Check before copying the bundled image so an existing workspace never gets an orphan media file.
        webView.evaluateJavascript("Array.isArray(posts) ? (posts.length === 0) : false") { raw ->
            if (raw == "true") createFreshWorkspaceSeeds(activity, webView, firstEnteredAt)
            else if (raw == "false") {
                activity.getSharedPreferences(PREFS, Activity.MODE_PRIVATE)
                    .edit().putBoolean(KEY_FINISHED, true).apply()
            }
        }
    }

    private fun createFreshWorkspaceSeeds(activity: Activity, webView: WebView, firstEnteredAt: Long) {
        val welcomeCreatedAt = isoUtc(firstEnteredAt)
        val rainbowCreatedAt = isoUtc(firstEnteredAt + 1L)
        val welcomeUuid = UUID.randomUUID().toString()
        val rainbowUuid = UUID.randomUUID().toString()
        // Seed language is decided exactly once from the Android system locale.
        // After persistence this is ordinary user data and never follows later app-language changes.
        val systemLanguage = activity.resources.configuration.locales[0]?.language
            ?: Locale.getDefault().language
        val welcomeText = if (systemLanguage.equals("zh", ignoreCase = true)) {
            "#ff0000${'$'}欢迎使用 JetNote"
        } else {
            "#ff0000${'$'}Welcome to JetNote"
        }

        // Import the bundled PNG through the same lossless app-owned media store used by normal attachments.
        // This keeps viewing, export/import and integrity metadata on the normal attachment path.
        val rainbowImageMetadata = try {
            activity.assets.open(RAINBOW_IMAGE_ASSET).use { input ->
                AttachmentStore(activity).importFromStream(
                    input,
                    "image/png",
                    "rainbow_star.png",
                    "image",
                    16L * 1024L * 1024L
                )
            }
        } catch (error: Exception) {
            error.printStackTrace()
            return
        }

        val welcomeImageMetadata = try {
            activity.assets.open(WELCOME_IMAGE_ASSET).use { input ->
                AttachmentStore(activity).importFromStream(
                    input,
                    "image/png",
                    "welcome_star.png",
                    "image",
                    16L * 1024L * 1024L
                )
            }
        } catch (error: Exception) {
            error.printStackTrace()
            return
        }

        val script = """
            (() => {
              try {
                if (!Array.isArray(posts)) return 'unavailable';
                if (posts.length !== 0) return 'existing';

                const welcome = {
                  id: $firstEnteredAt,
                  uuid: ${JSONObject.quote(welcomeUuid)},
                  createdAt: ${JSONObject.quote(welcomeCreatedAt)},
                  updatedAt: ${JSONObject.quote(welcomeCreatedAt)},
                  text: ${JSONObject.quote(welcomeText)},
                  starState: 'super_star',
                  images: [NativeMedia.url(${welcomeImageMetadata})],
                  attachments: [${welcomeImageMetadata}]
                };

                const rainbow = {
                  id: ${firstEnteredAt + 1L},
                  uuid: ${JSONObject.quote(rainbowUuid)},
                  createdAt: ${JSONObject.quote(rainbowCreatedAt)},
                  updatedAt: ${JSONObject.quote(rainbowCreatedAt)},
                  text: (typeof t === 'function' ? t('rainbowStarNote') : 'Dear, please give me a star 🌟'),
                  starState: 'star',
                  images: [NativeMedia.url(${rainbowImageMetadata})],
                  attachments: [${rainbowImageMetadata}]
                };

                posts.push(welcome, rainbow);
                persistEntries().catch(error => console.error('Optional welcome notes persist failed', error));
                if (typeof renderPosts === 'function') renderPosts();
                return 'created';
              } catch (error) {
                console.error('Optional welcome note seed failed', error);
                return 'failed';
              }
            })();
        """.trimIndent()

        webView.evaluateJavascript(script) { raw ->
            val result = raw?.trim('"')
            if (result == "created" || result == "existing") {
                activity.getSharedPreferences(PREFS, Activity.MODE_PRIVATE)
                    .edit().putBoolean(KEY_FINISHED, true).apply()
            }
        }
    }

    private fun isoUtc(timestampMs: Long): String =
        SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US).apply {
            timeZone = TimeZone.getTimeZone("UTC")
        }.format(Date(timestampMs))
}
