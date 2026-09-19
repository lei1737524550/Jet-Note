package com.ingeniousidea.space;

import android.Manifest;
import android.app.Activity;
import android.content.ClipData;
import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.DocumentsContract;
import android.provider.MediaStore;
import android.provider.OpenableColumns;
import android.webkit.ValueCallback;
import android.webkit.WebView;

import org.json.JSONObject;
import org.json.JSONTokener;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Locale;

final class BidirectionalConversionController {
    static final int REQUEST_WRITE_DOWNLOADS = 4701;
    private static final String OUTPUT_DIRECTORY = "Vector Bridge";
    private static final int MAX_INPUT_BYTES = 8 * 1024 * 1024;

    interface Callback {
        void onConverting(String sourceName, String direction);
        void onSuccess(String displayPath, String direction, int warningCount);
        void onError(String message);
    }

    private final Activity activity;
    private final Callback callback;
    private WebView jsEngine;
    private boolean runtimeReady;
    private boolean runtimeInitializing;
    private Runnable pendingRuntimeAction;
    private PendingSave pendingSave;

    BidirectionalConversionController(Activity activity, Callback callback) {
        this.activity = activity;
        this.callback = callback;
    }

    static boolean isConversionIntent(Intent intent) {
        if (intent == null) return false;
        String action = intent.getAction();
        if (Intent.ACTION_VIEW.equals(action)) return intent.getData() != null;
        if (Intent.ACTION_SEND.equals(action) || Intent.ACTION_SEND_MULTIPLE.equals(action)) {
            return firstSharedUri(intent) != null || intent.getCharSequenceExtra(Intent.EXTRA_TEXT) != null;
        }
        return false;
    }

    @SuppressWarnings("deprecation")
    private static Uri firstSharedUri(Intent intent) {
        if (intent == null) return null;
        try {
            Uri stream = intent.getParcelableExtra(Intent.EXTRA_STREAM);
            if (stream != null) return stream;
        } catch (RuntimeException ignored) {}
        try {
            ArrayList<Uri> streams = intent.getParcelableArrayListExtra(Intent.EXTRA_STREAM);
            if (streams != null && !streams.isEmpty() && streams.get(0) != null) return streams.get(0);
        } catch (RuntimeException ignored) {}
        ClipData clipData = intent.getClipData();
        if (clipData != null) {
            for (int i = 0; i < clipData.getItemCount(); i++) {
                Uri uri = clipData.getItemAt(i).getUri();
                if (uri != null) return uri;
            }
        }
        return null;
    }

    void handle(Intent intent) {
        try {
            InputPayload payload = readInput(intent);
            detectAndConvert(payload);
        } catch (Exception error) {
            callback.onError(readableMessage(error));
        }
    }

    void destroy() {
        pendingRuntimeAction = null;
        if (jsEngine != null) {
            jsEngine.destroy();
            jsEngine = null;
        }
    }

    void onPermissionResult(int requestCode, int[] grantResults) {
        if (requestCode != REQUEST_WRITE_DOWNLOADS || pendingSave == null) return;
        PendingSave save = pendingSave;
        pendingSave = null;
        if (grantResults.length == 0 || grantResults[0] != PackageManager.PERMISSION_GRANTED) {
            callback.onError("Storage permission is required to save the converted file.");
            return;
        }
        saveLegacy(save);
    }

    private InputPayload readInput(Intent intent) throws IOException {
        Uri uri = null;
        CharSequence sharedText = null;
        String action = intent.getAction();
        if (Intent.ACTION_VIEW.equals(action)) {
            uri = intent.getData();
        } else if (Intent.ACTION_SEND.equals(action) || Intent.ACTION_SEND_MULTIPLE.equals(action)) {
            uri = firstSharedUri(intent);
            sharedText = intent.getCharSequenceExtra(Intent.EXTRA_TEXT);
        }

        if (uri != null) {
            String name = queryDisplayName(uri);
            if (name == null || name.trim().isEmpty()) name = "vector";
            SaveLocation location = inferSaveLocation(uri);
            try (InputStream input = activity.getContentResolver().openInputStream(uri)) {
                if (input == null) throw new IOException("Unable to open the received file.");
                return new InputPayload(name, readUtf8Limited(input), location);
            }
        }
        if (sharedText != null) {
            String text = sharedText.toString().trim();
            if (text.isEmpty()) throw new IOException("The received text is empty.");
            if (text.getBytes(StandardCharsets.UTF_8).length > MAX_INPUT_BYTES) {
                throw new IOException("The received text is too large.");
            }
            return new InputPayload("vector", text, SaveLocation.fallback());
        }
        throw new IOException("No XML or SVG content was received.");
    }

    private void detectAndConvert(InputPayload payload) throws IOException {
        String text = payload.text.trim();
        String lowerName = payload.name.toLowerCase(Locale.ROOT);
        boolean contentIsSvg = text.matches("(?s)^\\s*(?:<\\?xml[^>]*>\\s*)?<svg\\b.*");
        boolean contentIsVector = text.matches("(?s)^\\s*(?:<\\?xml[^>]*>\\s*)?<vector\\b.*");
        boolean contentIsShape = text.matches("(?s)^\\s*(?:<\\?xml[^>]*>\\s*)?<shape\\b.*");

        if (contentIsSvg || (!contentIsVector && !contentIsShape && lowerName.endsWith(".svg"))) {
            callback.onConverting(payload.name, "SVG → Android VectorDrawable XML");
            convertSvgToXml(payload);
        } else if (contentIsVector || contentIsShape || lowerName.endsWith(".xml")) {
            String direction = contentIsShape
                    ? "Android ShapeDrawable XML → SVG"
                    : "Android VectorDrawable XML → SVG";
            callback.onConverting(payload.name, direction);
            convertAndroidXmlToSvg(payload, direction);
        } else {
            throw new IOException("Unsupported content. Receive an SVG (<svg>) or Android drawable XML (<vector> / <shape>) file.");
        }
    }

    private void convertAndroidXmlToSvg(InputPayload payload, String direction) throws IOException {
        String expression = "window.__vectorBridgeAndroidXmlToSvg(" + JSONObject.quote(payload.text) + ")";
        evaluateWhenReady(expression, payload, "svg", "image/svg+xml", direction);
    }

    private void convertSvgToXml(InputPayload payload) throws IOException {
        String expression = "window.__vectorBridgeSvgToXml(" + JSONObject.quote(payload.text) + ")";
        evaluateWhenReady(expression, payload, "xml", "application/xml", "SVG → Android VectorDrawable XML");
    }

    private void evaluateWhenReady(String expression, InputPayload payload, String extension, String mimeType, String direction) throws IOException {
        ensureJsEngine(() -> evaluate(expression, payload, extension, mimeType, direction));
    }

    private void evaluate(String expression, InputPayload payload, String extension, String mimeType, String direction) {
        if (jsEngine == null) {
            callback.onError("Converter engine is unavailable.");
            return;
        }
        jsEngine.evaluateJavascript(expression, new ValueCallback<String>() {
            @Override public void onReceiveValue(String value) {
                try {
                    Object decoded = new JSONTokener(value == null ? "null" : value).nextValue();
                    if (!(decoded instanceof String)) throw new IOException("The converter returned an invalid result.");
                    JSONObject result = new JSONObject((String) decoded);
                    if (!result.optBoolean("ok", false)) throw new IOException(result.optString("error", "Conversion failed."));
                    String output = result.optString("output", "");
                    if (output.trim().isEmpty()) throw new IOException("The converter produced an empty result.");
                    save(output, stripExtension(payload.name), extension, mimeType, direction,
                            result.optInt("warningCount", 0), payload.saveLocation);
                } catch (Exception error) {
                    callback.onError(readableMessage(error));
                }
            }
        });
    }

    private void ensureJsEngine(Runnable readyAction) throws IOException {
        if (runtimeReady && jsEngine != null) {
            readyAction.run();
            return;
        }
        pendingRuntimeAction = readyAction;
        if (runtimeInitializing) return;

        runtimeInitializing = true;
        jsEngine = new WebView(activity);
        jsEngine.getSettings().setJavaScriptEnabled(true);
        jsEngine.setWillNotDraw(true);
        jsEngine.evaluateJavascript(buildRuntimeScript(), value -> {
            runtimeInitializing = false;
            if (jsEngine == null) return;
            if (value == null || !value.contains("ready")) {
                callback.onError("Unable to initialize the converter engine.");
                return;
            }
            runtimeReady = true;
            Runnable action = pendingRuntimeAction;
            pendingRuntimeAction = null;
            if (action != null) action.run();
        });
    }

    private String buildRuntimeScript() throws IOException {
        String xmlModule = readAssetText("converter/svg_xml_xml.js");
        String pathModule = readAssetText("converter/svg_xml_path.js");
        String converterModule = readAssetText("converter/svg_xml_converter.js");
        String reverseModule = readAssetText("converter/svg_xml_svg_to_vector.js");
        String shapeModule = readAssetText("converter/svg_xml_shape_to_svg.js");

        return "(function(){\n" +
                "window.__vectorBridgeRuntimeVersion=\"1.2-refactor\";\n" +
                "const modules=Object.create(null);\n" +
                "function define(id,f){modules[id]={f:f,exports:{},loaded:false};}\n" +
                "function require(id){const m=modules[id];if(!m)throw new Error('Missing module: '+id);if(!m.loaded){m.loaded=true;m.f(m,m.exports,require);}return m.exports;}\n" +
                "define('./xml',function(module,exports,require){\n" + xmlModule + "\n});\n" +
                "define('./path',function(module,exports,require){\n" + pathModule + "\n});\n" +
                "define('./converter',function(module,exports,require){\n" + converterModule + "\n});\n" +
                "define('./svg_to_vector',function(module,exports,require){\n" + reverseModule + "\n});\n" +
                "define('./shape_to_svg',function(module,exports,require){\n" + shapeModule + "\n});\n" +
                "window.__vectorBridgeAndroidXmlToSvg=function(source){try{const xml=require('./xml'),root=xml.parseXml(String(source));let r;if(root&&root.localName==='vector'){r=require('./converter').convertVectorDrawable(root,{});}else if(root&&root.localName==='shape'){r=require('./shape_to_svg').convertShapeDrawable(root);}else{throw new Error('Unsupported Android drawable XML root <'+(root&&root.localName?root.localName:'unknown')+'>. Supported roots: <vector>, <shape>.');}return JSON.stringify({ok:true,output:r.svg,warningCount:(r.warnings||[]).length});}catch(e){return JSON.stringify({ok:false,error:e&&e.message?e.message:String(e)});}};\n" +
                "window.__vectorBridgeSvgToXml=function(source){try{const r=require('./svg_to_vector').convertSvgToVectorDrawable(String(source));return JSON.stringify({ok:true,output:r.xml,warningCount:(r.warnings||[]).length});}catch(e){return JSON.stringify({ok:false,error:e&&e.message?e.message:String(e)});}};\n" +
                "return 'ready';\n})();";
    }

    private String readAssetText(String path) throws IOException {
        try (InputStream input = activity.getAssets().open(path)) {
            return readUtf8Limited(input);
        }
    }

    private void save(String content, String baseName, String extension, String mimeType,
                      String direction, int warningCount, SaveLocation location) {
        PendingSave save = new PendingSave(content, sanitizeBaseName(baseName), extension, mimeType,
                direction, warningCount, location == null ? SaveLocation.fallback() : location);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            if (trySaveToDocumentParent(save)) return;
            if (save.location.downloadRelativePath != null) {
                saveMediaStore(save, save.location.downloadRelativePath);
            } else {
                saveMediaStore(save, Environment.DIRECTORY_DOWNLOADS + "/" + OUTPUT_DIRECTORY + "/");
            }
            return;
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M
                && activity.checkSelfPermission(Manifest.permission.WRITE_EXTERNAL_STORAGE) != PackageManager.PERMISSION_GRANTED) {
            pendingSave = save;
            activity.requestPermissions(new String[]{Manifest.permission.WRITE_EXTERNAL_STORAGE}, REQUEST_WRITE_DOWNLOADS);
            return;
        }
        saveLegacy(save);
    }

    private boolean trySaveToDocumentParent(PendingSave save) {
        Uri parent = save.location.parentDocumentUri;
        if (parent == null || Build.VERSION.SDK_INT < Build.VERSION_CODES.LOLLIPOP) return false;
        Uri created = null;
        try {
            created = DocumentsContract.createDocument(activity.getContentResolver(), parent,
                    save.mimeType, save.baseName + "." + save.extension);
            if (created == null) return false;
            try (OutputStream output = activity.getContentResolver().openOutputStream(created, "w")) {
                if (output == null) throw new IOException("Unable to open the sibling output file.");
                output.write(save.content.getBytes(StandardCharsets.UTF_8));
            }
            String actualName = queryDisplayName(created);
            String display = save.location.displayDirectory != null
                    ? save.location.displayDirectory + "/" + (actualName == null ? save.baseName + "." + save.extension : actualName)
                    : "Same folder/" + (actualName == null ? save.baseName + "." + save.extension : actualName);
            callback.onSuccess(display, save.direction, save.warningCount);
            return true;
        } catch (Exception ignored) {
            if (created != null) {
                try { DocumentsContract.deleteDocument(activity.getContentResolver(), created); } catch (Exception ignoredDelete) {}
            }
            return false;
        }
    }

    private void saveMediaStore(PendingSave save, String requestedRelativePath) {
        ContentResolver resolver = activity.getContentResolver();
        String relativePath = normalizeDownloadRelativePath(requestedRelativePath);
        if (relativePath == null) relativePath = Environment.DIRECTORY_DOWNLOADS + "/" + OUTPUT_DIRECTORY + "/";
        Uri uri = null;
        try {
            String fileName = uniqueMediaStoreName(resolver, relativePath, save.baseName, save.extension);
            ContentValues values = new ContentValues();
            values.put(MediaStore.MediaColumns.DISPLAY_NAME, fileName);
            values.put(MediaStore.MediaColumns.MIME_TYPE, save.mimeType);
            values.put(MediaStore.MediaColumns.RELATIVE_PATH, relativePath);
            values.put(MediaStore.MediaColumns.IS_PENDING, 1);
            uri = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
            if (uri == null) throw new IOException("Android did not create the destination file.");
            try (OutputStream output = resolver.openOutputStream(uri, "w")) {
                if (output == null) throw new IOException("Unable to open the destination file.");
                output.write(save.content.getBytes(StandardCharsets.UTF_8));
            }
            ContentValues ready = new ContentValues();
            ready.put(MediaStore.MediaColumns.IS_PENDING, 0);
            resolver.update(uri, ready, null, null);
            callback.onSuccess(relativePath + fileName, save.direction, save.warningCount);
        } catch (Exception error) {
            if (uri != null) resolver.delete(uri, null, null);
            callback.onError("Unable to save converted file: " + readableMessage(error));
        }
    }

    private String uniqueMediaStoreName(ContentResolver resolver, String relativePath, String base, String ext) {
        String candidate = base + "." + ext;
        int suffix = 1;
        while (mediaStoreNameExists(resolver, relativePath, candidate)) {
            candidate = base + "_" + suffix++ + "." + ext;
        }
        return candidate;
    }

    private boolean mediaStoreNameExists(ContentResolver resolver, String relativePath, String name) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) return false;
        String selection = MediaStore.MediaColumns.RELATIVE_PATH + "=? AND " + MediaStore.MediaColumns.DISPLAY_NAME + "=?";
        try (Cursor cursor = resolver.query(MediaStore.Downloads.EXTERNAL_CONTENT_URI,
                new String[]{MediaStore.MediaColumns._ID}, selection, new String[]{relativePath, name}, null)) {
            return cursor != null && cursor.moveToFirst();
        }
    }

    private void saveLegacy(PendingSave save) {
        try {
            File dir = save.location.legacyParentDirectory;
            if (dir == null) {
                File downloads = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS);
                dir = new File(downloads, OUTPUT_DIRECTORY);
            }
            if (!dir.exists() && !dir.mkdirs()) throw new IOException("Unable to create " + dir.getAbsolutePath());
            File out = new File(dir, save.baseName + "." + save.extension);
            int suffix = 1;
            while (out.exists()) out = new File(dir, save.baseName + "_" + suffix++ + "." + save.extension);
            try (FileOutputStream stream = new FileOutputStream(out, false)) {
                stream.write(save.content.getBytes(StandardCharsets.UTF_8));
            }
            callback.onSuccess(out.getAbsolutePath(), save.direction, save.warningCount);
        } catch (Exception error) {
            callback.onError("Unable to save converted file: " + readableMessage(error));
        }
    }

    private SaveLocation inferSaveLocation(Uri uri) {
        if (uri == null) return SaveLocation.fallback();
        Uri parentDocumentUri = null;
        String displayDirectory = null;
        String downloadRelativePath = queryRelativePath(uri);
        File legacyParent = null;

        String scheme = uri.getScheme();
        if ("file".equalsIgnoreCase(scheme)) {
            String path = uri.getPath();
            if (path != null) {
                File source = new File(path);
                legacyParent = source.getParentFile();
                displayDirectory = legacyParent == null ? null : legacyParent.getAbsolutePath();
                if (downloadRelativePath == null) downloadRelativePath = relativeDownloadPathFromAbsolute(path);
            }
        }

        if (legacyParent == null) {
            String exposedAbsolutePath = queryAbsolutePath(uri);
            if (exposedAbsolutePath != null) {
                File source = new File(exposedAbsolutePath);
                legacyParent = source.getParentFile();
                displayDirectory = legacyParent == null ? null : legacyParent.getAbsolutePath();
                if (downloadRelativePath == null) downloadRelativePath = relativeDownloadPathFromAbsolute(exposedAbsolutePath);
            }
        }

        if (DocumentsContract.isDocumentUri(activity, uri)) {
            try {
                String authority = uri.getAuthority();
                String documentId = DocumentsContract.getDocumentId(uri);
                if (authority != null && documentId != null) {
                    String parentId = parentDocumentId(documentId);
                    if (parentId != null) {
                        parentDocumentUri = DocumentsContract.buildDocumentUri(authority, parentId);
                    }
                    String absolute = absolutePathFromExternalStorageDocument(authority, documentId);
                    if (absolute != null) {
                        File source = new File(absolute);
                        legacyParent = source.getParentFile();
                        displayDirectory = legacyParent == null ? null : legacyParent.getAbsolutePath();
                        if (downloadRelativePath == null) downloadRelativePath = relativeDownloadPathFromAbsolute(absolute);
                    }
                }
            } catch (Exception ignored) {}
        }

        return new SaveLocation(parentDocumentUri, normalizeDownloadRelativePath(downloadRelativePath), legacyParent, displayDirectory);
    }

    private String queryRelativePath(Uri uri) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) return null;
        try (Cursor cursor = activity.getContentResolver().query(uri,
                new String[]{MediaStore.MediaColumns.RELATIVE_PATH}, null, null, null)) {
            if (cursor != null && cursor.moveToFirst()) {
                int index = cursor.getColumnIndex(MediaStore.MediaColumns.RELATIVE_PATH);
                if (index >= 0) return cursor.getString(index);
            }
        } catch (Exception ignored) {}
        return null;
    }


    private String queryAbsolutePath(Uri uri) {
        if (uri == null || !"content".equalsIgnoreCase(uri.getScheme())) return null;
        try (Cursor cursor = activity.getContentResolver().query(uri, new String[]{"_data"}, null, null, null)) {
            if (cursor != null && cursor.moveToFirst()) {
                int index = cursor.getColumnIndex("_data");
                if (index >= 0) {
                    String path = cursor.getString(index);
                    if (path != null && !path.trim().isEmpty()) return path;
                }
            }
        } catch (Exception ignored) {}
        return null;
    }

    private static String parentDocumentId(String documentId) {
        if (documentId == null || documentId.startsWith("raw:")) return null;
        int colon = documentId.indexOf(':');
        String prefix = colon >= 0 ? documentId.substring(0, colon + 1) : "";
        String path = colon >= 0 ? documentId.substring(colon + 1) : documentId;
        int slash = path.lastIndexOf('/');
        if (slash < 0) return prefix.isEmpty() ? null : prefix.substring(0, prefix.length() - 1) + ":";
        return prefix + path.substring(0, slash);
    }

    private static String absolutePathFromExternalStorageDocument(String authority, String documentId) {
        if (!"com.android.externalstorage.documents".equals(authority) || documentId == null) return null;
        if (documentId.startsWith("raw:")) return documentId.substring(4);
        int colon = documentId.indexOf(':');
        if (colon < 0) return null;
        String volume = documentId.substring(0, colon);
        String relative = documentId.substring(colon + 1);
        if (!"primary".equalsIgnoreCase(volume)) return null;
        return new File(Environment.getExternalStorageDirectory(), relative).getAbsolutePath();
    }

    private static String relativeDownloadPathFromAbsolute(String absolutePath) {
        if (absolutePath == null) return null;
        try {
            File root = Environment.getExternalStorageDirectory();
            String rootPath = root.getCanonicalPath();
            String parentPath = new File(absolutePath).getParentFile().getCanonicalPath();
            if (!parentPath.startsWith(rootPath + File.separator)) return null;
            String relative = parentPath.substring(rootPath.length() + 1).replace(File.separatorChar, '/');
            if (relative.equalsIgnoreCase("Download") || relative.equalsIgnoreCase("Downloads")) return "Download/";
            if (relative.regionMatches(true, 0, "Download/", 0, 9)) return "Download/" + relative.substring(9) + "/";
            if (relative.regionMatches(true, 0, "Downloads/", 0, 10)) return "Download/" + relative.substring(10) + "/";
        } catch (IOException ignored) {}
        return null;
    }

    private static String normalizeDownloadRelativePath(String path) {
        if (path == null) return null;
        String clean = path.trim().replace('\\', '/');
        while (clean.startsWith("/")) clean = clean.substring(1);
        if (clean.equalsIgnoreCase("Downloads")) clean = "Download";
        if (clean.regionMatches(true, 0, "Downloads/", 0, 10)) clean = "Download/" + clean.substring(10);
        if (!clean.equalsIgnoreCase("Download") && !clean.regionMatches(true, 0, "Download/", 0, 9)) return null;
        if (!clean.endsWith("/")) clean += "/";
        return clean;
    }

    private String queryDisplayName(Uri uri) {
        if ("file".equalsIgnoreCase(uri.getScheme())) {
            String path = uri.getPath();
            return path == null ? null : new File(path).getName();
        }
        try (Cursor cursor = activity.getContentResolver().query(uri,
                new String[]{OpenableColumns.DISPLAY_NAME}, null, null, null)) {
            if (cursor != null && cursor.moveToFirst()) {
                int index = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME);
                if (index >= 0) return cursor.getString(index);
            }
        } catch (Exception ignored) {}
        return uri.getLastPathSegment();
    }

    private static String readUtf8Limited(InputStream input) throws IOException {
        ByteArrayOutputStream output = new ByteArrayOutputStream();
        byte[] buffer = new byte[32 * 1024];
        int total = 0;
        int count;
        while ((count = input.read(buffer)) != -1) {
            total += count;
            if (total > MAX_INPUT_BYTES) throw new IOException("The received file is too large.");
            output.write(buffer, 0, count);
        }
        return output.toString(StandardCharsets.UTF_8.name());
    }

    private static String stripExtension(String name) {
        String clean = name == null ? "vector" : name.trim();
        int slash = Math.max(clean.lastIndexOf('/'), clean.lastIndexOf('\\'));
        if (slash >= 0) clean = clean.substring(slash + 1);
        int dot = clean.lastIndexOf('.');
        if (dot > 0) clean = clean.substring(0, dot);
        return clean.isEmpty() ? "vector" : clean;
    }

    private static String sanitizeBaseName(String name) {
        String value = stripExtension(name).replaceAll("[\\\\/:*?\"<>|\\p{Cntrl}]", "_").trim();
        while (value.endsWith(".")) value = value.substring(0, value.length() - 1).trim();
        return value.isEmpty() ? "vector" : value;
    }

    private static String readableMessage(Throwable error) {
        String message = error == null ? null : error.getMessage();
        return message == null || message.trim().isEmpty() ? "Unknown error" : message.trim();
    }

    private static final class InputPayload {
        final String name;
        final String text;
        final SaveLocation saveLocation;
        InputPayload(String name, String text, SaveLocation saveLocation) {
            this.name = name;
            this.text = text;
            this.saveLocation = saveLocation;
        }
    }

    private static final class SaveLocation {
        final Uri parentDocumentUri;
        final String downloadRelativePath;
        final File legacyParentDirectory;
        final String displayDirectory;

        SaveLocation(Uri parentDocumentUri, String downloadRelativePath, File legacyParentDirectory, String displayDirectory) {
            this.parentDocumentUri = parentDocumentUri;
            this.downloadRelativePath = downloadRelativePath;
            this.legacyParentDirectory = legacyParentDirectory;
            this.displayDirectory = displayDirectory;
        }

        static SaveLocation fallback() {
            return new SaveLocation(null, null, null, null);
        }
    }

    private static final class PendingSave {
        final String content, baseName, extension, mimeType, direction;
        final int warningCount;
        final SaveLocation location;

        PendingSave(String content, String baseName, String extension, String mimeType,
                    String direction, int warningCount, SaveLocation location) {
            this.content = content;
            this.baseName = baseName;
            this.extension = extension;
            this.mimeType = mimeType;
            this.direction = direction;
            this.warningCount = warningCount;
            this.location = location;
        }
    }
}
