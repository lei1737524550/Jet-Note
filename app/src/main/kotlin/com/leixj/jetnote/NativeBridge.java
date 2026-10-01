package com.leixj.jetnote;

import android.app.Activity;
import android.content.Intent;
import android.content.IntentFilter;
import android.net.Uri;

import android.os.BatteryManager;
import android.os.Bundle;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import android.view.HapticFeedbackConstants;

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
    private final MediaWriteController mediaWriter;
    private final Runnable ready;
    private final AttachmentPickerController picker;
    private final AttachmentStore store;
    private final NativeVideoPlayer videoPlayer;
    private final BackupFileController backupFiles;

    NativeBridge(
            Activity activity,
            WebView webView,
            AttachmentPickerController picker,
            AttachmentStore store,
            MediaWriteController mediaWriter, NativeVideoPlayer videoPlayer, BackupFileController backupFiles, Runnable ready
    ) {
        this.activity = activity;
        this.webView = webView;
        this.mediaWriter=mediaWriter;this.ready=ready;
        this.picker = picker;
        this.store = store;
        this.videoPlayer = videoPlayer;
        this.backupFiles = backupFiles;
    }



    @JavascriptInterface public void exportJetNote(String payload) { activity.runOnUiThread(() -> backupFiles.exportArchive(payload)); }
    @JavascriptInterface public void importJetNote() { activity.runOnUiThread(backupFiles::chooseArchive); }
    @JavascriptInterface public void commitImportMedia(String token) { backupFiles.commitImportMedia(token); }
    @JavascriptInterface public void finalizeImport(String token) { backupFiles.finalizeImport(token); }
    @JavascriptInterface public void rollbackImport(String token) { backupFiles.rollbackImport(token); }
    @JavascriptInterface public String getBundledConfigJson() {
        try { return RuntimeConfigStore.readBundled(activity); }
        catch (Exception error) { throw new IllegalStateException("Cannot read bundled configuration", error); }
    }

    @JavascriptInterface public String getRuntimeConfigJson() {
        return RuntimeConfigStore.readEffective(activity);
    }

    @JavascriptInterface public String getUiLanguageCode() {
        return UiLanguage.languageCode(activity);
    }

    @JavascriptInterface public boolean setUiLanguageCode(String languageCode) {
        return UiLanguage.setLanguageCode(activity, languageCode);
    }

    @JavascriptInterface public String getUiLanguageJson() {
        return UiLanguage.json(activity);
    }

    /**
     * Compatibility entry point retained for older bundled pages. Language is
     * persisted synchronously; the current WebView applies the new catalog in
     * place, so recreating the Activity here would race/destroy the JS caller.
     */
    @JavascriptInterface public boolean setUiLanguageAndRelaunch(String languageCode) {
        return UiLanguage.setLanguageCode(activity, languageCode);
    }

    /** Compatibility bridge for older bundled pages. */
    @JavascriptInterface public boolean switchUiLanguageAndRelaunch() {
        String target = "zh".equals(UiLanguage.languageCode(activity)) ? "en" : "zh";
        return setUiLanguageAndRelaunch(target);
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
            MediaFileManager.saveTextExport(activity, "config.json", "application/json", effective);
            return true;
        } catch (Exception error) {
            return false;
        }
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
    public void pickAttachments(String requestId, String type, boolean multiple) {
        picker.choose(requestId, type, multiple);
    }

    @JavascriptInterface
    public void downloadViewerMedia(String source, String mediaType) {
        final String safeType = "video".equals(mediaType) ? "video" : "image";
        if (source == null || source.trim().isEmpty()) {
            MediaFileManager.downloadFile(activity, null, null, safeType);
            return;
        }
        final String value = source.trim();
        activity.runOnUiThread(() -> {
            try {
                if (value.startsWith("data:")) {
                    MediaFileManager.downloadDataUrl(activity, value, safeType);
                    return;
                }
                final String appAssetsPrefix = "https://appassets.androidplatform.net/";
                String archivePath = null;
                if (value.startsWith(appAssetsPrefix)) archivePath = value.substring(appAssetsPrefix.length());
                if (archivePath != null) {
                    java.io.File file = store.fileForArchivePath(archivePath);
                    String mime = file == null ? null : store.mimeForFileName(file.getName());
                    MediaFileManager.downloadFile(activity, file, mime, safeType);
                    return;
                }
                MediaFileManager.downloadFile(activity, null, null, safeType);
            } catch (Exception ignored) {
                MediaFileManager.downloadFile(activity, null, null, safeType);
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
    public void setVideoCropMode(boolean crop) {
        videoPlayer.setCropMode(crop);
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
    public void confirmScrollVideoFrame(String token) {
        videoPlayer.confirmScrollVideoFrame(token);
    }

    @JavascriptInterface
    public void captureVideoFrame(String token) {
        videoPlayer.captureVideoFrame(token);
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

}
