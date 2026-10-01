package com.leixj.jetnote

import android.app.Activity
import android.content.Intent
import android.graphics.Color
import android.graphics.drawable.GradientDrawable
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.view.inputmethod.InputConnection
import android.view.inputmethod.InputContentInfo
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.TextView
import org.json.JSONObject
import java.io.IOException
import kotlin.math.roundToInt

class MainActivity : Activity() {

    companion object {
        // The reference architecture uses assets/index.html as its only entry point.
        private const val HOME_PAGE = "https://appassets.androidplatform.net/assets/index.html"
        private const val JS_BRIDGE_NAME = "JetNoteNative"
    }

    private lateinit var resourceRouter: LocalResourceRouter
    private lateinit var root: FrameLayout
    private var webView: RichContentWebView? = null
    private var imagePicker: ImagePickerController? = null
    private var attachmentPicker: AttachmentPickerController? = null
    private var backupFileController: BackupFileController? = null
    private var attachmentStore: AttachmentStore? = null
    private var edgeToEdge: EdgeToEdgeController? = null
    private var frontendIsReady = false
    private var mediaWriter: MediaWriteController? = null
    private var nativeVideoPlayer: NativeVideoPlayer? = null

    private val startupHandler = Handler(Looper.getMainLooper())
    private var nativeStartupSplashOverlay: FrameLayout? = null
    private var startupRenderWarningOverlay: View? = null
    private var nativeStartupSplashMinimumDurationMs = 0L
    private var nativeStartupSplashMinimumElapsed = false

    private fun readValidatedEffectiveConfigurationText(): String =
        RuntimeConfigStore.readEffective(this)

    private fun readEffectiveRuntimeConfiguration(): JSONObject =
        RuntimeConfigStore.parseObject(RuntimeConfigStore.readEffective(this))

    private fun dp(value: Float): Int =
        (value * resources.displayMetrics.density).roundToInt()

    private fun parseStartupBackgroundColor(loadAnimation: JSONObject): Int =
        Color.parseColor(RuntimeConfigStore.requireString(loadAnimation, "load_animation_background"))

    private fun installNativeStartupSplash(effectiveConfiguration: JSONObject) {
        val loadAnimation = RuntimeConfigStore.requireObject(effectiveConfiguration, "load_animation")
        nativeStartupSplashMinimumDurationMs =
            RuntimeConfigStore.requireLong(loadAnimation, "load_animation_minimum_duration_ms")
        nativeStartupSplashMinimumElapsed = false

        val overlay = FrameLayout(this).apply {
            setBackgroundColor(parseStartupBackgroundColor(loadAnimation))
            isClickable = true
            isFocusable = true
        }

        // Activity-side launch mark. The splash drawable is the same 108x108 artwork as the
        // launcher foreground, including its rounded black tile and updated four-piece mark.
        // Keep FIT_CENTER so the SVG/vector viewport is preserved without cropping. The brand
        // name belongs to this app-controlled stage because Android 12's system splash cannot render it.
        val launchMark = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER_HORIZONTAL

            addView(
                ImageView(this@MainActivity).apply {
                    setImageResource(com.leixj.jetnote.R.drawable.jetnote_splash_icon)
                    scaleType = ImageView.ScaleType.FIT_CENTER
                    contentDescription = getString(com.leixj.jetnote.R.string.app_name)
                },
                LinearLayout.LayoutParams(dp(176f), dp(176f))
            )

            addView(
                TextView(this@MainActivity).apply {
                    text = getString(com.leixj.jetnote.R.string.app_name)
                    setTextColor(Color.WHITE)
                    textSize = 44f
                    gravity = Gravity.CENTER
                    includeFontPadding = false
                },
                LinearLayout.LayoutParams(
                    ViewGroup.LayoutParams.WRAP_CONTENT,
                    ViewGroup.LayoutParams.WRAP_CONTENT
                ).apply { topMargin = dp(24f) }
            )
        }

        overlay.addView(
            launchMark,
            FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT,
                ViewGroup.LayoutParams.WRAP_CONTENT,
                Gravity.CENTER
            )
        )

        root.addView(
            overlay,
            FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
            )
        )
        nativeStartupSplashOverlay = overlay
    }

    private fun maybeFinishNativeStartupSplash() {
        val overlay = nativeStartupSplashOverlay ?: return
        if (!nativeStartupSplashMinimumElapsed || !frontendIsReady) return

        root.removeView(overlay)
        nativeStartupSplashOverlay = null
    }

    private fun scheduleNativeStartupSplashExit() {
        startupHandler.postDelayed({
            nativeStartupSplashMinimumElapsed = true
            maybeFinishNativeStartupSplash()
        }, nativeStartupSplashMinimumDurationMs)
        // Never let a failed frontend hide its own error page behind the splash.
        startupHandler.postDelayed({
            if (!frontendIsReady) {
                nativeStartupSplashOverlay?.let(root::removeView)
                nativeStartupSplashOverlay = null
                android.util.Log.e("JetNote", "Frontend startup did not complete within 15 seconds")
            }
        }, maxOf(15_000L, nativeStartupSplashMinimumDurationMs))
    }


    private fun jetNoteBorderedBackground(
        fillColor: Int,
        borderColor: Int,
        radiusDp: Float
    ) = GradientDrawable().apply {
        setColor(fillColor)
        setStroke(dp(1.5f), borderColor)
        cornerRadius = dp(radiusDp).toFloat()
    }

    @Suppress("unused")
    private fun showStartupRenderWarning() {
        if (startupRenderWarningOverlay != null) return

        val shield = FrameLayout(this).apply {
            isClickable = true
            isFocusable = true
            setBackgroundColor(0x18000000)
        }
        val card = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(18f), dp(16f), dp(18f), dp(14f))
            background = jetNoteBorderedBackground(
                Color.rgb(250, 255, 240), Color.rgb(191, 193, 196), 12f
            )
        }
        val title = TextView(this).apply {
            text = UiLanguage.text(this@MainActivity, "startupRenderingWarningTitle")
            setTextColor(Color.rgb(20, 20, 20))
            textSize = 16f
            setTypeface(android.graphics.Typeface.DEFAULT_BOLD)
        }
        card.addView(title, LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT
        ))

        val message = TextView(this).apply {
            text = UiLanguage.text(this@MainActivity, "startupRenderingWarningMessage")
            setTextColor(Color.rgb(70, 70, 70))
            textSize = 14f
            setPadding(0, dp(8f), 0, dp(14f))
        }
        card.addView(message, LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT
        ))

        val dismiss = TextView(this).apply {
            text = UiLanguage.text(this@MainActivity, "startupRenderingWarningDismiss")
            setTextColor(Color.rgb(20, 168, 154))
            textSize = 14f
            gravity = Gravity.CENTER
            setPadding(dp(14f), dp(9f), dp(14f), dp(9f))
            background = jetNoteBorderedBackground(
                Color.TRANSPARENT, Color.rgb(20, 168, 154), 9f
            )
            setOnClickListener {
                startupRenderWarningOverlay?.let(root::removeView)
                startupRenderWarningOverlay = null
            }
        }
        card.addView(dismiss, LinearLayout.LayoutParams(dp(88f), ViewGroup.LayoutParams.WRAP_CONTENT).apply {
            gravity = Gravity.END
        })

        shield.addView(card, FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.WRAP_CONTENT,
            Gravity.CENTER
        ).apply {
            leftMargin = dp(28f)
            rightMargin = dp(28f)
        })
        root.addView(shield, FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.MATCH_PARENT
        ))
        startupRenderWarningOverlay = shield
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        root = FrameLayout(this)
        val browser = RichContentWebView(this).also { webView = it }
        browser.isVerticalScrollBarEnabled = false
        browser.isHorizontalScrollBarEnabled = false
        browser.overScrollMode = View.OVER_SCROLL_NEVER
        browser.setLayerType(View.LAYER_TYPE_HARDWARE, null)

        val effectiveStartupConfiguration = readEffectiveRuntimeConfiguration()
        val startupLoadAnimation = RuntimeConfigStore.requireObject(
            effectiveStartupConfiguration, "load_animation"
        )
        val startupBackgroundColor = parseStartupBackgroundColor(startupLoadAnimation)
        browser.setBackgroundColor(startupBackgroundColor)
        root.setBackgroundColor(startupBackgroundColor)
        root.addView(browser, FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.MATCH_PARENT
        ))
        setContentView(root)

        installNativeStartupSplash(effectiveStartupConfiguration)

        // MAINTENANCE: Do not force the old 1500 ms first-entry delay; config now controls the minimum splash duration directly.
        scheduleNativeStartupSplashExit()

        val store = AttachmentStore(this).also { attachmentStore = it }
        resourceRouter = LocalResourceRouter(this, store)
        browser.setRichContentListener(::acceptImeRichContent)
        mediaWriter = MediaWriteController(this, store)
        imagePicker = ImagePickerController(this)
        edgeToEdge = EdgeToEdgeController(this, browser).also { it.install() }
        attachmentPicker = AttachmentPickerController(this, browser, store)
        backupFileController = BackupFileController(this, browser, attachmentStore!!)
        nativeVideoPlayer = NativeVideoPlayer(this, root, browser, store)

        configureWebSettings(browser.settings)
        installJavascriptBridge(browser)
        browser.webViewClient = createWebViewClient()
        browser.webChromeClient = createWebChromeClient()
        browser.loadUrl(HOME_PAGE)
    }

    private fun configureWebSettings(settings: WebSettings) = with(settings) {
        javaScriptEnabled = true
        domStorageEnabled = true
        databaseEnabled = true
        allowFileAccess = true
        allowContentAccess = true
        allowFileAccessFromFileURLs = false
        allowUniversalAccessFromFileURLs = false
        setSupportZoom(false)
        builtInZoomControls = false
        displayZoomControls = false
        mediaPlaybackRequiresUserGesture = false
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            @Suppress("DEPRECATION")
            forceDark = WebSettings.FORCE_DARK_OFF
        }
    }

    private fun installJavascriptBridge(browser: RichContentWebView) {
        val picker = requireNotNull(attachmentPicker)
        val store = requireNotNull(attachmentStore)
        val writer = requireNotNull(mediaWriter)
        val video = requireNotNull(nativeVideoPlayer)

        browser.addJavascriptInterface(
            NativeBridge(
                this, browser, picker, store, writer, video, requireNotNull(backupFileController)
            ) {
                runOnUiThread {
                    frontendIsReady = true
                    maybeFinishNativeStartupSplash()
                    edgeToEdge?.synchronizeInsets()
                }
            },
            JS_BRIDGE_NAME
        )
    }

    /**
     * Optional module hook. There is deliberately no Kotlin symbol reference to
     * the seed module: removing its .kt file leaves the core app buildable.
     */
    private fun installOptionalFirstEntrySeed(view: WebView) {
        try {
            val module = Class.forName("com.leixj.jetnote.WelcomeNoteInitializer")
            val install = module.getMethod("install", Activity::class.java, WebView::class.java)
            install.invoke(null, this, view)
        } catch (_: ClassNotFoundException) {
            // Optional feature absent: normal startup continues.
        } catch (error: Throwable) {
            android.util.Log.w("JetNote", "Optional first-entry seed unavailable", error)
        }
    }

    private fun createWebViewClient() = object : WebViewClient() {
        override fun onPageFinished(view: WebView, url: String?) {
            edgeToEdge?.synchronizeInsets()
            installOptionalFirstEntrySeed(view)
        }

        override fun shouldInterceptRequest(
            view: WebView,
            request: WebResourceRequest
        ): WebResourceResponse? {
            val range = request.requestHeaders.entries
                .firstOrNull { it.key.equals("Range", ignoreCase = true) }
                ?.value
            return resourceRouter.intercept(request.url, range, request.method)
        }

        @Deprecated("Deprecated in Android")
        override fun shouldInterceptRequest(view: WebView, url: String): WebResourceResponse? =
            resourceRouter.intercept(Uri.parse(url), null, "GET")

        override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean =
            handleNavigation(request.url)

        @Deprecated("Deprecated in Android")
        override fun shouldOverrideUrlLoading(view: WebView, url: String): Boolean =
            handleNavigation(Uri.parse(url))
    }

    private fun handleNavigation(uri: Uri): Boolean {
        if (resourceRouter.isAppAssetUrl(uri)) return false
        return true
    }

    private fun createWebChromeClient() = object : WebChromeClient() {
        override fun onJsAlert(
            view: WebView,
            url: String?,
            message: String,
            result: android.webkit.JsResult
        ): Boolean {
            view.evaluateJavascript(
                "window.JetNoteNotice&&window.alert(${JSONObject.quote(message)});", null
            )
            result.confirm()
            return true
        }

        override fun onShowFileChooser(
            webView: WebView,
            callback: ValueCallback<Array<Uri>>,
            fileChooserParams: FileChooserParams?
        ): Boolean {
            val multiple = fileChooserParams?.mode == FileChooserParams.MODE_OPEN_MULTIPLE
            val acceptTypes = fileChooserParams?.acceptTypes ?: arrayOf("image/*")
            imagePicker?.choose(callback, multiple, acceptTypes)
            return true
        }
    }

    private fun acceptImeRichContent(
        content: InputContentInfo?,
        flags: Int,
        opts: Bundle?
    ): Boolean {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.N_MR1 || content == null) return false
        if (content.description?.hasMimeType("image/*") != true) return false
        val uri = content.contentUri ?: return false

        val permissionRequested = try {
            if (flags and InputConnection.INPUT_CONTENT_GRANT_READ_URI_PERMISSION != 0) {
                content.requestPermission()
                true
            } else false
        } catch (_: Exception) {
            dispatchImeImagePasteError("image-permission-denied")
            return true
        }

        Thread({
            try {
                val store = attachmentStore ?: throw IOException("attachment-store-unavailable")
                val meta = store.importFromUri(uri, "image")
                val script =
                    "window.JetNoteNativeCallbacks&&window.JetNoteNativeCallbacks.onKeyboardImagePasted(${meta});"
                webView?.post { webView?.evaluateJavascript(script, null) }
            } catch (error: Exception) {
                dispatchImeImagePasteError(error.message ?: "image-read-failed")
            } finally {
                if (permissionRequested) {
                    try { content.releasePermission() } catch (_: Exception) { }
                }
            }
        }, "JetNote-Gboard-ImagePaste").start()
        return true
    }

    private fun dispatchImeImagePasteError(message: String?) {
        val safe = JSONObject.quote(message ?: "image-read-failed")
        webView?.post {
            webView?.evaluateJavascript(
                "window.JetNoteNativeCallbacks&&window.JetNoteNativeCallbacks.onKeyboardImagePasteError($safe);",
                null
            )
        }
    }

    @Deprecated("Deprecated in Android")
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        if (requestCode == NativeVideoViewerActivity.REQUEST_CODE) {
            if (resultCode == RESULT_OK && data != null) {
                val mediaId = data.getStringExtra(NativeVideoViewerActivity.RESULT_MEDIA_ID)
                val positionMs = maxOf(0, data.getIntExtra(NativeVideoViewerActivity.RESULT_POSITION_MS, 0))
                val durationMs = maxOf(0, data.getIntExtra(NativeVideoViewerActivity.RESULT_DURATION_MS, 0))
                nativeVideoPlayer?.synchronizeViewerPosition(mediaId, positionMs)
                val script = "window.__jetNativeVideoViewerClosed&&window.__jetNativeVideoViewerClosed(" +
                    JSONObject.quote(mediaId ?: "") + ",$positionMs,$durationMs);"
                webView?.post { webView?.evaluateJavascript(script, null) }
            }
            return
        }
        backupFileController?.takeIf { it.handles(requestCode) }?.let { it.onActivityResult(requestCode, resultCode, data); return }
        attachmentPicker?.takeIf { it.handles(requestCode) }?.let {
            it.onActivityResult(requestCode, resultCode, data)
            return
        }
        imagePicker?.onActivityResult(requestCode, resultCode, data)
    }

    @Deprecated("Deprecated in Android")
    override fun onBackPressed() {
        nativeVideoPlayer?.takeIf { it.isOpen }?.let {
            it.close()
            return
        }
        val browser = webView ?: run {
            super.onBackPressed()
            return
        }
        browser.evaluateJavascript(
            "(typeof returnToStandardHome === 'function') ? returnToStandardHome() : false"
        ) { value ->
            if (value != "true") super.onBackPressed()
        }
    }

    override fun onPause() {
        nativeVideoPlayer?.onHostPause()
        webView?.onPause()
        super.onPause()
    }

    override fun onResume() {
        super.onResume()
        edgeToEdge?.run {
            showStatusBar()
            synchronizeInsets()
        }
        webView?.run {
            onResume()
            post { evaluateJavascript("window.dispatchEvent(new Event('jetnote:app-resume'));", null) }
        }
        nativeVideoPlayer?.onHostResume()
    }

    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        if (hasFocus) {
            edgeToEdge?.run {
                showStatusBar()
                synchronizeInsets()
            }
        }
    }

    override fun onDestroy() {
        frontendIsReady = false
        startupHandler.removeCallbacksAndMessages(null)
        nativeVideoPlayer?.close()
        mediaWriter?.destroy()
        attachmentPicker?.destroy()
        imagePicker?.destroy()
        webView?.run {
            removeJavascriptInterface(JS_BRIDGE_NAME)
            setOnApplyWindowInsetsListener(null)
            webChromeClient = null
            stopLoading()
            destroy()
        }
        webView = null
        super.onDestroy()
    }
}
