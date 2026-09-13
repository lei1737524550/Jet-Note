package com.ingeniousidea.space;

import android.app.Activity;
import android.content.Intent;
import android.content.IntentFilter;
import android.os.BatteryManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import android.view.HapticFeedbackConstants;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;


/** Narrow JavaScript bridge exposed only to Jet Note's bundled local page. */
final class NativeBridge {
    private final Activity activity;
    private final WebView webView;
    private int videoHapticGuardGeneration = 0;
    private final DictionaryController dictionary;
    private final MediaWriteController mediaWriter;
    private final Runnable ready;
    private final AttachmentPickerController picker;
    private final AttachmentStore store;
    private final JetNoteArchiveController archive;
    private final NativeVideoPlayer videoPlayer;

    NativeBridge(
            Activity activity,
            WebView webView,
            DictionaryController dictionary,
            AttachmentPickerController picker,
            AttachmentStore store,
            JetNoteArchiveController archive, MediaWriteController mediaWriter, NativeVideoPlayer videoPlayer, Runnable ready
    ) {
        this.activity = activity;
        this.webView = webView;
        this.dictionary = dictionary;this.mediaWriter=mediaWriter;this.ready=ready;
        this.picker = picker;
        this.store = store;
        this.archive = archive;
        this.videoPlayer = videoPlayer;
    }


    private static final String DEBUG_PREFS = "jet_note_debug_config";
    private static final String DEBUG_CURRENT = "current";
    private static final String DEBUG_PREVIOUS = "previous";

    private String bundledConfig() throws Exception {
        try (InputStream in = activity.getAssets().open("config.json")) {
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            byte[] buffer = new byte[8192]; int n;
            while ((n = in.read(buffer)) != -1) out.write(buffer, 0, n);
            return out.toString("UTF-8");
        }
    }

    @JavascriptInterface public String getRuntimeConfigJson() {
        try {
            android.content.SharedPreferences prefs =
                    activity.getSharedPreferences(DEBUG_PREFS, Activity.MODE_PRIVATE);
            String saved = prefs.getString(DEBUG_CURRENT, null);
            if (saved != null && !saved.trim().isEmpty()) {
                try {
                    new JSONObject(saved);
                    return saved;
                } catch (Exception invalidRuntimeConfiguration) {
                    // Runtime config is recoverable state. Never return malformed JSON to
                    // the frontend; discard it and fall back to the shipped configuration.
                    prefs.edit().remove(DEBUG_CURRENT).apply();
                }
            }
            return bundledConfig();
        } catch (Exception error) { return "{}"; }
    }

    @JavascriptInterface public boolean setRuntimeConfigJson(String json) {
        try {
            JSONObject parsed = new JSONObject(json);
            String normalized = parsed.toString(2);
            android.content.SharedPreferences prefs = activity.getSharedPreferences(DEBUG_PREFS, Activity.MODE_PRIVATE);
            String current = prefs.getString(DEBUG_CURRENT, null);
            if (current == null) current = bundledConfig();
            return prefs.edit().putString(DEBUG_PREVIOUS, current).putString(DEBUG_CURRENT, normalized).commit();
        } catch (Exception error) { return false; }
    }

    @JavascriptInterface public boolean undoRuntimeConfigJson() {
        try {
            android.content.SharedPreferences prefs = activity.getSharedPreferences(DEBUG_PREFS, Activity.MODE_PRIVATE);
            String previous = prefs.getString(DEBUG_PREVIOUS, null);
            if (previous == null) return false;
            String current = prefs.getString(DEBUG_CURRENT, null);
            android.content.SharedPreferences.Editor edit = prefs.edit().putString(DEBUG_CURRENT, previous);
            if (current != null) edit.putString(DEBUG_PREVIOUS, current); else edit.remove(DEBUG_PREVIOUS);
            return edit.commit();
        } catch (Exception error) { return false; }
    }

    @JavascriptInterface public void frontendReady(){ready.run();}

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
        dictionary.open(url, safeTitle, safeLanguage, backgroundColor, borderColor);
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
