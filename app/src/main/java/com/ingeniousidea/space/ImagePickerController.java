package com.ingeniousidea.space;

import android.app.Activity;
import android.content.Intent;
import android.content.ActivityNotFoundException;
import android.content.ClipData;
import android.net.Uri;
import android.webkit.ValueCallback;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.Set;

/** Owns a single pending chooser callback throughout its lifecycle. */
final class ImagePickerController {
    private static final int IMAGE_PICKER_REQUEST = 1001;
    private final Activity activity;
    private ValueCallback<Uri[]> filePathCallback;
    private boolean allowMultipleImages;
    ImagePickerController(Activity activity) { this.activity = activity; }
    void choose(ValueCallback<Uri[]> callback, boolean multiple, String[] acceptTypes) {
        finishImageSelection(null);
        filePathCallback = callback;
        allowMultipleImages = multiple;
        boolean imageOnly = acceptTypes != null && acceptTypes.length > 0;
        boolean audio = false;
        if (acceptTypes != null) {
            for (String raw : acceptTypes) {
                if (raw == null || raw.trim().isEmpty()) continue;
                // WebView implementations differ here: some return one comma-separated
                // accept string, others return each token separately. Normalize both so
                // .svg does not accidentally downgrade an image-only chooser to */*.
                for (String token : raw.split(",")) {
                    String type = token.trim().toLowerCase(java.util.Locale.US);
                    if (type.isEmpty()) continue;
                    boolean imageToken = type.startsWith("image/")
                            || type.equals(".svg")
                            || type.equals("application/xml")
                            || type.equals("text/xml");
                    if (!imageToken) imageOnly = false;
                    if (type.startsWith("audio/") || type.equals(".mp3")) audio = true;
                }
            }
        }
        Intent document = new Intent(Intent.ACTION_OPEN_DOCUMENT);
        document.addCategory(Intent.CATEGORY_OPENABLE);
        if (imageOnly) {
            // Do not attach image MIME filters here. On a number of Android/OEM builds,
            // image/* causes ACTION_OPEN_DOCUMENT to open a gallery-like image surface.
            // A generic */* request keeps this as the system file browser; the selected
            // file is validated by the app afterwards.
            document.setType("*/*");
        } else {
            document.setType(audio ? "audio/*" : "*/*");
            if (audio) document.putExtra(Intent.EXTRA_MIME_TYPES,
                    new String[]{"audio/*", "application/octet-stream"});
        }
        document.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, multiple);
        document.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION);
        if (!tryLaunchImagePicker(document)) {
            finishImageSelection(null);
        }
    }
    void destroy() { finishImageSelection(null); }

    private boolean tryLaunchImagePicker(Intent intent) {
        try {
            activity.startActivityForResult(intent, IMAGE_PICKER_REQUEST);
            return true;
        } catch (ActivityNotFoundException | SecurityException e) {
            return false;
        }
    }

    private void finishImageSelection(Uri[] results) {
        ValueCallback<Uri[]> callback = filePathCallback;
        filePathCallback = null;
        if (callback != null) {
            callback.onReceiveValue(results);
        }
    }

    void onActivityResult(int requestCode, int resultCode, Intent data) {

        if (requestCode != IMAGE_PICKER_REQUEST || filePathCallback == null) {
            return;
        }

        Uri[] results = null;

        if (resultCode == Activity.RESULT_OK && data != null) {
            Set<Uri> uniqueUris = new LinkedHashSet<>();

            ClipData clipData = data.getClipData();
            if (clipData != null) {
                for (int i = 0; i < clipData.getItemCount(); i++) {
                    Uri uri = clipData.getItemAt(i).getUri();
                    if (uri != null) {
                        uniqueUris.add(uri);
                        persistReadPermission(uri);
                    }
                }
            }

            Uri singleUri = data.getData();
            if (singleUri != null) {
                uniqueUris.add(singleUri);
                persistReadPermission(singleUri);
            }

            if (!uniqueUris.isEmpty()) {
                ArrayList<Uri> uriList = new ArrayList<>(uniqueUris);
                results = allowMultipleImages
                        ? uriList.toArray(new Uri[0])
                        : new Uri[]{uriList.get(0)};
            }
        }

        finishImageSelection(results);
    }

    private void persistReadPermission(Uri uri) {
        try {
            activity.getContentResolver().takePersistableUriPermission(
                    uri,
                    Intent.FLAG_GRANT_READ_URI_PERMISSION
            );
        } catch (SecurityException ignored) {
            // 某些选择器只给临时读取权限；WebView 当前会话仍然可以正常读取。
        }
    }

}
