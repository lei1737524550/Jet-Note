package com.ingeniousidea.space;

import android.app.Activity;
import android.content.Intent;
import android.content.IntentFilter;
import android.os.BatteryManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import android.view.HapticFeedbackConstants;

import org.json.JSONObject;


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

    @JavascriptInterface public void frontendReady(){ready.run();}

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
    public void openTool(String url, String title, String language) {
        if (url == null || !url.startsWith("https://")) return;
        String safeTitle = title == null || title.trim().isEmpty() ? "Tool" : title.trim();
        String safeLanguage = language == null || language.trim().isEmpty() ? "en" : language.trim();
        dictionary.open(url, safeTitle, safeLanguage);
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
    public void playVideo(String archivePath) {
        videoPlayer.play(archivePath);
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
