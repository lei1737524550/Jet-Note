package com.ingeniousidea.space;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.ContentValues;
import android.database.Cursor;
import android.graphics.Color;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;
import android.view.Gravity;
import android.view.ViewGroup;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextView;

import org.json.JSONObject;

import java.io.ByteArrayInputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/** Central lifecycle, destination, and feedback controller for Jet Note file tasks. */
final class FileTaskManager {
    enum TaskType { DOWNLOAD, EXPORT }

    static final class Destination {
        final Uri uri;
        final File file;
        final String fileName;
        final String mimeType;
        boolean committed;

        Destination(Uri uri, File file, String fileName, String mimeType) {
            this.uri = uri;
            this.file = file;
            this.fileName = fileName;
            this.mimeType = mimeType;
        }
    }

    private static final ExecutorService IO = Executors.newSingleThreadExecutor();
    private static final Object FEEDBACK_TAG = new Object();

    private FileTaskManager() {}

    static String languageValue(Activity activity, String key) {
        return UiLanguage.text(activity, key);
    }

    static String targetDisplayPath(Activity activity) {
        return UiLanguage.text(activity, "fileTaskDefaultDirectoryDisplayPath");
    }

    static void downloadUrl(Activity activity, String url, String userAgent, String cookie, String referer) {
        if (activity == null || url == null || !url.startsWith("https://")) {
            showFailed(activity, TaskType.DOWNLOAD, UiLanguage.text(activity, "fileTaskUnknownFileName"));
            return;
        }
        IO.execute(() -> {
            HttpURLConnection connection = null;
            Destination destination = null;
            try {
                connection = (HttpURLConnection) new URL(url).openConnection();
                connection.setInstanceFollowRedirects(true);
                connection.setConnectTimeout(15000);
                connection.setReadTimeout(30000);
                connection.setRequestProperty("Accept", "*/*");
                if (userAgent != null && !userAgent.isEmpty()) connection.setRequestProperty("User-Agent", userAgent);
                if (cookie != null && !cookie.isEmpty()) connection.setRequestProperty("Cookie", cookie);
                if (referer != null && !referer.isEmpty()) connection.setRequestProperty("Referer", referer);

                int code = connection.getResponseCode();
                if (code < 200 || code >= 300) throw new java.io.IOException("HTTP " + code);
                String mime = normalizeMime(connection.getContentType());
                String disposition = connection.getHeaderField("Content-Disposition");
                String fileName = sanitizeFileName(android.webkit.URLUtil.guessFileName(connection.getURL().toString(), disposition, mime), activity);
                destination = prepareDestination(activity, fileName, mime);
                if (destination == null) return;
                try (InputStream input = connection.getInputStream()) {
                    copyWithLifecycle(activity, input, destination, TaskType.DOWNLOAD);
                }
            } catch (Exception error) {
                if (destination != null) abort(activity, destination);
                String name = destination == null ? fileNameFromUrl(url, activity) : destination.fileName;
                showFailed(activity, TaskType.DOWNLOAD, name);
            } finally {
                if (connection != null) connection.disconnect();
            }
        });
    }

    static void downloadFile(Activity activity, File source, String mimeType, String mediaType) {
        if (activity == null || source == null || !source.isFile()) {
            showFailed(activity, TaskType.DOWNLOAD, UiLanguage.text(activity, "fileTaskUnknownFileName"));
            return;
        }
        final String mime = normalizeMimeForMedia(mimeType, source.getName(), mediaType);
        final String fileName = source.getName() == null || source.getName().trim().isEmpty()
                ? buildGeneratedName(activity, mediaType, mime)
                : sanitizeFileName(source.getName(), activity);
        IO.execute(() -> {
            Destination destination = prepareDestination(activity, fileName, mime);
            if (destination == null) return;
            try (InputStream input = new FileInputStream(source)) {
                copyWithLifecycle(activity, input, destination, TaskType.DOWNLOAD);
            } catch (Exception error) {
                abort(activity, destination);
                showFailed(activity, TaskType.DOWNLOAD, destination.fileName);
            }
        });
    }

    static void downloadDataUrl(Activity activity, String dataUrl, String mediaType) {
        if (activity == null || dataUrl == null || !dataUrl.startsWith("data:")) {
            showFailed(activity, TaskType.DOWNLOAD, UiLanguage.text(activity, "fileTaskUnknownFileName"));
            return;
        }
        IO.execute(() -> {
            Destination destination = null;
            try {
                int comma = dataUrl.indexOf(',');
                if (comma <= 5) throw new IllegalArgumentException();
                String header = dataUrl.substring(5, comma);
                String mime = normalizeMimeForMedia(header.split(";", 2)[0], null, mediaType);
                if (!header.toLowerCase(Locale.US).contains(";base64")) throw new IllegalArgumentException();
                byte[] bytes = android.util.Base64.decode(dataUrl.substring(comma + 1), android.util.Base64.DEFAULT);
                String fileName = buildGeneratedName(activity, mediaType, mime);
                destination = prepareDestination(activity, fileName, mime);
                if (destination == null) return;
                try (InputStream input = new ByteArrayInputStream(bytes)) {
                    copyWithLifecycle(activity, input, destination, TaskType.DOWNLOAD);
                }
            } catch (Exception error) {
                if (destination != null) abort(activity, destination);
                showFailed(activity, TaskType.DOWNLOAD, destination == null ? UiLanguage.text(activity, "fileTaskUnknownFileName") : destination.fileName);
            }
        });
    }

    static Destination prepareExportDestination(Activity activity, String requestedFileName, String mimeType) {
        return prepareDestination(activity, requestedFileName, mimeType);
    }

    static void saveTextExport(Activity activity, String requestedFileName, String mimeType, String text) {
        if (activity == null) return;
        final String payload = text == null ? "" : text;
        IO.execute(() -> {
            Destination destination = prepareExportDestination(activity, requestedFileName, mimeType);
            if (destination == null) return;
            notifyExportStarted(activity, destination);
            try (OutputStream output = openDestination(activity, destination)) {
                output.write(payload.getBytes(java.nio.charset.StandardCharsets.UTF_8));
                output.flush();
                completeExport(activity, destination);
            } catch (Exception error) {
                failExport(activity, destination);
            }
        });
    }

    static void notifyExportStarted(Activity activity, Destination destination) {
        if (destination != null) showStarted(activity, TaskType.EXPORT, destination.fileName);
    }

    static OutputStream openDestination(Activity activity, Destination destination) throws Exception {
        try {
            if (destination.file != null) return new FileOutputStream(destination.file, false);
            OutputStream output = activity.getContentResolver().openOutputStream(destination.uri, "w");
            if (output == null) throw new java.io.IOException(UiLanguage.text(activity, "fileTaskStorageOpenFailed"));
            return output;
        } catch (Exception error) {
            showStorageUnavailable(activity);
            throw error;
        }
    }

    static long destinationSize(Activity activity, Destination destination) {
        if (destination == null) return -1L;
        if (destination.file != null) return destination.file.length();
        try (Cursor cursor = activity.getContentResolver().query(destination.uri, new String[]{MediaStore.MediaColumns.SIZE}, null, null, null)) {
            if (cursor != null && cursor.moveToFirst()) {
                int index = cursor.getColumnIndex(MediaStore.MediaColumns.SIZE);
                if (index >= 0 && !cursor.isNull(index)) return cursor.getLong(index);
            }
        } catch (Exception ignored) {}
        return -1L;
    }

    static void completeExport(Activity activity, Destination destination) throws Exception {
        commit(activity, destination);
        showCompleted(activity, TaskType.EXPORT, destination.fileName);
    }

    static void failExport(Activity activity, Destination destination) {
        if (destination == null) return;
        abort(activity, destination);
        showFailed(activity, TaskType.EXPORT, destination.fileName);
    }

    private static void copyWithLifecycle(Activity activity, InputStream input, Destination destination, TaskType type) throws Exception {
        try (OutputStream output = openDestination(activity, destination)) {
            byte[] buffer = new byte[128 * 1024];
            int read = input.read(buffer);
            showStarted(activity, type, destination.fileName);
            if (read >= 0) {
                if (read > 0) output.write(buffer, 0, read);
                while ((read = input.read(buffer)) != -1) output.write(buffer, 0, read);
            }
            output.flush();
        }
        commit(activity, destination);
        showCompleted(activity, type, destination.fileName);
    }

    private static Destination prepareDestination(Activity activity, String requestedFileName, String mimeType) {
        try {
            String fileName = sanitizeFileName(requestedFileName, activity);
            String mime = normalizeMime(mimeType);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                ContentValues values = new ContentValues();
                values.put(MediaStore.Downloads.DISPLAY_NAME, fileName);
                values.put(MediaStore.Downloads.MIME_TYPE, mime);
                values.put(MediaStore.Downloads.RELATIVE_PATH, relativeDirectory(activity));
                values.put(MediaStore.Downloads.IS_PENDING, 1);
                Uri uri = activity.getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
                if (uri == null) throw new java.io.IOException(UiLanguage.text(activity, "fileTaskStorageCreateFailed"));
                String actualName = queryDisplayName(activity, uri, fileName);
                return new Destination(uri, null, actualName, mime);
            }

            File downloads = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS);
            File directory = new File(downloads, UiLanguage.text(activity, "fileTaskDefaultDirectoryName"));
            if ((!directory.exists() && !directory.mkdirs()) || !directory.isDirectory() || !directory.canWrite()) {
                throw new java.io.IOException(UiLanguage.text(activity, "fileTaskStorageCreateFailed"));
            }
            File file = uniqueFile(directory, fileName);
            return new Destination(Uri.fromFile(file), file, file.getName(), mime);
        } catch (Exception error) {
            showStorageUnavailable(activity);
            return null;
        }
    }

    private static void commit(Activity activity, Destination destination) throws Exception {
        if (destination == null || destination.committed) return;
        if (destination.file == null && Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            ContentValues complete = new ContentValues();
            complete.put(MediaStore.Downloads.IS_PENDING, 0);
            int updated = activity.getContentResolver().update(destination.uri, complete, null, null);
            if (updated <= 0) {
                showStorageUnavailable(activity);
                throw new java.io.IOException(UiLanguage.text(activity, "fileTaskStorageCommitFailed"));
            }
        }
        destination.committed = true;
    }

    static void abort(Activity activity, Destination destination) {
        if (activity == null || destination == null) return;
        try {
            if (destination.file != null) {
                if (destination.file.exists()) destination.file.delete();
            } else if (destination.uri != null) {
                activity.getContentResolver().delete(destination.uri, null, null);
            }
        } catch (Exception ignored) {}
    }

    private static String relativeDirectory(Activity activity) {
        return Environment.DIRECTORY_DOWNLOADS + "/" + UiLanguage.text(activity, "fileTaskDefaultDirectoryName");
    }

    private static File uniqueFile(File directory, String fileName) {
        File candidate = new File(directory, fileName);
        if (!candidate.exists()) return candidate;
        int dot = fileName.lastIndexOf('.');
        String base = dot > 0 ? fileName.substring(0, dot) : fileName;
        String ext = dot > 0 ? fileName.substring(dot) : "";
        for (int i = 2; i < 10000; i++) {
            candidate = new File(directory, base + "_" + i + ext);
            if (!candidate.exists()) return candidate;
        }
        return new File(directory, base + "_" + System.currentTimeMillis() + ext);
    }

    private static String queryDisplayName(Activity activity, Uri uri, String fallback) {
        try (Cursor cursor = activity.getContentResolver().query(uri, new String[]{MediaStore.MediaColumns.DISPLAY_NAME}, null, null, null)) {
            if (cursor != null && cursor.moveToFirst()) {
                int index = cursor.getColumnIndex(MediaStore.MediaColumns.DISPLAY_NAME);
                if (index >= 0) {
                    String name = cursor.getString(index);
                    if (name != null && !name.trim().isEmpty()) return name;
                }
            }
        } catch (Exception ignored) {}
        return fallback;
    }

    private static void showStarted(Activity activity, TaskType type, String fileName) {
        showFeedback(activity, format(UiLanguage.text(activity, type == TaskType.EXPORT ? "fileTaskExportStarted" : "fileTaskDownloadStarted"), fileName));
    }

    private static void showCompleted(Activity activity, TaskType type, String fileName) {
        showFeedback(activity, format(UiLanguage.text(activity, type == TaskType.EXPORT ? "fileTaskExportCompleted" : "fileTaskDownloadCompleted"), fileName));
    }

    private static void showFailed(Activity activity, TaskType type, String fileName) {
        if (activity == null) return;
        showFeedback(activity, format(UiLanguage.text(activity, type == TaskType.EXPORT ? "fileTaskExportFailed" : "fileTaskDownloadFailed"), fileName));
    }

    static void showFeedback(Activity activity, String message) {
        if (activity == null) return;
        activity.runOnUiThread(() -> {
            ViewGroup root = activity.findViewById(android.R.id.content);
            if (!(root instanceof FrameLayout)) return;

            LinearLayout stack = root.findViewWithTag(FEEDBACK_TAG);
            if (stack == null) {
                stack = new LinearLayout(activity);
                stack.setTag(FEEDBACK_TAG);
                stack.setOrientation(LinearLayout.VERTICAL);
                stack.setGravity(Gravity.CENTER_HORIZONTAL);
                FrameLayout.LayoutParams stackParams = new FrameLayout.LayoutParams(
                        ViewGroup.LayoutParams.MATCH_PARENT,
                        ViewGroup.LayoutParams.WRAP_CONTENT,
                        Gravity.BOTTOM);
                stackParams.leftMargin = dp(activity, 16);
                stackParams.rightMargin = dp(activity, 16);
                stackParams.bottomMargin = dp(activity, 88);
                root.addView(stack, stackParams);
            }

            TextView text = new TextView(activity);
            text.setText(UiLanguage.text(activity, "fileTaskFeedbackAppTitle") + "\n" + message);
            text.setTextColor(Color.rgb(34, 34, 34));
            text.setTextSize(14f);
            text.setGravity(Gravity.CENTER);
            text.setPadding(dp(activity, 20), dp(activity, 12), dp(activity, 20), dp(activity, 12));
            GradientDrawable background = new GradientDrawable();
            background.setColor(Color.rgb(250, 255, 240));
            background.setCornerRadius(dp(activity, 18));
            background.setStroke(dp(activity, 1), Color.rgb(191, 193, 196));
            text.setBackground(background);

            LinearLayout.LayoutParams textParams = new LinearLayout.LayoutParams(
                    ViewGroup.LayoutParams.WRAP_CONTENT,
                    ViewGroup.LayoutParams.WRAP_CONTENT);
            textParams.topMargin = dp(activity, 6);
            stack.addView(text, textParams);

            final LinearLayout feedbackStack = stack;
            long duration = UiLanguage.longValue(activity, "fileTaskFeedbackDurationMs", 1400L);
            text.postDelayed(() -> {
                if (text.getParent() == feedbackStack) feedbackStack.removeView(text);
                if (feedbackStack.getChildCount() == 0 && feedbackStack.getParent() == root) root.removeView(feedbackStack);
            }, Math.max(250L, duration));
        });
    }

    private static void showStorageUnavailable(Activity activity) {
        if (activity == null) return;
        activity.runOnUiThread(() -> {
            String path = targetDisplayPath(activity);
            String message = UiLanguage.text(activity, "fileTaskStorageUnavailableMessage").replace("{path}", path);
            new AlertDialog.Builder(activity)
                    .setTitle(UiLanguage.text(activity, "fileTaskStorageUnavailableTitle"))
                    .setMessage(message)
                    .setPositiveButton(UiLanguage.text(activity, "fileTaskStorageUnavailableButton"), null)
                    .show();
        });
    }


    private static String format(String template, String fileName) {
        return template.replace("{fileName}", fileName == null ? "" : fileName);
    }

    private static String sanitizeFileName(String name, Activity activity) {
        String value = name == null ? "" : name.trim().replaceAll("[\\\\/:*?\"<>|\\p{Cntrl}]", "_");
        if (value.isEmpty()) value = UiLanguage.text(activity, "fileTaskUnknownFileName");
        if (value.length() > 180) value = value.substring(value.length() - 180);
        return value;
    }

    private static String fileNameFromUrl(String url, Activity activity) {
        try {
            return sanitizeFileName(android.webkit.URLUtil.guessFileName(url, null, null), activity);
        } catch (Exception ignored) {
            return UiLanguage.text(activity, "fileTaskUnknownFileName");
        }
    }

    private static String normalizeMime(String mimeType) {
        String mime = mimeType == null ? "" : mimeType.trim().toLowerCase(Locale.US);
        int semicolon = mime.indexOf(';');
        if (semicolon >= 0) mime = mime.substring(0, semicolon).trim();
        return mime.isEmpty() ? "application/octet-stream" : mime;
    }

    private static String normalizeMimeForMedia(String mimeType, String fileName, String mediaType) {
        String mime = normalizeMime(mimeType);
        if (!"application/octet-stream".equals(mime)) return mime;
        String lower = fileName == null ? "" : fileName.toLowerCase(Locale.US);
        if (lower.endsWith(".png")) return "image/png";
        if (lower.endsWith(".gif")) return "image/gif";
        if (lower.endsWith(".webp")) return "image/webp";
        if (lower.endsWith(".svg")) return "image/svg+xml";
        if (lower.endsWith(".webm")) return "video/webm";
        if (lower.endsWith(".mov")) return "video/quicktime";
        if (lower.endsWith(".mkv")) return "video/x-matroska";
        if (lower.endsWith(".3gp")) return "video/3gpp";
        if (lower.endsWith(".mp4")) return "video/mp4";
        return "video".equals(mediaType) ? "video/mp4" : "image/jpeg";
    }

    private static String buildGeneratedName(Activity activity, String mediaType, String mimeType) {
        String datePattern = UiLanguage.text(activity, "fileTaskGeneratedMediaDatePattern");
        String stamp = new SimpleDateFormat(datePattern, Locale.US).format(new Date());
        String pattern = "video".equals(mediaType)
                ? UiLanguage.text(activity, "fileTaskGeneratedVideoFileNamePattern")
                : UiLanguage.text(activity, "fileTaskGeneratedImageFileNamePattern");
        return pattern.replace("{date}", stamp).replace("{extension}", extensionForMime(mimeType));
    }

    private static String extensionForMime(String mimeType) {
        if (mimeType == null) return ".bin";
        switch (mimeType.toLowerCase(Locale.US)) {
            case "image/jpeg": return ".jpg";
            case "image/png": return ".png";
            case "image/gif": return ".gif";
            case "image/webp": return ".webp";
            case "image/svg+xml": return ".svg";
            case "video/mp4": return ".mp4";
            case "video/webm": return ".webm";
            case "video/quicktime": return ".mov";
            case "video/x-matroska": return ".mkv";
            case "video/3gpp": return ".3gp";
            default: return ".bin";
        }
    }

    private static int dp(Activity activity, int value) {
        return Math.round(value * activity.getResources().getDisplayMetrics().density);
    }
}
