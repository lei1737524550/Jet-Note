package com.ingeniousidea.space;

import android.app.Activity;
import android.content.ClipData;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.provider.MediaStore;
import android.webkit.WebView;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.Set;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/** Picks media for post attachments and immediately copies it into app-owned storage. */
final class AttachmentPickerController {
    private static final int REQUEST_PICK_ATTACHMENT = 1201;

    private final Activity activity;
    private final WebView webView;
    private final AttachmentStore store;
    private final ExecutorService io = Executors.newSingleThreadExecutor();

    private volatile boolean destroyed;
    private String requestId;
    private String requestedType;
    private boolean multiple;

    AttachmentPickerController(Activity activity, WebView webView, AttachmentStore store) {
        this.activity = activity;
        this.webView = webView;
        this.store = store;
    }

    void choose(String requestId, String type, boolean multiple) {
        activity.runOnUiThread(() -> chooseOnUiThread(requestId, type, multiple));
    }

    private void chooseOnUiThread(String requestId, String type, boolean multiple) {
        if (this.requestId != null) {
            dispatchError(requestId, "picker-busy");
            return;
        }

        this.requestId = requestId;
        this.requestedType = normalizeType(type);
        this.multiple = multiple;

        Intent intent;
        if ("image".equals(this.requestedType)) {
            // Images use Android's system photo picker/gallery rather than the SAF
            // document/file browser. Android 13+ gets the privacy-preserving system
            // Photo Picker; older releases fall back to the platform image gallery.
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                intent = new Intent(MediaStore.ACTION_PICK_IMAGES);
                intent.setType("image/*");
                if (multiple) {
                    intent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
                    intent.putExtra(MediaStore.EXTRA_PICK_IMAGES_MAX,
                            MediaStore.getPickImagesMaxLimit());
                }
            } else {
                intent = new Intent(Intent.ACTION_PICK, MediaStore.Images.Media.EXTERNAL_CONTENT_URI);
                intent.setType("image/*");
                intent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, multiple);
            }
            intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        } else {
            intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
            intent.addCategory(Intent.CATEGORY_OPENABLE);
            intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            intent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, multiple);
            if ("audio".equals(this.requestedType)) {
                intent.setType("*/*");
                intent.putExtra(Intent.EXTRA_MIME_TYPES,new String[]{"audio/*","application/octet-stream"});
            } else if ("video".equals(this.requestedType)) {
                intent.setType("video/*");
            } else {
                intent.setType("*/*");
            }
        }

        try {
            activity.startActivityForResult(intent, REQUEST_PICK_ATTACHMENT);
        } catch (RuntimeException error) {
            String failedRequest = this.requestId;
            clearPending();
            dispatchError(failedRequest, "picker-unavailable");
        }
    }

    boolean handles(int requestCode) {
        return requestCode == REQUEST_PICK_ATTACHMENT;
    }

    void onActivityResult(int requestCode, int resultCode, Intent data) {
        if (requestCode != REQUEST_PICK_ATTACHMENT || requestId == null) return;

        final String completedRequest = requestId;
        final String completedType = requestedType;
        final boolean allowMultiple = multiple;
        clearPending();

        if (resultCode != Activity.RESULT_OK || data == null) {
            dispatchCancelled(completedRequest);
            return;
        }

        Set<Uri> unique = new LinkedHashSet<>();
        ClipData clipData = data.getClipData();
        if (clipData != null) {
            int count = allowMultiple ? clipData.getItemCount() : Math.min(1, clipData.getItemCount());
            for (int i = 0; i < count; i++) {
                Uri uri = clipData.getItemAt(i).getUri();
                if (uri != null) unique.add(uri);
            }
        }
        Uri single = data.getData();
        if (single != null && (allowMultiple || unique.isEmpty())) unique.add(single);

        if (unique.isEmpty()) {
            dispatchCancelled(completedRequest);
            return;
        }

        ArrayList<Uri> uris = new ArrayList<>(unique);
        io.execute(() -> {
            JSONArray results = new JSONArray();
            try {
                for (Uri uri : uris) {
                    JSONObject metadata = store.importFromUri(uri, completedType);
                    results.put(metadata);
                }
                activity.runOnUiThread(() -> dispatchSuccess(completedRequest, results));
            } catch (Exception error) {
                activity.runOnUiThread(() -> dispatchError(completedRequest, "attachment-read-failed"));
            }
        });
    }

    void destroy() {
        destroyed=true;
        if (requestId != null) dispatchCancelled(requestId);
        clearPending();
        io.shutdownNow();
    }

    private void dispatchSuccess(String id, JSONArray attachments) {
        String script = "window.JetNoteNativeCallbacks&&window.JetNoteNativeCallbacks.onAttachmentsPicked("
                + JSONObject.quote(id) + "," + attachments.toString() + ");";
        if(!destroyed)webView.evaluateJavascript(script, null);
    }

    private void dispatchCancelled(String id) {
        String script = "window.JetNoteNativeCallbacks&&window.JetNoteNativeCallbacks.onAttachmentPickCancelled("
                + JSONObject.quote(id) + ");";
        if(!destroyed)webView.evaluateJavascript(script, null);
    }

    private void dispatchError(String id, String error) {
        String script = "window.JetNoteNativeCallbacks&&window.JetNoteNativeCallbacks.onAttachmentPickError("
                + JSONObject.quote(id) + "," + JSONObject.quote(error == null ? "error" : error) + ");";
        if(!destroyed)webView.evaluateJavascript(script, null);
    }

    private void clearPending() {
        requestId = null;
        requestedType = null;
        multiple = false;
    }

    private static String normalizeType(String type) {
        if ("image".equals(type) || "audio".equals(type) || "video".equals(type) || "file".equals(type)) return type;
        return "file";
    }
}
