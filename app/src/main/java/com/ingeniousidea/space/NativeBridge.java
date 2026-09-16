package com.ingeniousidea.space;

import android.app.Activity;
import android.content.Intent;
import android.content.IntentFilter;
import android.os.BatteryManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import android.view.HapticFeedbackConstants;
import android.view.ViewTreeObserver;
import android.graphics.Color;
import android.widget.FrameLayout;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;


/** Narrow JavaScript bridge exposed only to Jet Note's bundled local page. */
final class NativeBridge {
    private final Activity activity;
    private final WebView webView;
    private int videoHapticGuardGeneration = 0;
    private final ToolPageController toolPages;
    private final BrowserModeController browserPages;
    private final MediaWriteController mediaWriter;
    private final Runnable ready;
    private final AttachmentPickerController picker;
    private final AttachmentStore store;
    private final JetNoteArchiveController archive;
    private final NativeVideoPlayer videoPlayer;
    private FrameLayout pendingTransitionCover;
    private String pendingTransitionTarget;

    NativeBridge(
            Activity activity,
            WebView webView,
            ToolPageController toolPages,
            BrowserModeController browserPages,
            AttachmentPickerController picker,
            AttachmentStore store,
            JetNoteArchiveController archive, MediaWriteController mediaWriter, NativeVideoPlayer videoPlayer, Runnable ready
    ) {
        this.activity = activity;
        this.webView = webView;
        this.toolPages = toolPages;this.browserPages = browserPages;this.mediaWriter=mediaWriter;this.ready=ready;
        this.picker = picker;
        this.store = store;
        this.archive = archive;
        this.videoPlayer = videoPlayer;
    }


    @JavascriptInterface public String getBundledConfigJson() {
        try { return RuntimeConfigStore.readBundled(activity); }
        catch (Exception error) { return "{}"; }
    }

    @JavascriptInterface public String getRuntimeConfigJson() {
        return RuntimeConfigStore.readEffective(activity);
    }

    @JavascriptInterface public boolean setRuntimeConfigJson(String json) {
        return RuntimeConfigStore.saveRuntime(activity, json);
    }

    @JavascriptInterface public String listRuntimeConfigSectionFilesJson() {
        return RuntimeConfigStore.listBundledSectionsJson(activity);
    }

    @JavascriptInterface public String getRuntimeConfigSectionJson(String section) {
        return RuntimeConfigStore.readEffectiveSection(activity, section);
    }

    @JavascriptInterface public String getRuntimeConfigSectionOverridesJson(String section) {
        return RuntimeConfigStore.readOverrideSection(activity, section);
    }

    @JavascriptInterface public boolean setRuntimeConfigSectionJson(String section, String json) {
        return RuntimeConfigStore.saveRuntimeSection(activity, section, json);
    }

    /** Persist Browser Mode natively so MainActivity can route before Home is loaded. */
    @JavascriptInterface public void setBrowserModeEnabled(boolean enabled) {
        BrowserModeStore.setEnabled(activity, enabled);
    }

    @JavascriptInterface public boolean isBrowserModeEnabled() {
        return BrowserModeStore.isEnabled(activity);
    }

    /** Editable Debug Post copy of the bundled README. */
    @JavascriptInterface public String getRuntimeReadmeText() {
        File file = new File(activity.getFilesDir(), "debug_README.txt");
        try {
            if (file.exists()) {
                try (InputStream in = new java.io.FileInputStream(file)) {
                    return readUtf8(in);
                }
            }
            try (InputStream in = activity.getAssets().open("README.txt")) {
                return readUtf8(in);
            }
        } catch (Exception error) {
            return "";
        }
    }

    @JavascriptInterface public boolean setRuntimeReadmeText(String text) {
        File file = new File(activity.getFilesDir(), "debug_README.txt");
        try (FileOutputStream out = new FileOutputStream(file, false)) {
            out.write((text == null ? "" : text).getBytes(StandardCharsets.UTF_8));
            out.flush();
            return true;
        } catch (Exception error) {
            return false;
        }
    }

    private static String readUtf8(InputStream in) throws Exception {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        byte[] buffer = new byte[8192];
        int count;
        while ((count = in.read(buffer)) != -1) out.write(buffer, 0, count);
        return out.toString(StandardCharsets.UTF_8.name());
    }

    @JavascriptInterface public boolean undoRuntimeConfigJson() {
        return RuntimeConfigStore.undoRuntime(activity);
    }

    /**
     * Re-read/validate the current effective config and rebuild the whole Jet Note
     * activity stack. This intentionally creates a fresh WebView so JS config
     * promises, CSS variables, toolbox state and other config-derived runtime
     * state cannot survive the reload.
     */
    @JavascriptInterface public void relaunchForConfigReload() {
        activity.runOnUiThread(() -> {
            // Force validation now. RuntimeConfigStore itself has no in-memory cache;
            // this also discards a stale/corrupt runtime override when necessary.
            RuntimeConfigStore.readEffective(activity);

            Intent launchIntent = activity.getPackageManager()
                    .getLaunchIntentForPackage(activity.getPackageName());
            if (launchIntent == null) {
                activity.recreate();
                return;
            }

            launchIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK
                    | Intent.FLAG_ACTIVITY_CLEAR_TASK
                    | Intent.FLAG_ACTIVITY_CLEAR_TOP);
            activity.startActivity(launchIntent);
            activity.finishAffinity();
        });
    }

    @JavascriptInterface public boolean saveEffectiveConfigJsonToDownloads() {
        try {
            String effective = RuntimeConfigStore.readEffective(activity);
            new JSONObject(effective);
            FileTaskManager.saveTextExport(activity, "config.json", "application/json", effective);
            return true;
        } catch (Exception error) {
            return false;
        }
    }

    @JavascriptInterface public void frontendReady(){ready.run();}

    /**
     * Run a reusable X -> target frozen split transition over the current local page.
     * The destination is already laid out in the WebView; this method captures it
     * once as a bitmap, so no destination DOM is cloned or mutated for animation.
     */
    /**
     * Phase 1 of a local WebView A -> B transition. Install the opaque native
     * background BEFORE JavaScript mutates the DOM from A to B. Only after the
     * cover has participated in a native pre-draw do we tell JavaScript that it
     * is safe to prepare the target.
     */
    @JavascriptInterface public void beginFrozenTransitionCover(String targetKey) {
        beginFrozenTransitionCoverFromZAxisHeight(targetKey, webView.getZ());
    }

    @JavascriptInterface public void beginFrozenTransitionCoverFromZAxisHeight(String targetKey, double sourceZAxisHeight) {
        activity.runOnUiThread(() -> {
            try {
                if (!(webView.getParent() instanceof FrameLayout)) return;
                FrameLayout root = (FrameLayout) webView.getParent();
                if (pendingTransitionCover != null) {
                    root.removeView(pendingTransitionCover);
                    pendingTransitionCover = null;
                }
                JSONObject effective = new JSONObject(RuntimeConfigStore.readEffective(activity));
                int color;
                try { color = Color.parseColor(effective.optString("global_set_background", "#AED194")); }
                catch (Exception ignored) { color = Color.rgb(174, 209, 148); }
                final String resolved = (targetKey == null || targetKey.trim().isEmpty()) ? "x_to_home" : targetKey.trim();
                ZAxisHeights.TransitionHeights heights = ZAxisHeights.between((float) sourceZAxisHeight, webView.getZ());
                FrameLayout cover = new FrameLayout(activity);
                cover.setBackgroundColor(color);
                cover.setClickable(true);
                cover.setFocusable(true);
                cover.setZ(heights.background);
                root.addView(cover, new FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));
                pendingTransitionCover = cover;
                pendingTransitionTarget = resolved;
                ViewTreeObserver.OnPreDrawListener[] listener = new ViewTreeObserver.OnPreDrawListener[1];
                listener[0] = () -> {
                    ViewTreeObserver observer = cover.getViewTreeObserver();
                    if (observer.isAlive()) observer.removeOnPreDrawListener(listener[0]);
                    root.postOnAnimation(() -> webView.evaluateJavascript(
                            "try{window.dispatchEvent(new CustomEvent('jetnote:frozen-cover-ready',{detail:{target:'" + resolved + "'}}));}catch(e){}", null));
                    return true;
                };
                cover.getViewTreeObserver().addOnPreDrawListener(listener[0]);
                cover.invalidate();
                root.invalidate();
            } catch (Exception ignored) { }
        });
    }

    /** Complete a native toolbox_* -> Editor source mutation only after the X->Editor cover is visible. */
    @JavascriptInterface public void completeNativeSourceToEditor() {
        activity.runOnUiThread(() -> toolPages.completeCloseToEditorBehindTransitionCover());
    }

    /** Phase 2: target DOM is now stable but still hidden by the native cover. */
    @JavascriptInterface public void runPreparedFrozenSplitTransition(String targetKey) {
        activity.runOnUiThread(() -> {
            final FrameLayout oldCover = pendingTransitionCover;
            pendingTransitionCover = null;
            pendingTransitionTarget = null;
            final String resolvedTarget =
                    (targetKey == null || targetKey.trim().isEmpty()) ? "x_to_home" : targetKey.trim();

            // The JS target mutation can change page geometry on the same UI turn.
            // Capturing immediately here used the previous layout in some returns
            // from Editor, so the two frozen halves could merge to a size that did
            // not match the first real Home frame. Wait until the target WebView has
            // completed layout and is about to draw, then capture that exact geometry.
            final ViewTreeObserver observer = webView.getViewTreeObserver();
            final ViewTreeObserver.OnPreDrawListener[] listener =
                    new ViewTreeObserver.OnPreDrawListener[1];
            listener[0] = () -> {
                ViewTreeObserver current = webView.getViewTreeObserver();
                if (current.isAlive()) current.removeOnPreDrawListener(listener[0]);
                webView.postOnAnimation(() -> {
                    runFrozenSplitTransitionFromZAxisHeight(resolvedTarget, webView.getZ());
                    // The new transition installs an opaque background and bitmap
                    // layers synchronously before this preparation cover is removed.
                    if (oldCover != null && oldCover.getParent() instanceof FrameLayout) {
                        ((FrameLayout) oldCover.getParent()).removeView(oldCover);
                    }
                });
                return true;
            };
            observer.addOnPreDrawListener(listener[0]);
            webView.requestLayout();
            webView.invalidate();
        });
    }

    @JavascriptInterface public void runFrozenSplitTransition(String targetKey) {
        runFrozenSplitTransitionFromZAxisHeight(targetKey, webView.getZ());
    }

    /**
     * Variant used when A was a native overlay that has already been removed
     * before B is captured. The caller supplies A's real semantic Z-axis height;
     * B is always the current main WebView and keeps its own existing height.
     */
    @JavascriptInterface public void runFrozenSplitTransitionFromZAxisHeight(String targetKey, double sourceZAxisHeight) {
        activity.runOnUiThread(() -> {
            try {
                if (!(webView.getParent() instanceof android.widget.FrameLayout)) return;
                JSONObject effective = new JSONObject(RuntimeConfigStore.readEffective(activity));
                final String resolvedTarget =
                        (targetKey == null || targetKey.trim().isEmpty()) ? "x_to_home" : targetKey.trim();
                FrozenSplitTransition transition = new FrozenSplitTransition(
                        (android.widget.FrameLayout) webView.getParent(),
                        webView,
                        effective,
                        resolvedTarget,
                        (float) sourceZAxisHeight,
                        webView.getZ());
                transition.run(() -> {
                    // The bitmap layers are already gone at this point. For Editor,
                    // explicitly renegotiate WebView input before JS restores the
                    // textarea selection/caret. This is a safeguard; the transition
                    // itself no longer hides/disables the WebView.
                    if ("x_to_editor".equals(resolvedTarget) && webView instanceof RichContentWebView) {
                        ((RichContentWebView) webView).restoreInputAfterFrozenTransition();
                    }
                    webView.evaluateJavascript(
                            "try{window.dispatchEvent(new CustomEvent('jetnote:frozen-split-complete',{detail:{target:'" +
                                    resolvedTarget +
                                    "'}}));}catch(e){}",
                            null);
                });
            } catch (Exception ignored) {
                // Transition failure must never block the already-rendered target page.
            }
        });
    }

    /** Sync Browser res-Filter into the reusable Tool WebView host. */
    @JavascriptInterface
    public void setGetSourceExtensionFilterJson(String json) {
        toolPages.setGetSourceExtensionFilterJson(json);
        browserPages.setGetSourceExtensionFilterJson(json);
    }

    /** Enable IME rich-image commits only while the Post Composer textarea is focused. */
    @JavascriptInterface
    public void setPostComposerImagePasteTargetActive(boolean active) {
        activity.runOnUiThread(() -> {
            if (webView instanceof RichContentWebView) {
                ((RichContentWebView) webView).setPostComposerPasteTargetActive(active);
            }
        });
    }

    /** Remove a newly imported attachment that the frontend rejected before it entered a draft. */
    @JavascriptInterface
    public void discardMedia(String archivePath) {
        try { store.deleteArchivePath(archivePath); } catch (Exception ignored) { }
    }

    /** Returns Android's current battery percentage, or -1 if unavailable. */
    @JavascriptInterface
    public int getBatteryPercentage() {
        try {
            Intent batteryStatus = activity.registerReceiver(
                    null, new IntentFilter(Intent.ACTION_BATTERY_CHANGED));
            if (batteryStatus == null) return -1;
            int level = batteryStatus.getIntExtra(BatteryManager.EXTRA_LEVEL, -1);
            int scale = batteryStatus.getIntExtra(BatteryManager.EXTRA_SCALE, -1);
            if (level < 0 || scale <= 0) return -1;
            return Math.max(0, Math.min(100, Math.round(level * 100f / scale)));
        } catch (Exception ignored) {
            return -1;
        }
    }

    @JavascriptInterface
    public void hapticLongPress() {
        activity.runOnUiThread(() ->
                activity.getWindow().getDecorView().performHapticFeedback(HapticFeedbackConstants.LONG_PRESS));
    }

    /**
     * Temporarily suppress WebView's built-in long-press haptic only while a
     * video gesture is in progress. Other WebView interactions keep their
     * normal Android haptic behaviour. The generation guard plus timeout makes
     * sure an interrupted gesture cannot leave haptics disabled globally.
     */
    @JavascriptInterface
    public void setVideoDefaultHapticSuppressed(boolean suppressed) {
        activity.runOnUiThread(() -> {
            final int generation = ++videoHapticGuardGeneration;
            webView.setHapticFeedbackEnabled(!suppressed);
            if (suppressed) {
                webView.postDelayed(() -> {
                    if (generation == videoHapticGuardGeneration) {
                        webView.setHapticFeedbackEnabled(true);
                    }
                }, 2000L);
            }
        });
    }

    @JavascriptInterface public String beginMedia(String path){return mediaWriter.begin(path);}
    @JavascriptInterface public boolean appendMedia(String token,String data){return mediaWriter.append(token,data);}
    @JavascriptInterface public String finishMedia(String token,String sha){return mediaWriter.finish(token,sha);}
    @JavascriptInterface public void cancelMedia(String token){mediaWriter.cancel(token);}
    @JavascriptInterface public String describeMedia(String path){try{return store.describe(path).toString();}catch(Exception e){return MediaWriteController.error(e);}}


    @JavascriptInterface
    public void openTool(String url, String title, String language, String backgroundColor, String borderColor) {
        if (url == null || !url.startsWith("https://")) return;
        String safeTitle = title == null || title.trim().isEmpty() ? "Tool" : title.trim();
        String safeLanguage = language == null || language.trim().isEmpty() ? "en" : language.trim();
        toolPages.open(url, safeTitle, safeLanguage, backgroundColor, borderColor);
    }

    @JavascriptInterface
    public void openToolWithFallback(
            String primaryUrl,
            String fallbackUrl,
            String title,
            String language,
            String backgroundColor,
            String borderColor,
            int timeoutMs
    ) {
        if (primaryUrl == null || !primaryUrl.startsWith("https://")) return;
        if (fallbackUrl == null || !fallbackUrl.startsWith("https://")) {
            openTool(primaryUrl, title, language, backgroundColor, borderColor);
            return;
        }
        String safeTitle = title == null || title.trim().isEmpty() ? "Tool" : title.trim();
        String safeLanguage = language == null || language.trim().isEmpty() ? "en" : language.trim();
        toolPages.openWithFallback(
                primaryUrl,
                fallbackUrl,
                safeTitle,
                safeLanguage,
                backgroundColor,
                borderColor,
                timeoutMs
        );
    }


    /**
     * Shared toolbox-page core with explicit primary/fallback titles and a
     * Browser Mode flag. Browser Mode bypasses New Post integration while
     * retaining the same ToolPageController, fallback and Get Source stack.
     */
    @JavascriptInterface
    public void openToolWithFallbackMode(
            String primaryUrl,
            String fallbackUrl,
            String primaryTitle,
            String fallbackTitle,
            String language,
            String backgroundColor,
            String borderColor,
            int timeoutMs,
            boolean browserMode
    ) {
        if (primaryUrl == null || !primaryUrl.startsWith("https://")) return;
        if (fallbackUrl == null || !fallbackUrl.startsWith("https://")) {
            String safeTitle = primaryTitle == null || primaryTitle.trim().isEmpty() ? "Tool" : primaryTitle.trim();
            String safeLanguage = language == null || language.trim().isEmpty() ? "en" : language.trim();
            if (browserMode) browserPages.open(primaryUrl, safeTitle, safeLanguage, backgroundColor, borderColor, true);
            else toolPages.open(primaryUrl, safeTitle, safeLanguage, backgroundColor, borderColor, false);
            return;
        }
        String safePrimaryTitle = primaryTitle == null || primaryTitle.trim().isEmpty() ? "Tool" : primaryTitle.trim();
        String safeFallbackTitle = fallbackTitle == null || fallbackTitle.trim().isEmpty() ? safePrimaryTitle : fallbackTitle.trim();
        String safeLanguage = language == null || language.trim().isEmpty() ? "en" : language.trim();
        if (browserMode) browserPages.openWithFallback(
                primaryUrl,
                fallbackUrl,
                safePrimaryTitle,
                safeFallbackTitle,
                safeLanguage,
                backgroundColor,
                borderColor,
                timeoutMs,
                true
        );
        else toolPages.openWithFallback(
                primaryUrl, fallbackUrl, safePrimaryTitle, safeFallbackTitle, safeLanguage,
                backgroundColor, borderColor, timeoutMs, false
        );
    }

    @JavascriptInterface
    public void pickAttachments(String requestId, String type, boolean multiple) {
        picker.choose(requestId, type, multiple);
    }

    @JavascriptInterface
    public String importLegacyDataUrl(String dataUrl, String originalName) {
        try {
            return store.importLegacyDataUrl(dataUrl, originalName).toString();
        } catch (Exception error) {
            JSONObject result = new JSONObject();
            try {
                result.put("error", error.getMessage() == null ? "legacy-migration-failed" : error.getMessage());
            } catch (Exception ignored) { }
            return result.toString();
        }
    }


    @JavascriptInterface
    public void downloadViewerMedia(String source, String mediaType) {
        final String safeType = "video".equals(mediaType) ? "video" : "image";
        if (source == null || source.trim().isEmpty()) {
            MediaDownloadController.saveFile(activity, null, null, safeType);
            return;
        }
        final String value = source.trim();
        activity.runOnUiThread(() -> {
            try {
                if (value.startsWith("data:")) {
                    MediaDownloadController.saveDataUrl(activity, value, safeType);
                    return;
                }
                final String appAssetsPrefix = "https://appassets.androidplatform.net/";
                final String localPrefix = "https://jetnote.local/";
                String archivePath = null;
                if (value.startsWith(appAssetsPrefix)) archivePath = value.substring(appAssetsPrefix.length());
                else if (value.startsWith(localPrefix)) archivePath = value.substring(localPrefix.length());
                if (archivePath != null) {
                    java.io.File file = store.fileForArchivePath(archivePath);
                    String mime = file == null ? null : store.mimeForFileName(file.getName());
                    MediaDownloadController.saveFile(activity, file, mime, safeType);
                    return;
                }
                MediaDownloadController.saveFile(activity, null, null, safeType);
            } catch (Exception ignored) {
                MediaDownloadController.saveFile(activity, null, null, safeType);
            }
        });
    }

    @JavascriptInterface
    public void downloadViewerImage(String source) {
        downloadViewerMedia(source, "image");
    }

    @JavascriptInterface
    public void openVideoViewer(String archivePath, String mediaId, double startMs) {
        activity.runOnUiThread(() -> {
            try {
                java.io.File file = store.fileForArchivePath(archivePath);
                if (file == null || !file.isFile()) return;
                Intent intent = new Intent(activity, NativeVideoViewerActivity.class);
                intent.putExtra(NativeVideoViewerActivity.EXTRA_FILE_PATH, file.getAbsolutePath());
                intent.putExtra(NativeVideoViewerActivity.EXTRA_MEDIA_ID, mediaId == null ? "" : mediaId);
                intent.putExtra(NativeVideoViewerActivity.EXTRA_START_MS,
                        Math.max(0, (int) Math.min(Integer.MAX_VALUE, Math.round(startMs))));
                activity.startActivityForResult(intent, NativeVideoViewerActivity.REQUEST_CODE);
            } catch (Exception ignored) { }
        });
    }

    @JavascriptInterface
    public void playVideoInline(String archivePath, String mediaId, double left, double top, double width, double height, double devicePixelRatio) {
        videoPlayer.playInline(archivePath, mediaId, left, top, width, height, devicePixelRatio);
    }

    @JavascriptInterface
    public void updateVideoRect(String mediaId, double left, double top, double width, double height, double devicePixelRatio) {
        videoPlayer.updateRect(mediaId, left, top, width, height, devicePixelRatio);
    }

    @JavascriptInterface
    public void setVideoSurfaceRightEdgeGestureYieldPercent(double percent) {
        videoPlayer.setRightEdgeGestureYieldPercent(percent);
    }

    @JavascriptInterface
    public void setVideoOverlayAllowed(boolean allowed) {
        videoPlayer.setOverlayAllowed(allowed);
    }

    @JavascriptInterface
    public void beginVideoSeek(String mediaId, double fraction) {
        videoPlayer.beginSeek(mediaId, fraction);
    }

    @JavascriptInterface
    public void endVideoSeek(String mediaId, double fraction) {
        videoPlayer.endSeek(mediaId, fraction);
    }

    @JavascriptInterface
    public void stopVideo(String mediaId) {
        videoPlayer.stop(mediaId);
    }

    @JavascriptInterface
    public void exportJetNote(String payload) {
        archive.requestExport(payload);
    }

    @JavascriptInterface
    public void importJetNote(String mode) {
        archive.requestImport(mode);
    }

    @JavascriptInterface
    public void cancelArchiveOperation(String operation) {
        archive.cancelCurrentOperation(operation);
    }

    @JavascriptInterface
    public void commitImportMedia(String token) {
        archive.commitImportMedia(token);
    }

    @JavascriptInterface
    public void finalizeImport(String token) {
        archive.finalizeImport(token);
    }

    @JavascriptInterface
    public void rollbackImport(String token) {
        archive.rollbackImport(token);
    }
}
