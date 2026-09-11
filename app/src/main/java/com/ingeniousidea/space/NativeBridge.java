package com.ingeniousidea.space;

import android.app.Activity;
import android.webkit.JavascriptInterface;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.Locale;

/** Narrow JavaScript bridge exposed only to Jet Note's bundled local page. */
final class NativeBridge {
    private final Activity activity;
    private final DictionaryController dictionary;
    private final MediaWriteController mediaWriter;
    private final Runnable ready;
    private final AttachmentPickerController picker;
    private final AttachmentStore store;
    private final JetNoteArchiveController archive;
    private final NativeVideoPlayer videoPlayer;

    NativeBridge(
            Activity activity,
            DictionaryController dictionary,
            AttachmentPickerController picker,
            AttachmentStore store,
            JetNoteArchiveController archive, MediaWriteController mediaWriter, NativeVideoPlayer videoPlayer, Runnable ready
    ) {
        this.activity = activity;
        this.dictionary = dictionary;this.mediaWriter=mediaWriter;this.ready=ready;
        this.picker = picker;
        this.store = store;
        this.archive = archive;
        this.videoPlayer = videoPlayer;
    }

    @JavascriptInterface public void frontendReady(){ready.run();}
    /** Chinese phones default to Chinese; all other system languages default to English. */
    @JavascriptInterface public String getDeviceLanguage(){
        return "zh".equalsIgnoreCase(Locale.getDefault().getLanguage()) ? "zh" : "en";
    }
    @JavascriptInterface public String getWebCacheSettings(){return dictionary.getWebCacheSettings();}
    @JavascriptInterface public void setWebCacheClosePolicy(boolean clearOnClose){dictionary.setWebCacheClosePolicy(clearOnClose);}
    @JavascriptInterface public void setWebCacheLimitMb(int limitMb){dictionary.setWebCacheLimitMb(limitMb);}
    @JavascriptInterface public void clearWebCache(){dictionary.clearWebCache();}
    @JavascriptInterface public boolean manageWebCacheNow(){return dictionary.manageWebCacheNow();}
    @JavascriptInterface public String beginMedia(String path){return mediaWriter.begin(path);}
    @JavascriptInterface public boolean appendMedia(String token,String data){return mediaWriter.append(token,data);}
    @JavascriptInterface public String finishMedia(String token,String sha){return mediaWriter.finish(token,sha);}
    @JavascriptInterface public void cancelMedia(String token){mediaWriter.cancel(token);}
    @JavascriptInterface public String describeMedia(String path){try{return store.describe(path).toString();}catch(Exception e){return MediaWriteController.error(e);}}

    /** Read and normalize the packaged, immutable workspace policy. */
    @JavascriptInterface
    public String getDemoConfig() {
        JSONObject result = new JSONObject();
        try {
            JSONObject asset = readDemoConfigAsset();
            // Legacy keys are accepted for old project folders, but every caller
            // receives the current explicit policy names.
            String rawLaunchMode = asset.has("launch_mode")
                    ? asset.optString("launch_mode") : asset.optString("mode_setting");
            boolean displaySwitch = asset.has("display_demo_switch")
                    ? asset.optBoolean("display_demo_switch", true)
                    : asset.optBoolean("display_in_setting", true);
            // This build only supports a non-persistent, read-only demo session.
            String policy = "read_only_session";
            result.put("launch_mode", "demo".equals(rawLaunchMode) ? "demo" : "user");
            result.put("display_demo_switch", displaySwitch);
            result.put("demo_policy", policy);
        } catch (Exception error) {
            try {
                result.put("launch_mode", "user");
                result.put("display_demo_switch", true);
                result.put("demo_policy", "read_only_session");
                result.put("error", error.getMessage() == null ? "demo-config-error" : error.getMessage());
            } catch (Exception ignored) { }
        }
        return result.toString();
    }

    /** Import app/src/main/assets/demo.jnote through the native validated importer. */
    @JavascriptInterface
    public void importBundledDemo() {
        archive.importBundledDemo();
    }

    /** End the read-only demo session without ever touching user media. */
    @JavascriptInterface
    public void releaseDemoSession() {
        videoPlayer.close();
        archive.releaseDemoSession();
    }

    private JSONObject readDemoConfigAsset() throws Exception {
        try (InputStream in = activity.getAssets().open("demo.json");
             ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            byte[] buffer = new byte[4096];
            int read;
            while ((read = in.read(buffer)) != -1) out.write(buffer, 0, read);
            return new JSONObject(new String(out.toByteArray(), StandardCharsets.UTF_8));
        }
    }

    @JavascriptInterface
    public void openDictionary(String language) {
        boolean en = "en".equalsIgnoreCase(language);
        dictionary.open("https://www.merriam-webster.com/", en ? "Dictionary" : "字典", language);
    }

    @JavascriptInterface
    public void openSentences(String language) {
        boolean en = "en".equalsIgnoreCase(language);
        dictionary.open("https://soundoftext.com/", en ? "Sentence" : "句子", language);
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
