package com.ingeniousidea.space;

import android.webkit.JavascriptInterface;

import org.json.JSONObject;

/** Narrow JavaScript bridge exposed only to Jet Note's bundled local page. */
final class NativeBridge {
    private final DictionaryController dictionary;
    private final MediaWriteController mediaWriter;
    private final Runnable ready;
    private final AttachmentPickerController picker;
    private final AttachmentStore store;
    private final JetNoteArchiveController archive;

    NativeBridge(
            DictionaryController dictionary,
            AttachmentPickerController picker,
            AttachmentStore store,
            JetNoteArchiveController archive, MediaWriteController mediaWriter, Runnable ready
    ) {
        this.dictionary = dictionary;this.mediaWriter=mediaWriter;this.ready=ready;
        this.picker = picker;
        this.store = store;
        this.archive = archive;
    }

    @JavascriptInterface public void frontendReady(){ready.run();}
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
