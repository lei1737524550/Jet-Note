package com.ingeniousidea.space;

import android.app.Activity;
import android.content.Intent;
import android.graphics.Color;
import android.graphics.Bitmap;
import android.media.MediaMetadataRetriever;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.View;
import android.view.ViewGroup;
import android.view.Gravity;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.view.inputmethod.InputConnection;
import android.view.inputmethod.InputContentInfo;

import org.json.JSONObject;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.graphics.drawable.GradientDrawable;
import android.graphics.drawable.Drawable;

import java.io.File;
import java.io.FileInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.ByteArrayInputStream;
import java.nio.charset.StandardCharsets;
import java.net.URLConnection;
import java.util.HashMap;
import java.util.Map;

public class MainActivity extends Activity {
    private static final String APP_HOST = "appassets.androidplatform.net";
    private static final String LEGACY_HOST = "jetnote.local";
    private static final String HOME_PAGE = "https://" + APP_HOST + "/assets/app/home/home.html";
    private static final String BROWSER_BOOT_PAGE = "https://" + APP_HOST + "/assets/app/browser/browser_boot.html";

    private FrameLayout root;
    private RichContentWebView webView;
    private ImagePickerController imagePicker;
    private AttachmentPickerController attachmentPicker;
    private AttachmentStore attachmentStore;
    private JetNoteArchiveController archiveController;
    private ToolPageController toolPageController;
    private BrowserModeController browserModeController;
    private EdgeToEdgeController edgeToEdge;
    private Uri pendingLaunchImport;
    private boolean frontendIsReady;
    private MediaWriteController mediaWriter;
    private NativeVideoPlayer nativeVideoPlayer;

    // Native startup surface. It is intentionally independent from WebView so
    // background, application icon and application name can be drawn together
    // on the first Android frame instead of waiting for HTML/image decoding.
    private final Handler startupHandler = new Handler(Looper.getMainLooper());
    private FrameLayout nativeStartupSplashOverlay;
    private View startupRenderWarningOverlay;
    private long nativeStartupSplashMinimumDurationMs = 900L;
    private boolean nativeStartupSplashMinimumElapsed;

    /**
     * The effective config is centralized in RuntimeConfigStore. Runtime edits
     * are automatically invalidated when a newly installed APK ships a changed
     * config.json, so stale SharedPreferences cannot mask source edits.
     */
    private String readValidatedEffectiveConfigurationText() {
        return RuntimeConfigStore.readEffective(this);
    }

    private JSONObject readEffectiveRuntimeConfiguration() {
        try { return new JSONObject(RuntimeConfigStore.readEffective(this)); }
        catch (Exception ignored) { return new JSONObject(); }
    }

    private int dp(float value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }

    private int parseStartupBackgroundColor(JSONObject loadAnimation) {
        String configured = loadAnimation.optString("load_animation_background", "#AED194").trim();
        try { return Color.parseColor(configured); }
        catch (Exception ignored) { return Color.parseColor("#AED194"); }
    }

    /** Build the one native startup surface before WebView navigation begins. */
    private void installNativeStartupSplash(JSONObject effectiveConfiguration) {
        JSONObject loadAnimation = effectiveConfiguration.optJSONObject("load_animation");
        if (loadAnimation == null) loadAnimation = new JSONObject();
        nativeStartupSplashMinimumDurationMs = Math.max(0L,
                loadAnimation.optLong("load_animation_minimum_duration_ms", 900L));
        nativeStartupSplashMinimumElapsed = false;

        FrameLayout overlay = new FrameLayout(this);
        overlay.setBackgroundColor(parseStartupBackgroundColor(loadAnimation));
        overlay.setClickable(true);
        overlay.setFocusable(true);

        // Keep the icon at the exact screen center. The Android window preview uses
        // the same 112dp centered icon, so preview -> Activity has no positional jump.
        ImageView icon = new ImageView(this);
        icon.setScaleType(ImageView.ScaleType.FIT_CENTER);
        try {
            Drawable applicationIcon = getApplicationInfo().loadIcon(getPackageManager());
            icon.setImageDrawable(applicationIcon);
        } catch (Exception ignored) {
            icon.setImageResource(R.drawable.icon);
        }
        FrameLayout.LayoutParams iconParams = new FrameLayout.LayoutParams(dp(112), dp(112), Gravity.CENTER);
        overlay.addView(icon, iconParams);

        TextView applicationName = new TextView(this);
        applicationName.setTextColor(Color.rgb(34, 34, 34));
        applicationName.setTextSize(30f);
        applicationName.setGravity(Gravity.CENTER);
        try {
            applicationName.setText(getApplicationInfo().loadLabel(getPackageManager()));
        } catch (Exception ignored) {
            applicationName.setText(R.string.app_name);
        }
        FrameLayout.LayoutParams nameParams = new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.CENTER);
        nameParams.topMargin = dp(92);
        overlay.addView(applicationName, nameParams);

        root.addView(overlay, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        nativeStartupSplashOverlay = overlay;
    }

    /** Remove the native splash only after both its configured minimum time and frontend readiness. */
    private void maybeFinishNativeStartupSplash() {
        if (!nativeStartupSplashMinimumElapsed || !frontendIsReady || nativeStartupSplashOverlay == null) return;
        root.removeView(nativeStartupSplashOverlay);
        nativeStartupSplashOverlay = null;
    }

    private void scheduleNativeStartupSplashExit() {
        startupHandler.postDelayed(() -> {
            nativeStartupSplashMinimumElapsed = true;
            maybeFinishNativeStartupSplash();
        }, nativeStartupSplashMinimumDurationMs);
    }

    private GradientDrawable jetNoteBorderedBackground(int fillColor, int borderColor, float radiusDp) {
        GradientDrawable background = new GradientDrawable();
        background.setColor(fillColor);
        background.setStroke(dp(1.5f), borderColor);
        background.setCornerRadius(dp(radiusDp));
        return background;
    }

    /**
     * Native fallback warning: it does not depend on WebView being healthy, which
     * is important because this warning exists specifically for incomplete startup rendering.
     */
    private void showStartupRenderWarning() {
        if (startupRenderWarningOverlay != null || root == null) return;

        FrameLayout shield = new FrameLayout(this);
        shield.setClickable(true);
        shield.setFocusable(true);
        shield.setBackgroundColor(0x18000000);

        LinearLayout card = new LinearLayout(this);
        card.setOrientation(LinearLayout.VERTICAL);
        card.setPadding(dp(18), dp(16), dp(18), dp(14));
        card.setBackground(jetNoteBorderedBackground(Color.rgb(250, 255, 240), Color.rgb(191, 193, 196), 12));

        TextView title = new TextView(this);
        title.setText(UiLanguage.text(this, "startupRenderingWarningTitle"));
        title.setTextColor(Color.rgb(20, 20, 20));
        title.setTextSize(16f);
        title.setTypeface(android.graphics.Typeface.DEFAULT_BOLD);
        card.addView(title, new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));

        TextView message = new TextView(this);
        message.setText(UiLanguage.text(this, "startupRenderingWarningMessage"));
        message.setTextColor(Color.rgb(70, 70, 70));
        message.setTextSize(14f);
        message.setPadding(0, dp(8), 0, dp(14));
        card.addView(message, new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));

        TextView dismiss = new TextView(this);
        dismiss.setText(UiLanguage.text(this, "startupRenderingWarningDismiss"));
        dismiss.setTextColor(Color.rgb(20, 168, 154));
        dismiss.setTextSize(14f);
        dismiss.setGravity(Gravity.CENTER);
        dismiss.setPadding(dp(14), dp(9), dp(14), dp(9));
        dismiss.setBackground(jetNoteBorderedBackground(Color.TRANSPARENT, Color.rgb(20, 168, 154), 9));
        dismiss.setOnClickListener(view -> {
            if (startupRenderWarningOverlay != null) root.removeView(startupRenderWarningOverlay);
            startupRenderWarningOverlay = null;
        });
        LinearLayout.LayoutParams dismissParams = new LinearLayout.LayoutParams(dp(88), ViewGroup.LayoutParams.WRAP_CONTENT);
        dismissParams.gravity = Gravity.END;
        card.addView(dismiss, dismissParams);

        FrameLayout.LayoutParams cardParams = new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.CENTER);
        cardParams.leftMargin = dp(28);
        cardParams.rightMargin = dp(28);
        shield.addView(card, cardParams);

        root.addView(shield, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        startupRenderWarningOverlay = shield;
    }

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        root = new FrameLayout(this);
        webView = new RichContentWebView(this);
        webView.setVerticalScrollBarEnabled(false);
        webView.setHorizontalScrollBarEnabled(false);
        // NativeVideoPlayer is overlaid above the WebView. Android WebView edge
        // overscroll can visually stretch/bounce the page without producing a
        // matching content scroll offset for that native overlay, briefly making
        // an already-loaded video protrude from its HTML slot. Disable WebView
        // overscroll so page content and the native video layer share the same
        // hard top/bottom boundaries. Normal scrolling is unaffected.
        webView.setOverScrollMode(android.view.View.OVER_SCROLL_NEVER);
        webView.setLayerType(android.view.View.LAYER_TYPE_HARDWARE, null);

        // Keep the WebView's pre-render surface identical to the native startup
        // surface. This closes the Theme -> Activity -> WebView white-flash gap.
        JSONObject effectiveStartupConfiguration = readEffectiveRuntimeConfiguration();
        JSONObject startupLoadAnimation = effectiveStartupConfiguration.optJSONObject("load_animation");
        if (startupLoadAnimation == null) startupLoadAnimation = new JSONObject();
        int startupBackgroundColor = parseStartupBackgroundColor(startupLoadAnimation);
        webView.setBackgroundColor(startupBackgroundColor);
        root.setBackgroundColor(startupBackgroundColor);
        root.addView(webView, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        setContentView(root);

        // Build the native splash immediately, before WebView starts navigating.
        // Its duration is read from the same effective config.json used by the app.
        installNativeStartupSplash(effectiveStartupConfiguration);
        // Start the configured timer at splash creation, not after controller/WebView setup.
        scheduleNativeStartupSplashExit();

        attachmentStore = new AttachmentStore(this);
        webView.setRichContentListener(this::acceptImeRichContent);
        mediaWriter=new MediaWriteController(this,attachmentStore);
        imagePicker = new ImagePickerController(this);
        edgeToEdge = new EdgeToEdgeController(this, webView);
        edgeToEdge.install();
        toolPageController = new ToolPageController(this, root, webView, attachmentStore);
        browserModeController = new BrowserModeController(this, root, webView, attachmentStore);
        attachmentPicker = new AttachmentPickerController(this, webView, attachmentStore);
        archiveController = new JetNoteArchiveController(this, webView, attachmentStore);
        nativeVideoPlayer = new NativeVideoPlayer(this, root, webView, attachmentStore);
        pendingLaunchImport = getViewIntentUri(getIntent());

        // Use one HTTPS origin for the packaged app and local media. Assets are
        // served directly from AssetManager. Post video decoding/seek is handled
        // by NativeVideoPlayer; the WebView keeps only the poster and control UI.

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setAllowFileAccess(true);
        settings.setAllowContentAccess(true);
        settings.setAllowFileAccessFromFileURLs(false);
        settings.setAllowUniversalAccessFromFileURLs(false);
        settings.setSupportZoom(false);
        settings.setBuiltInZoomControls(false);
        settings.setDisplayZoomControls(false);
        // Web tools may still embed media; Jet Note post videos themselves use
        // NativeVideoPlayer and do not depend on HTMLMediaElement playback.
        settings.setMediaPlaybackRequiresUserGesture(false);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            settings.setForceDark(WebSettings.FORCE_DARK_OFF);
        }

        webView.addJavascriptInterface(
                new NativeBridge(this, webView, toolPageController, browserModeController, attachmentPicker, attachmentStore, archiveController,mediaWriter,nativeVideoPlayer,()->runOnUiThread(()->{
                    frontendIsReady=true;
                    maybeFinishNativeStartupSplash();
                    if(edgeToEdge!=null)edgeToEdge.synchronizeInsets();
                    dispatchPendingImport();
                })),
                "JetNoteNative");

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public void onPageFinished(WebView view, String url) {
                edgeToEdge.synchronizeInsets();
            }

            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                String range = null;
                for (Map.Entry<String, String> h : request.getRequestHeaders().entrySet()) {
                    if ("Range".equalsIgnoreCase(h.getKey())) {
                        range = h.getValue();
                        break;
                    }
                }
                WebResourceResponse thumb = videoThumbnailResponse(request.getUrl());
                if (thumb != null) return thumb;
                WebResourceResponse media = mediaResponse(request.getUrl(), range, request.getMethod());
                if (media != null) return media;
                return assetResponse(request.getUrl());
            }

            @SuppressWarnings("deprecation")
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, String url) {
                Uri uri = Uri.parse(url);
                WebResourceResponse thumb = videoThumbnailResponse(uri);
                if (thumb != null) return thumb;
                WebResourceResponse media = mediaResponse(uri, null, "GET");
                if (media != null) return media;
                return assetResponse(uri);
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                if (isAppAssetUrl(uri)) return false;
                openExternal(uri);
                return true;
            }

            @SuppressWarnings("deprecation")
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                Uri uri = Uri.parse(url);
                if (isAppAssetUrl(uri)) return false;
                openExternal(uri);
                return true;
            }
        });

        // Avatar and post attachment inputs use the platform picker.
        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onJsAlert(WebView view, String url, String message, android.webkit.JsResult result) {
                view.evaluateJavascript("window.JetNoteNotice&&window.alert(" + org.json.JSONObject.quote(message) + ");", null);
                result.confirm();
                return true;
            }
            @Override
            public boolean onShowFileChooser(
                    WebView webView,
                    ValueCallback<Uri[]> callback,
                    FileChooserParams fileChooserParams
            ) {
                imagePicker.choose(callback, fileChooserParams != null
                        && fileChooserParams.getMode() == FileChooserParams.MODE_OPEN_MULTIPLE,
                        fileChooserParams==null?new String[]{"image/*"}:fileChooserParams.getAcceptTypes());
                return true;
            }
        });

        // Browser Mode is a startup route, not a Home overlay. When enabled,
        // never load home.html, render Posts, or initialize Home media/listeners.
        webView.loadUrl(BrowserModeStore.isEnabled(this) ? BROWSER_BOOT_PAGE : HOME_PAGE);
    }

    /**
     * Accept image content committed directly by an IME (for example Gboard's
     * clipboard image paste). The URI is copied byte-for-byte into Jet Note's
     * normal attachment store, then the frontend receives the same metadata
     * shape used by the regular image picker.
     */
    private boolean acceptImeRichContent(InputContentInfo content, int flags, Bundle opts) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.N_MR1 || content == null) return false;
        if (content.getDescription() == null || !content.getDescription().hasMimeType("image/*")) return false;

        final Uri uri = content.getContentUri();
        if (uri == null) return false;

        boolean permissionRequested = false;
        try {
            if ((flags & InputConnection.INPUT_CONTENT_GRANT_READ_URI_PERMISSION) != 0) {
                content.requestPermission();
                permissionRequested = true;
            }
        } catch (Exception error) {
            dispatchImeImagePasteError("image-permission-denied");
            return true;
        }

        final boolean releasePermission = permissionRequested;
        new Thread(() -> {
            try {
                JSONObject meta = attachmentStore.importFromUri(uri, "image");
                String script = "window.JetNoteNativeCallbacks&&window.JetNoteNativeCallbacks.onKeyboardImagePasted("
                        + meta.toString() + ");";
                webView.post(() -> webView.evaluateJavascript(script, null));
            } catch (Exception error) {
                dispatchImeImagePasteError(error.getMessage() == null ? "image-read-failed" : error.getMessage());
            } finally {
                if (releasePermission) {
                    try { content.releasePermission(); } catch (Exception ignored) { }
                }
            }
        }, "JetNote-Gboard-ImagePaste").start();
        return true;
    }

    private void dispatchImeImagePasteError(String message) {
        String safe = JSONObject.quote(message == null ? "image-read-failed" : message);
        webView.post(() -> webView.evaluateJavascript(
                "window.JetNoteNativeCallbacks&&window.JetNoteNativeCallbacks.onKeyboardImagePasteError(" + safe + ");",
                null));
    }

    private WebResourceResponse assetResponse(Uri uri) {
        if (uri == null || !"https".equalsIgnoreCase(uri.getScheme())
                || !APP_HOST.equalsIgnoreCase(uri.getHost())) return null;
        String path = uri.getPath();
        if (path == null || !path.startsWith("/assets/")) return null;

        String assetPath = path.substring("/assets/".length());
        if (assetPath.isEmpty()) assetPath = "app/home/home.html";
        // Reject traversal and malformed paths before touching AssetManager.
        if (assetPath.startsWith("/") || assetPath.contains("../") || assetPath.contains("\\")) {
            return missingMedia();
        }
        try {
            InputStream in;
            if ("config.json".equals(assetPath)) {
                // Compatibility virtual endpoint: application modules continue to consume
                // one effective object while the bundled source is physically split.
                String effectiveConfiguration = readValidatedEffectiveConfigurationText();
                in = new ByteArrayInputStream(effectiveConfiguration.getBytes(StandardCharsets.UTF_8));
            } else if (assetPath.startsWith("config/") && assetPath.endsWith(".json")) {
                String sectionName = assetPath.substring("config/".length());
                String section = RuntimeConfigStore.readEffectiveSection(this, sectionName);
                in = new ByteArrayInputStream(section.getBytes(StandardCharsets.UTF_8));
            } else {
                in = getAssets().open(assetPath);
            }
            String mime = URLConnection.guessContentTypeFromName(assetPath);
            if (mime == null) {
                if (assetPath.endsWith(".js")) mime = "application/javascript";
                else if (assetPath.endsWith(".css")) mime = "text/css";
                else if (assetPath.endsWith(".json")) mime = "application/json";
                else if (assetPath.endsWith(".svg")) mime = "image/svg+xml";
                else mime = "application/octet-stream";
            }
            String encoding = (mime.startsWith("text/") || mime.contains("javascript") || mime.contains("json") || mime.contains("svg"))
                    ? "UTF-8" : null;
            Map<String, String> headers = new HashMap<>();
            headers.put("Cache-Control", "no-cache");
            headers.put("X-Content-Type-Options", "nosniff");
            return new WebResourceResponse(mime, encoding, 200, "OK", headers, in);
        } catch (IOException ignored) {
            return missingMedia();
        }
    }

    private WebResourceResponse videoThumbnailResponse(Uri uri) {
        if (uri == null || !"https".equalsIgnoreCase(uri.getScheme()) || !APP_HOST.equalsIgnoreCase(uri.getHost())) return null;
        String path = uri.getPath();
        if (path == null || !path.matches("/video-thumb/[A-Za-z0-9_.-]+\\.jpg")) return null;
        String requested = uri.getLastPathSegment();
        if (requested == null || !requested.endsWith(".jpg")) return null;
        String fileName = requested.substring(0, requested.length() - 4);
        if (!AttachmentStore.isSafeFileName(fileName)) return missingMedia();
        File source;
        try { source = attachmentStore.fileForWeb(fileName); } catch (IOException e) { return missingMedia(); }
        File cacheDir = new File(getCacheDir(), "jetnote-video-thumbs");
        if (!cacheDir.exists()) cacheDir.mkdirs();
        String cacheName = "user-" + fileName + ".jpg";
        File cached = new File(cacheDir, cacheName);
        try {
            if (!cached.isFile() || cached.lastModified() < source.lastModified()) {
                MediaMetadataRetriever retriever = new MediaMetadataRetriever();
                Bitmap frame = null;
                try {
                    retriever.setDataSource(source.getAbsolutePath());
                    frame = retriever.getFrameAtTime(0, MediaMetadataRetriever.OPTION_CLOSEST_SYNC);
                    if (frame == null) frame = retriever.getFrameAtTime(-1);
                    if (frame == null) return missingMedia();
                    try (java.io.FileOutputStream out = new java.io.FileOutputStream(cached)) {
                        frame.compress(Bitmap.CompressFormat.JPEG, 82, out);
                    }
                } finally {
                    if (frame != null) frame.recycle();
                    try { retriever.release(); } catch (Exception ignored) { }
                }
            }
            Map<String,String> headers = new HashMap<>();
            headers.put("Cache-Control", "private, max-age=86400");
            return new WebResourceResponse("image/jpeg", null, 200, "OK", headers, new FileInputStream(cached));
        } catch (Exception e) {
            return missingMedia();
        }
    }

    private WebResourceResponse mediaResponse(Uri uri, String rangeHeader, String method) {
        if (!isJetNoteLocalUrl(uri)) return null;
        String path = uri.getPath();

        if (path == null || !path.matches("/media/[A-Za-z0-9_.-]+")) return null;
        String fileName = uri.getLastPathSegment();
        if (!AttachmentStore.isSafeFileName(fileName)) return missingMedia();
        try {
            File file = attachmentStore.fileForWeb(fileName);
            String mime = attachmentStore.mimeForFileName(fileName);
            long size = file.length();
            Map<String, String> baseHeaders = mediaHeaders(mime);
            baseHeaders.put("Accept-Ranges", "bytes");

            if ("OPTIONS".equalsIgnoreCase(method)) {
                return new WebResourceResponse(mime, null, 204, "No Content", baseHeaders,
                        new java.io.ByteArrayInputStream(new byte[0]));
            }

            RangeResult parsedRange = parseRange(rangeHeader, size);
            if (parsedRange.requested && !parsedRange.valid) {
                baseHeaders.put("Content-Range", "bytes */" + size);
                baseHeaders.put("Content-Length", "0");
                return new WebResourceResponse(mime, null, 416, "Range Not Satisfiable", baseHeaders,
                        new java.io.ByteArrayInputStream(new byte[0]));
            }

            if (parsedRange.valid) {
                long start = parsedRange.start;
                long end = parsedRange.end;
                long length = end - start + 1;
                Map<String, String> headers = new HashMap<>(baseHeaders);
                headers.put("Content-Range", "bytes " + start + "-" + end + "/" + size);
                headers.put("Content-Length", String.valueOf(length));

                if ("HEAD".equalsIgnoreCase(method)) {
                    return new WebResourceResponse(mime, null, 206, "Partial Content", headers,
                            new java.io.ByteArrayInputStream(new byte[0]));
                }

                FileInputStream in = new FileInputStream(file);
                long skipped = 0;
                while (skipped < start) {
                    long step = in.skip(start - skipped);
                    if (step <= 0) {
                        int one = in.read();
                        if (one == -1) break;
                        step = 1;
                    }
                    skipped += step;
                }
                if (skipped != start) {
                    in.close();
                    return missingMedia();
                }
                return new WebResourceResponse(mime, null, 206, "Partial Content", headers,
                        new LimitedInputStream(in, length));
            }

            baseHeaders.put("Content-Length", String.valueOf(size));
            if ("HEAD".equalsIgnoreCase(method)) {
                return new WebResourceResponse(mime, null, 200, "OK", baseHeaders,
                        new java.io.ByteArrayInputStream(new byte[0]));
            }
            return new WebResourceResponse(mime, null, 200, "OK", baseHeaders, new FileInputStream(file));
        } catch (IOException ignored) {
            return missingMedia();
        }
    }

    private WebResourceResponse missingMedia(){return new WebResourceResponse("text/plain","UTF-8",404,"Not Found",new HashMap<>(),new java.io.ByteArrayInputStream(new byte[0]));}

    private static final class RangeResult {
        final boolean requested;
        final boolean valid;
        final long start;
        final long end;

        RangeResult(boolean requested, boolean valid, long start, long end) {
            this.requested = requested;
            this.valid = valid;
            this.start = start;
            this.end = end;
        }
    }

    private static RangeResult parseRange(String header, long size) {
        if (header == null || header.trim().isEmpty()) {
            return new RangeResult(false, false, 0, 0);
        }
        if (size <= 0 || !header.regionMatches(true, 0, "bytes=", 0, 6)) {
            return new RangeResult(true, false, 0, 0);
        }
        try {
            String raw = header.substring(6).trim();
            if (raw.isEmpty() || raw.contains(",")) return new RangeResult(true, false, 0, 0);
            int dash = raw.indexOf('-');
            if (dash < 0) return new RangeResult(true, false, 0, 0);
            String startRaw = raw.substring(0, dash).trim();
            String endRaw = raw.substring(dash + 1).trim();
            long start;
            long end;
            if (startRaw.isEmpty()) {
                if (endRaw.isEmpty()) return new RangeResult(true, false, 0, 0);
                long suffix = Long.parseLong(endRaw);
                if (suffix <= 0) return new RangeResult(true, false, 0, 0);
                start = Math.max(0, size - suffix);
                end = size - 1;
            } else {
                start = Long.parseLong(startRaw);
                end = endRaw.isEmpty() ? size - 1 : Long.parseLong(endRaw);
            }
            if (start < 0 || start >= size || end < start) return new RangeResult(true, false, 0, 0);
            end = Math.min(end, size - 1);
            return new RangeResult(true, true, start, end);
        } catch (RuntimeException ignored) {
            return new RangeResult(true, false, 0, 0);
        }
    }

    private static Map<String, String> mediaHeaders(String mime) {
        Map<String, String> headers = new HashMap<>();
        headers.put("Access-Control-Allow-Origin", "*");
        headers.put("Access-Control-Allow-Headers", "Range, Content-Type");
        headers.put("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
        headers.put("Cache-Control", "no-store");
        headers.put("Content-Type", mime == null ? "application/octet-stream" : mime);
        headers.put("X-Content-Type-Options", "nosniff");
        return headers;
    }

    private static boolean isJetNoteLocalUrl(Uri uri) {
        if (uri == null || !"https".equalsIgnoreCase(uri.getScheme())) return false;
        String host = uri.getHost();
        return APP_HOST.equalsIgnoreCase(host) || LEGACY_HOST.equalsIgnoreCase(host);
    }

    private static boolean isAppAssetUrl(Uri uri) {
        return uri != null
                && "https".equalsIgnoreCase(uri.getScheme())
                && APP_HOST.equalsIgnoreCase(uri.getHost());
    }

    private void openExternal(Uri uri) {
        if (uri == null || !("https".equalsIgnoreCase(uri.getScheme())||"http".equalsIgnoreCase(uri.getScheme()))) return;
        try {
            startActivity(new Intent(Intent.ACTION_VIEW, uri));
        } catch (RuntimeException ignored) { }
    }

    private static final class LimitedInputStream extends InputStream {
        private final InputStream delegate;
        private long remaining;

        LimitedInputStream(InputStream delegate, long remaining) {
            this.delegate = delegate;
            this.remaining = remaining;
        }

        @Override
        public int read() throws IOException {
            if (remaining <= 0) return -1;
            int value = delegate.read();
            if (value != -1) remaining--;
            return value;
        }

        @Override
        public int read(byte[] b, int off, int len) throws IOException {
            if (remaining <= 0) return -1;
            int read = delegate.read(b, off, (int) Math.min(len, remaining));
            if (read > 0) remaining -= read;
            return read;
        }

        @Override
        public int available() throws IOException {
            return (int) Math.min((long) delegate.available(), Math.min(remaining, Integer.MAX_VALUE));
        }

        @Override
        public long skip(long byteCount) throws IOException {
            if (remaining <= 0 || byteCount <= 0) return 0;
            long skipped = delegate.skip(Math.min(byteCount, remaining));
            if (skipped > 0) remaining -= skipped;
            return skipped;
        }

        @Override
        public void close() throws IOException {
            delegate.close();
        }
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        Uri uri = getViewIntentUri(intent);
        if (uri != null && archiveController != null && webView != null) {
            pendingLaunchImport=uri;dispatchPendingImport();
        }
    }

    private void dispatchPendingImport() {
        if(!frontendIsReady||pendingLaunchImport==null)return;
        Uri uri=pendingLaunchImport;pendingLaunchImport=null;
        webView.evaluateJavascript("entriesReady&&!entriesBusy&&!pendingArchive&&!document.querySelector('#postComposeScreen.open')",value->{
            if("true".equals(value)){
                webView.evaluateJavascript("entriesBusy=true;archiveStatus(t('validating'));",null);
                archiveController.importFromUri(uri,"merge");
            } else android.widget.Toast.makeText(this,UiLanguage.text(this, "archiveOpenBusy"),android.widget.Toast.LENGTH_LONG).show();
        });
    }

    private static Uri getViewIntentUri(Intent intent) {
        if (intent == null || !Intent.ACTION_VIEW.equals(intent.getAction())) return null;
        Uri uri=intent.getData();
        return uri!=null&&("content".equals(uri.getScheme())||"file".equals(uri.getScheme()))?uri:null;
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == NativeVideoViewerActivity.REQUEST_CODE) {
            if (resultCode == RESULT_OK && data != null) {
                String mediaId = data.getStringExtra(NativeVideoViewerActivity.RESULT_MEDIA_ID);
                int positionMs = Math.max(0, data.getIntExtra(NativeVideoViewerActivity.RESULT_POSITION_MS, 0));
                int durationMs = Math.max(0, data.getIntExtra(NativeVideoViewerActivity.RESULT_DURATION_MS, 0));
                if (nativeVideoPlayer != null) nativeVideoPlayer.synchronizeViewerPosition(mediaId, positionMs);
                if (webView != null) {
                    String script = "window.__jetNativeVideoViewerClosed&&window.__jetNativeVideoViewerClosed("
                            + JSONObject.quote(mediaId == null ? "" : mediaId) + ","
                            + positionMs + "," + durationMs + ");";
                    webView.post(() -> webView.evaluateJavascript(script, null));
                }
            }
            return;
        }
        if (attachmentPicker != null && attachmentPicker.handles(requestCode)) {
            attachmentPicker.onActivityResult(requestCode, resultCode, data);
            return;
        }
        if (archiveController != null && archiveController.handles(requestCode)) {
            archiveController.onActivityResult(requestCode, resultCode, data);
            return;
        }
        if (imagePicker != null) imagePicker.onActivityResult(requestCode, resultCode, data);
    }

    @Override
    public void onBackPressed() {
        if (nativeVideoPlayer != null && nativeVideoPlayer.isOpen()) {
            nativeVideoPlayer.close();
            return;
        }
        if (browserModeController != null && browserModeController.isOpen()) {
            browserModeController.handleBack();
            return;
        }
        if (toolPageController != null && toolPageController.isOpen()) {
            toolPageController.handleBack();
            return;
        }

        if (webView == null) {
            super.onBackPressed();
            return;
        }

        webView.evaluateJavascript(
                "(typeof returnToStandardHome === 'function') ? returnToStandardHome() : false",
                value -> {
                    if (!"true".equals(value)) MainActivity.super.onBackPressed();
                }
        );
    }

    @Override protected void onPause(){
        if(nativeVideoPlayer!=null)nativeVideoPlayer.onHostPause();
        if(toolPageController!=null)toolPageController.pause();
        if(browserModeController!=null)browserModeController.pause();
        if(webView!=null)webView.onPause();
        super.onPause();
    }
    @Override
    protected void onResume() {
        super.onResume();
        if (edgeToEdge != null) {
            edgeToEdge.hideStatusBar();
            edgeToEdge.synchronizeInsets();
        }
        if (webView != null) {
            webView.onResume();
            webView.post(() -> webView.evaluateJavascript(
                    "window.dispatchEvent(new Event('jetnote:app-resume'));", null));
        }
        if (toolPageController != null) toolPageController.resume();
        if (browserModeController != null) browserModeController.resume();
        if (nativeVideoPlayer != null) nativeVideoPlayer.onHostResume();
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        // Returning from a picker/dialog may restore the system status bar.
        // Re-apply Jet Note's status-bar-only immersive mode when the app
        // regains focus; the bottom navigation bar is deliberately untouched.
        if (hasFocus && edgeToEdge != null) {
            edgeToEdge.hideStatusBar();
            edgeToEdge.synchronizeInsets();
        }
    }

    @Override
    protected void onDestroy() {
        frontendIsReady=false;
        if (nativeVideoPlayer != null) nativeVideoPlayer.close();
        if(mediaWriter!=null)mediaWriter.destroy();
        if (toolPageController != null) toolPageController.destroy();
        if (browserModeController != null) browserModeController.destroy();
        if (attachmentPicker != null) attachmentPicker.destroy();
        if (archiveController != null) archiveController.destroy();
        if (imagePicker != null) imagePicker.destroy();
        if (webView != null) {
            webView.removeJavascriptInterface("JetNoteNative");
            webView.setOnApplyWindowInsetsListener(null);
            webView.setWebChromeClient(null);
            webView.setWebViewClient(null);
            webView.stopLoading();
            webView.destroy();
            webView = null;
        }
        super.onDestroy();
    }
}
