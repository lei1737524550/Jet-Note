package com.ingeniousidea.space;

import android.content.ContentResolver;
import android.content.Context;
import android.database.Cursor;
import android.graphics.BitmapFactory;
import android.media.MediaMetadataRetriever;
import android.net.Uri;
import android.provider.OpenableColumns;
import android.util.Base64;

import org.json.JSONException;
import org.json.JSONObject;

import java.io.ByteArrayInputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.security.DigestInputStream;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.Locale;
import java.util.UUID;

/**
 * App-owned, lossless attachment repository.
 *
 * New media is copied byte-for-byte into app storage. The same physical files are
 * streamed into/out of .jnote archives, so image/audio/video bytes are never
 * decoded and re-encoded during normal import/export.
 */
final class AttachmentStore {
    static final String MEDIA_URL_PREFIX = "https://jetnote.local/media/";
    private final Context context;
    private final File mediaDir;

    AttachmentStore(Context context) {
        this.context = context.getApplicationContext();
        this.mediaDir = new File(this.context.getFilesDir(), "jetnote-media");
        if (!mediaDir.exists() && !mediaDir.mkdirs()) {
            throw new IllegalStateException("Unable to create attachment directory");
        }
    }

    JSONObject importFromUri(Uri uri, String requestedType) throws IOException, JSONException {
        ContentResolver resolver = context.getContentResolver();
        String mimeType = resolver.getType(uri);
        String originalName = queryDisplayName(resolver, uri);
        if (originalName == null || originalName.trim().isEmpty()) originalName = "attachment";
        if (mimeType == null || mimeType.trim().isEmpty() || "application/octet-stream".equals(mimeType)) mimeType = guessMimeFromName(originalName);
        if(originalName.toLowerCase(Locale.US).endsWith(".mp3"))mimeType="audio/mpeg";
        if(("audio".equals(requestedType)&&!mimeType.startsWith("audio/"))||("image".equals(requestedType)&&!mimeType.startsWith("image/")))throw new IOException("Selected file has an unsupported media type");

        String type = normalizeType(requestedType, mimeType);
        String extension = safeExtension(originalName, mimeType);
        String id = UUID.randomUUID().toString();
        String fileName = id + extension;
        File destination = new File(mediaDir, fileName);

        MessageDigest digest = sha256Digest();
        long size;
        try (InputStream raw = resolver.openInputStream(uri)) {
            if (raw == null) throw new IOException("Unable to open selected attachment");
            try (DigestInputStream in = new DigestInputStream(raw, digest);
                 FileOutputStream out = new FileOutputStream(destination)) {
                size = copy(in, out);
            }
        } catch (IOException error) {
            //noinspection ResultOfMethodCallIgnored
            destination.delete();
            throw error;
        }

        return buildMetadata(id, type, mimeType, originalName, fileName, size,
                hex(digest.digest()), destination);
    }

    /** One-time compatibility path for old versions that stored compressed data: images in localStorage. */
    JSONObject importLegacyDataUrl(String dataUrl, String originalName) throws IOException, JSONException {
        if (dataUrl == null || !dataUrl.startsWith("data:") || !dataUrl.contains(",")) {
            throw new IOException("Invalid legacy data URL");
        }
        int comma = dataUrl.indexOf(',');
        String header = dataUrl.substring(5, comma);
        String mimeType = header.split(";", 2)[0];
        if (mimeType.isEmpty()) mimeType = "image/jpeg";
        boolean base64 = header.toLowerCase(Locale.US).contains(";base64");
        if (!base64) throw new IOException("Only base64 legacy images are supported");

        byte[] bytes;
        try {
            bytes = Base64.decode(dataUrl.substring(comma + 1), Base64.DEFAULT);
        } catch (IllegalArgumentException e) {
            throw new IOException("Invalid base64 legacy image", e);
        }

        String id = UUID.randomUUID().toString();
        String ext = safeExtension(originalName == null ? "legacy.jpg" : originalName, mimeType);
        String fileName = id + ext;
        File destination = new File(mediaDir, fileName);
        MessageDigest digest = sha256Digest();
        long size;
        try (DigestInputStream in = new DigestInputStream(new ByteArrayInputStream(bytes), digest);
             FileOutputStream out = new FileOutputStream(destination)) {
            size = copy(in, out);
        } finally {
            // Allow the large compatibility buffer to become collectible immediately.
            bytes = null;
        }

        return buildMetadata(id, "image", mimeType,
                originalName == null ? "legacy-image" + ext : originalName,
                fileName, size, hex(digest.digest()), destination);
    }

    File fileForArchivePath(String archivePath) {
        if (archivePath == null || !archivePath.startsWith("media/")) return null;
        String name = archivePath.substring("media/".length());
        if (!isSafeFileName(name)) return null;
        return new File(mediaDir, name);
    }

    JSONObject describe(String path) throws IOException, JSONException {
        File file=fileForArchivePath(path);
        if(file==null||!file.isFile())throw new IOException("Missing media");
        String name=file.getName();int dot=name.lastIndexOf('.');
        String mime=guessMimeFromName(name);
        return buildMetadata(dot>0?name.substring(0,dot):name,normalizeType(null,mime),mime,null,name,file.length(),sha256(file),file);
    }

    File mediaDirectory() { return mediaDir; }

    File fileForWeb(String fileName) throws IOException {
        if (!isSafeFileName(fileName)) throw new IOException("Invalid media name");
        File file = new File(mediaDir, fileName);
        if (!file.isFile()) throw new IOException("Attachment not found");
        return file;
    }

    InputStream openForWeb(String fileName) throws IOException {
        return new FileInputStream(fileForWeb(fileName));
    }

    String mimeForFileName(String fileName) {
        return guessMimeFromName(fileName);
    }

    static long copy(InputStream in, FileOutputStream out) throws IOException {
        byte[] buffer = new byte[64 * 1024];
        long total = 0;
        int read;
        while ((read = in.read(buffer)) != -1) {
            out.write(buffer, 0, read);
            total += read;
        }
        return total;
    }

    static long copy(InputStream in, java.io.OutputStream out) throws IOException {
        byte[] buffer = new byte[64 * 1024];
        long total = 0;
        int read;
        while ((read = in.read(buffer)) != -1) {
            out.write(buffer, 0, read);
            total += read;
        }
        return total;
    }

    static MessageDigest sha256Digest() throws IOException {
        try {
            return MessageDigest.getInstance("SHA-256");
        } catch (NoSuchAlgorithmException e) {
            throw new IOException("SHA-256 unavailable", e);
        }
    }

    static String sha256(File file) throws IOException {
        MessageDigest digest = sha256Digest();
        try (DigestInputStream in = new DigestInputStream(new FileInputStream(file), digest)) {
            byte[] buffer = new byte[64 * 1024];
            while (in.read(buffer) != -1) { /* stream */ }
        }
        return hex(digest.digest());
    }

    private JSONObject buildMetadata(
            String id, String type, String mimeType, String originalName,
            String fileName, long size, String sha256, File file
    ) throws JSONException {
        JSONObject result = new JSONObject();
        result.put("id", id);
        result.put("type", type);
        result.put("mimeType", mimeType == null ? "application/octet-stream" : mimeType);
        result.put("originalName", originalName);
        result.put("path", "media/" + fileName);
        result.put("size", size);
        result.put("sha256", sha256);

        Long duration = readDurationMs(file, mimeType);
        int[] dimensions = readDimensions(file, mimeType);
        result.put("duration", duration == null ? JSONObject.NULL : duration / 1000.0);
        result.put("width", dimensions[0] > 0 ? dimensions[0] : JSONObject.NULL);
        result.put("height", dimensions[1] > 0 ? dimensions[1] : JSONObject.NULL);
        result.put("extra", new JSONObject());
        return result;
    }

    private static Long readDurationMs(File file, String mimeType) {
        if (mimeType == null || !(mimeType.startsWith("audio/") || mimeType.startsWith("video/"))) return null;
        MediaMetadataRetriever retriever = new MediaMetadataRetriever();
        try {
            retriever.setDataSource(file.getAbsolutePath());
            String raw = retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_DURATION);
            return raw == null ? null : Long.parseLong(raw);
        } catch (RuntimeException ignored) {
            return null;
        } finally {
            try { retriever.release(); } catch (IOException | RuntimeException ignored) { }
        }
    }

    private static int[] readDimensions(File file, String mimeType) {
        int[] result = new int[]{0, 0};
        if (mimeType != null && mimeType.startsWith("image/")) {
            BitmapFactory.Options options = new BitmapFactory.Options();
            options.inJustDecodeBounds = true;
            BitmapFactory.decodeFile(file.getAbsolutePath(), options);
            result[0] = options.outWidth;
            result[1] = options.outHeight;
            return result;
        }
        if (mimeType != null && mimeType.startsWith("video/")) {
            MediaMetadataRetriever retriever = new MediaMetadataRetriever();
            try {
                retriever.setDataSource(file.getAbsolutePath());
                result[0] = parseInt(retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_WIDTH));
                result[1] = parseInt(retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_HEIGHT));
            } catch (RuntimeException ignored) {
                // Metadata is optional.
            } finally {
                try { retriever.release(); } catch (IOException | RuntimeException ignored) { }
            }
        }
        return result;
    }

    private static int parseInt(String value) {
        try { return value == null ? 0 : Integer.parseInt(value); }
        catch (NumberFormatException ignored) { return 0; }
    }

    private static String queryDisplayName(ContentResolver resolver, Uri uri) {
        try (Cursor cursor = resolver.query(uri, new String[]{OpenableColumns.DISPLAY_NAME}, null, null, null)) {
            if (cursor != null && cursor.moveToFirst()) {
                int index = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME);
                if (index >= 0) return cursor.getString(index);
            }
        } catch (RuntimeException ignored) { }
        return null;
    }

    private static String normalizeType(String requested, String mime) {
        if ("image".equals(requested) || "audio".equals(requested)
                || "video".equals(requested) || "file".equals(requested)) return requested;
        if (mime != null) {
            if (mime.startsWith("image/")) return "image";
            if (mime.startsWith("audio/")) return "audio";
            if (mime.startsWith("video/")) return "video";
        }
        return "file";
    }

    private static String safeExtension(String name, String mime) {
        int dot = name == null ? -1 : name.lastIndexOf('.');
        if (dot >= 0 && dot < name.length() - 1) {
            String ext = name.substring(dot).toLowerCase(Locale.US);
            if (ext.matches("\\.[a-z0-9]{1,10}")) return ext;
        }
        if ("image/jpeg".equals(mime)) return ".jpg";
        if ("image/png".equals(mime)) return ".png";
        if ("image/webp".equals(mime)) return ".webp";
        if ("image/gif".equals(mime)) return ".gif";
        if ("audio/mpeg".equals(mime)) return ".mp3";
        if ("audio/ogg".equals(mime)) return ".ogg";
        if ("audio/wav".equals(mime) || "audio/x-wav".equals(mime)) return ".wav";
        if ("video/mp4".equals(mime)) return ".mp4";
        return ".bin";
    }

    private static String guessMimeFromName(String name) {
        String lower = name == null ? "" : name.toLowerCase(Locale.US);
        if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
        if (lower.endsWith(".png")) return "image/png";
        if (lower.endsWith(".webp")) return "image/webp";
        if (lower.endsWith(".gif")) return "image/gif";
        if (lower.endsWith(".mp3")) return "audio/mpeg";
        if (lower.endsWith(".wav")) return "audio/wav";
        if (lower.endsWith(".ogg") || lower.endsWith(".oga")) return "audio/ogg";
        if (lower.endsWith(".m4a")) return "audio/mp4";
        if (lower.endsWith(".aac")) return "audio/aac";
        if (lower.endsWith(".flac")) return "audio/flac";
        if (lower.endsWith(".mp4")) return "video/mp4";
        if (lower.endsWith(".webm")) return "video/webm";
        return "application/octet-stream";
    }

    static boolean isSafeFileName(String name) {
        return name != null && name.matches("[A-Za-z0-9_.-]{1,200}") && !name.contains("..") && !name.contains("/") && !name.contains("\\")
                && !name.equals(".") && !name.equals("..") && !name.contains("\u0000");
    }

    static String hex(byte[] bytes) {
        StringBuilder result = new StringBuilder(bytes.length * 2);
        for (byte b : bytes) result.append(String.format(Locale.US, "%02x", b & 0xff));
        return result.toString();
    }
}
