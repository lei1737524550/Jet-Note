package com.ingeniousidea.space;

import android.app.Activity;

import java.io.File;

/** Compatibility wrapper. All real file-task work now lives in FileTaskManager. */
final class MediaDownloadController {
    private MediaDownloadController() {}

    static void saveUrl(Activity activity, String url, String userAgent, String cookie, String referer) {
        FileTaskManager.downloadUrl(activity, url, userAgent, cookie, referer);
    }

    static void saveFile(Activity activity, File source, String mimeType, String mediaType) {
        FileTaskManager.downloadFile(activity, source, mimeType, mediaType);
    }

    static void saveDataUrl(Activity activity, String dataUrl, String mediaType) {
        FileTaskManager.downloadDataUrl(activity, dataUrl, mediaType);
    }

    static void showJetNoteNotice(Activity activity, String message) {
        FileTaskManager.showFeedback(activity, message);
    }
}
