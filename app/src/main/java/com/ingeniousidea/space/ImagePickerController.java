package com.ingeniousidea.space;

import android.app.Activity;
import android.content.Intent;
import android.content.ActivityNotFoundException;
import android.content.ClipData;
import android.net.Uri;
import android.os.Build;
import android.os.ext.SdkExtensions;
import android.provider.MediaStore;
import android.widget.Toast;
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
        if (acceptTypes != null) for (String type : acceptTypes) {
            if (!type.startsWith("image/")) imageOnly = false;
            if (type.startsWith("audio/") || type.equalsIgnoreCase(".mp3")) audio = true;
        }
        if (imageOnly) {
            launchImagePicker();
        } else {
            Intent document = new Intent(Intent.ACTION_OPEN_DOCUMENT);
            document.addCategory(Intent.CATEGORY_OPENABLE);
            document.setType(audio ? "audio/*" : "*/*");
            if (audio) document.putExtra(Intent.EXTRA_MIME_TYPES, new String[]{"audio/*", "application/octet-stream"});
            document.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, multiple);
            document.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION);
            if (!tryLaunchImagePicker(document)) {
                finishImageSelection(null);
                Toast.makeText(activity, "无法打开文件选择器", Toast.LENGTH_LONG).show();
            }
        }
    }
    void destroy() { finishImageSelection(null); }
    private void launchImagePicker() {
        boolean platformPickerAvailable = Build.VERSION.SDK_INT >= 33
                || (Build.VERSION.SDK_INT >= 30
                && SdkExtensions.getExtensionVersion(Build.VERSION_CODES.R) >= 2);
        if (platformPickerAvailable) {
            Intent picker = new Intent(MediaStore.ACTION_PICK_IMAGES);
            picker.setType("image/*");
            picker.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            if (allowMultipleImages) {
                picker.putExtra(MediaStore.EXTRA_PICK_IMAGES_MAX,
                        MediaStore.getPickImagesMaxLimit());
            }
            if (tryLaunchImagePicker(picker)) {
                return;
            }
        }

        // 老系统只尝试相册，不使用 ACTION_OPEN_DOCUMENT / ACTION_GET_CONTENT。
        // 部分旧相册忽略多选参数，用户可再次添加图片。
        Intent gallery = new Intent(Intent.ACTION_PICK);
        gallery.setDataAndType(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, "image/*");
        gallery.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        gallery.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, allowMultipleImages);
        if (!tryLaunchImagePicker(gallery)) {
            finishImageSelection(null);
            Toast.makeText(activity, "没有可用的图片选择器，请安装或启用相册应用", Toast.LENGTH_LONG).show();
        }
    }

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
