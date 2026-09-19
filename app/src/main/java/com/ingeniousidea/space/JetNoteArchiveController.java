package com.ingeniousidea.space;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.database.Cursor;
import android.provider.OpenableColumns;
import android.os.ParcelFileDescriptor;
import android.webkit.WebView;
import android.widget.Toast;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.BufferedInputStream;
import java.io.BufferedOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.security.DigestInputStream;
import java.security.MessageDigest;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Date;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;
import java.util.zip.ZipOutputStream;

/**
 * Version 2 post-only .jnote importer/exporter.
 *
 * Media is always streamed. Import is two-phase: validate to a staging directory,
 * commit media, then JavaScript commits IndexedDB and tells native code to
 * finalize. If IndexedDB fails, JavaScript asks native code to roll media back.
 */
final class JetNoteArchiveController {
    private static final int REQUEST_EXPORT = 1301;
    private static final int REQUEST_IMPORT = 1302;
    private static final int FORMAT_VERSION = 2;
    private static final long MAX_METADATA_BYTES = 32L * 1024L * 1024L;
    private static final int MAX_ZIP_ENTRIES = 100_000;
    private static final int COPY_BUFFER = 128 * 1024;

    private final Activity activity;
    private final WebView webView;
    private final AttachmentStore store;
    private final ExecutorService io = Executors.newSingleThreadExecutor();
    private final Map<String, ImportSession> sessions = new HashMap<>();

    private volatile boolean destroyed;
    private volatile boolean exportCancellationRequested;
    private volatile boolean importCancellationRequested;
    private volatile boolean importCancellationNotified;
    private volatile Uri activeExportDestination;
    private volatile String activeImportToken;
    private String pendingExportPayload;
    private String pendingImportMode;

    JetNoteArchiveController(Activity activity, WebView webView, AttachmentStore store) {
        this.activity = activity;
        this.webView = webView;
        this.store = store;
    }

    void requestExport(String payload) {
        activity.runOnUiThread(() -> {
            try {
                validateExportPayload(payload);
            } catch (Exception e) {
                dispatchExportFinished(false, "Invalid export data: " + safeMessage(e));
                return;
            }

            exportCancellationRequested = false;
            pendingExportPayload = null;
            dispatchProgress("export", "prepare", 0, 0, 0, "Preparing export…");
            io.execute(() -> {
                String datePattern = FileTaskManager.languageValue(activity, "fileTaskExportDatePattern");
                String filePattern = FileTaskManager.languageValue(activity, "fileTaskExportFileNamePattern");
                String mime = FileTaskManager.languageValue(activity, "fileTaskExportMimeType");
                String date = new SimpleDateFormat(datePattern, Locale.US).format(new Date());
                String requestedName = filePattern.replace("{date}", date);
                FileTaskManager.Destination destination = FileTaskManager.prepareExportDestination(activity, requestedName, mime);
                if (destination == null) {
                    dispatchExportFinished(false, FileTaskManager.languageValue(activity, "fileTaskStorageUnavailableTitle"));
                    return;
                }
                activeExportDestination = destination.uri;
                FileTaskManager.notifyExportStarted(activity, destination);
                dispatchProgress("export", "prepare", 0, 0, 1, "Building backup…");
                exportArchive(destination, payload);
            });
        });
    }

    void importFromUri(Uri source, String mode) {
        importCancellationRequested = false;
        importCancellationNotified = false;
        if (source == null) {
            dispatchImportError("Invalid import file URI.");
            return;
        }
        io.execute(() -> stageAndValidateImport(source, normalizeMode(mode)));
    }


    void requestImport(String mode) {
        activity.runOnUiThread(() -> {
            importCancellationRequested = false;
            importCancellationNotified = false;
            pendingImportMode = normalizeMode(mode);
            dispatchProgress("import", "select", 0, 0, 0, "Choose a .jnote file");
            Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
            intent.addCategory(Intent.CATEGORY_OPENABLE);
            intent.setType("*/*");
            intent.putExtra(Intent.EXTRA_MIME_TYPES, new String[]{
                    "application/vnd.jnote+zip", "application/vnd.jet-note+zip", "application/zip", "application/octet-stream"
            });
            intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            try {
                activity.startActivityForResult(intent, REQUEST_IMPORT);
            } catch (RuntimeException e) {
                pendingImportMode = null;
                dispatchImportError("No file picker is available.");
            }
        });
    }

    boolean handles(int requestCode) {
        return requestCode == REQUEST_IMPORT;
    }

    void onActivityResult(int requestCode, int resultCode, Intent data) {

        if (requestCode == REQUEST_IMPORT) {
            String mode = pendingImportMode == null ? "merge" : pendingImportMode;
            pendingImportMode = null;
            if (importCancellationRequested || resultCode != Activity.RESULT_OK || data == null || data.getData() == null) {
                notifyImportCancelledOnce();
                return;
            }
            Uri source = data.getData();
            dispatchProgress("import", "read", 0, querySize(source), 1, "Reading backup…");
            io.execute(() -> stageAndValidateImport(source, mode));
        }
    }

    void cancelCurrentOperation(String operation) {
        if ("export".equalsIgnoreCase(operation)) {
            exportCancellationRequested = true;
            pendingExportPayload = null;
            return;
        }
        if (!"import".equalsIgnoreCase(operation)) return;
        importCancellationRequested = true;
        pendingImportMode = null;
        try {
            io.execute(() -> {
                String token = activeImportToken;
                if (token != null) {
                    ImportSession session = sessions.remove(token);
                    if (session != null) {
                        rollbackFiles(session);
                        deleteRecursively(session.stageDir);
                    }
                    activeImportToken = null;
                }
                notifyImportCancelledOnce();
            });
        } catch (java.util.concurrent.RejectedExecutionException ignored) {
            notifyImportCancelledOnce();
        }
    }

    private void throwIfExportCancelled() throws IOException {
        if (exportCancellationRequested) throw new IOException("Export cancelled");
    }

    private void throwIfImportCancelled() throws IOException {
        if (importCancellationRequested) throw new IOException("Import cancelled");
    }

    private synchronized void notifyImportCancelledOnce() {
        if (importCancellationNotified) return;
        importCancellationNotified = true;
        dispatchImportError("Import cancelled");
    }

    void commitImportMedia(String token) {
        io.execute(() -> {
            ImportSession session = sessions.get(token);
            if (session == null) {
                dispatchImportError("Import session expired");
                return;
            }
            try {
                throwIfImportCancelled();
                dispatchProgress("import", "commit", 0, 0, 75, "Installing media…");
                commitStagedMedia(session);
                throwIfImportCancelled();
                session.mediaCommitted = true;
                dispatchMediaCommitted(token);
            } catch (Exception e) {
                rollbackFiles(session);
                cleanupSession(token);
                if (importCancellationRequested || "Import cancelled".equals(safeMessage(e))) notifyImportCancelledOnce();
                else dispatchImportError("Media import failed: " + safeMessage(e));
            }
        });
    }

    void finalizeImport(String token) {
        io.execute(() -> {
            ImportSession session = sessions.remove(token);
            if (importCancellationRequested) {
                if (session != null) {
                    rollbackFiles(session);
                    deleteRecursively(session.stageDir);
                }
                activeImportToken = null;
                notifyImportCancelledOnce();
                return;
            }
            if (session != null) deleteRecursively(session.stageDir);
            activeImportToken = null;
            importCancellationRequested = false;
            dispatchProgress("import", "done", 1, 1, 100, UiLanguage.text(activity, "archiveImportCommitted"));
            activity.runOnUiThread(() -> Toast.makeText(activity, UiLanguage.text(activity, "archiveImportCompleteToast"), Toast.LENGTH_SHORT).show());
        });
    }

    void rollbackImport(String token) {
        io.execute(() -> {
            ImportSession session = sessions.remove(token);
            if (session != null) {
                rollbackFiles(session);
                deleteRecursively(session.stageDir);
            }
            if (token != null && token.equals(activeImportToken)) activeImportToken = null;
        });
    }

    void destroy() {
        // A controller is owned by exactly one Activity/WebView. Never allow an export
        // started by a dead Activity to keep writing in a half-detached state. The
        // export loop checks this flag for every streamed chunk and removes an incomplete
        // destination when cancellation is observed.
        exportCancellationRequested = true;
        importCancellationRequested = true;
        pendingExportPayload = null;
        pendingImportMode = null;
        destroyed = true;

        // All session cleanup stays on the same single-thread executor so it cannot race
        // an import commit. IDB may have committed immediately before Activity destruction,
        // therefore published media is deliberately never deleted here.
        try {
            io.execute(() -> {
                for (ImportSession session : sessions.values()) deleteRecursively(session.stageDir);
                sessions.clear();
            });
        } catch (java.util.concurrent.RejectedExecutionException ignored) {
            // Defensive only: destroy may be called after an earlier shutdown path.
        }
        io.shutdown();
    }

    private void exportArchive(FileTaskManager.Destination destination, String payload) {
        File tempArchive = new File(activity.getCacheDir(), "jetnote-export-" + UUID.randomUUID() + ".jnote");
        boolean destinationCreated = true;
        try {
            throwIfExportCancelled();
            JSONObject root = new JSONObject(payload);
            JSONArray posts = root.optJSONArray("posts");
            if (posts == null) throw new JSONException("posts missing");
            JSONObject profile = root.optJSONObject("profile");
            JSONObject config = root.optJSONObject("config");

            LinkedHashMap<String, JSONObject> attachments = collectAttachments(posts);
            JSONObject checksums = new JSONObject();

            JSONObject manifest = new JSONObject();
            manifest.put("format", "jet-note");
            manifest.put("formatVersion", FORMAT_VERSION);
            manifest.put("app", "Jet Note");
            manifest.put("appVersion", root.optString("appVersion", "3.7"));
            manifest.put("createdAt", isoNow());
            manifest.put("encoding", "UTF-8");
            JSONObject content = new JSONObject();
            content.put("posts", "data/posts.json");
            if (profile != null) content.put("profile", "data/profile.json");
            if (config != null) content.put("config", "data/config.json");
            manifest.put("content", content);

            long mediaTotal = 0L;
            for (Map.Entry<String, JSONObject> item : attachments.entrySet()) {
                throwIfExportCancelled();
                File file = store.fileForArchivePath(item.getKey());
                if (file == null || !file.isFile()) throw new IOException("Attachment missing: " + item.getKey());
                mediaTotal += Math.max(0L, file.length());
            }
            long mediaDone = 0L;

            FileOutputStream fileOut = new FileOutputStream(tempArchive);
            try (ZipOutputStream zip = new ZipOutputStream(new BufferedOutputStream(fileOut))) {
                putCheckedText(zip, "manifest.json", manifest.toString(2), checksums);
                putCheckedText(zip, "data/posts.json", posts.toString(2), checksums);
                if (profile != null) putCheckedText(zip, "data/profile.json", profile.toString(2), checksums);
                if (config != null) putCheckedText(zip, "data/config.json", config.toString(2), checksums);

                for (Map.Entry<String, JSONObject> item : attachments.entrySet()) {
                    throwIfExportCancelled();
                    String path = item.getKey();
                    File file = store.fileForArchivePath(path);
                    if (file == null || !file.isFile()) throw new IOException("Attachment missing: " + path);

                    MessageDigest digest = AttachmentStore.sha256Digest();
                    zip.putNextEntry(new ZipEntry(path));
                    long base = mediaDone;
                    try (DigestInputStream in = new DigestInputStream(new BufferedInputStream(new FileInputStream(file)), digest)) {
                        byte[] buffer = new byte[COPY_BUFFER];
                        int read;
                        long fileDone = 0L;
                        while ((read = in.read(buffer)) != -1) {
                            throwIfExportCancelled();
                            zip.write(buffer, 0, read);
                            fileDone += read;
                            long totalDone = base + fileDone;
                            int percent = 5 + scaledPercent(totalDone, mediaTotal, 60);
                            dispatchProgress("export", "archive", totalDone, mediaTotal, percent,
                                    "Packing attachments " + Math.min(attachments.size(), checksums.length()) + "/" + attachments.size());
                        }
                    }
                    zip.closeEntry();
                    mediaDone += file.length();

                    String actualSha = AttachmentStore.hex(digest.digest());
                    String expectedSha = item.getValue().optString("sha256", "");
                    if (!expectedSha.isEmpty() && !expectedSha.equalsIgnoreCase(actualSha)) {
                        throw new IOException("Attachment integrity mismatch: " + path);
                    }
                    checksums.put(path, actualSha);
                }

                putText(zip, "checksums.json", checksums.toString(2));
                zip.finish();
                zip.flush();
                fileOut.getFD().sync();
            }

            throwIfExportCancelled();
            dispatchProgress("export", "verify", tempArchive.length(), tempArchive.length(), 72, "Verifying exported backup…");
            verifyExportArchive(tempArchive, attachments);
            dispatchProgress("export", "verify", tempArchive.length(), tempArchive.length(), 82, "Export verification passed");

            long total = tempArchive.length();
            try (InputStream in = new BufferedInputStream(new FileInputStream(tempArchive));
                 java.io.OutputStream out = FileTaskManager.openDestination(activity, destination)) {
                byte[] buffer = new byte[COPY_BUFFER];
                long done = 0L;
                int read;
                while ((read = in.read(buffer)) != -1) {
                    throwIfExportCancelled();
                    out.write(buffer, 0, read);
                    done += read;
                    int percent = 82 + scaledPercent(done, total, 17);
                    dispatchProgress("export", "write", done, total, percent, "Writing backup file…");
                }
                out.flush();
            }

            long targetSize = FileTaskManager.destinationSize(activity, destination);
            if (targetSize >= 0 && targetSize != total) {
                throw new IOException("Export destination size mismatch: " + targetSize + " / " + total);
            }
            FileTaskManager.completeExport(activity, destination);
            dispatchProgress("export", "done", total, total, 100, "Export complete and verified");
            dispatchExportFinished(true, "Export complete · " + formatBytes(total));
        } catch (Exception e) {
            boolean cancelled = exportCancellationRequested || "Export cancelled".equals(safeMessage(e));
            if (destinationCreated) {
                if (cancelled) FileTaskManager.abort(activity, destination);
                else FileTaskManager.failExport(activity, destination);
            }
            if (cancelled) {
                dispatchExportFinished(false, "Export cancelled");
            } else {
                dispatchProgress("export", "error", 0, 0, 0, "Export failed: " + safeMessage(e));
                dispatchExportFinished(false, "Export failed: " + safeMessage(e));
            }
        } finally {
            activeExportDestination = null;
            exportCancellationRequested = false;
            //noinspection ResultOfMethodCallIgnored
            tempArchive.delete();
        }
    }

    private void verifyExportArchive(File archive, LinkedHashMap<String, JSONObject> attachments) throws Exception {
        try (java.util.zip.ZipFile zip = new java.util.zip.ZipFile(archive)) {
            ZipEntry manifestEntry = zip.getEntry("manifest.json");
            ZipEntry postsEntry = zip.getEntry("data/posts.json");
            ZipEntry checksumsEntry = zip.getEntry("checksums.json");
            if (manifestEntry == null || postsEntry == null || checksumsEntry == null) {
                throw new IOException("Export is missing required entries");
            }
            JSONObject checksums;
            try (InputStream in = zip.getInputStream(checksumsEntry)) {
                checksums = new JSONObject(readUtf8Limited(in, MAX_METADATA_BYTES));
            }
            java.util.Iterator<String> keys = checksums.keys();
            int verified = 0;
            while (keys.hasNext()) {
                throwIfExportCancelled();
                String path = keys.next();
                ZipEntry entry = zip.getEntry(path);
                if (entry == null || entry.isDirectory()) throw new IOException("Export is missing: " + path);
                MessageDigest digest = AttachmentStore.sha256Digest();
                try (DigestInputStream in = new DigestInputStream(new BufferedInputStream(zip.getInputStream(entry)), digest)) {
                    byte[] buffer = new byte[COPY_BUFFER];
                    while (in.read(buffer) != -1) throwIfExportCancelled();
                }
                String actual = AttachmentStore.hex(digest.digest());
                if (!actual.equalsIgnoreCase(checksums.getString(path))) throw new IOException("Export checksum failed: " + path);
                verified++;
            }
            for (String path : attachments.keySet()) {
                if (!checksums.has(path)) throw new IOException("Attachment missing from checksum manifest: " + path);
            }
            if (verified < 2 + attachments.size()) throw new IOException("Unexpected export verification entry count");
        }
    }

    private void stageAndValidateImport(Uri source, String mode) {
        String token = UUID.randomUUID().toString();
        activeImportToken = token;
        File stageDir = new File(activity.getCacheDir(), "jetnote-import-" + token);
        if (!stageDir.mkdirs()) {
            activeImportToken = null;
            dispatchImportError("Unable to create import staging directory");
            return;
        }

        try {
            throwIfImportCancelled();
            dispatchProgress("import", "read", 0, querySize(source), 2, "Copying backup to a safe staging area…");
            Map<String, String> mediaDigests = extractZip(source, stageDir);
            throwIfImportCancelled();
            dispatchProgress("import", "validate", 0, 0, 62, "Validating manifest and checksums…");
            File manifestFile = new File(stageDir, "manifest.json");
            File postsFile = new File(stageDir, "data/posts.json");
            File profileFile = new File(stageDir, "data/profile.json");
            File configFile = new File(stageDir, "data/config.json");
            File checksumsFile = new File(stageDir, "checksums.json");
            requireMetadataFile(manifestFile);
            requireMetadataFile(postsFile);
            requireMetadataFile(checksumsFile);

            throwIfImportCancelled();
            JSONObject manifest = new JSONObject(readUtf8Limited(manifestFile));
            if (!"jet-note".equals(manifest.optString("format"))) throw new IOException("Not a Jet Note backup file");
            if (manifest.optInt("formatVersion", -1) != FORMAT_VERSION) {
                throw new IOException("Unsupported formatVersion=" + manifest.optInt("formatVersion", -1));
            }

            JSONObject content = manifest.optJSONObject("content");
            if (!"UTF-8".equals(manifest.optString("encoding"))
                    || content == null
                    || !"data/posts.json".equals(content.optString("posts"))) {
                throw new IOException("Invalid content map");
            }
            java.util.Iterator<String> contentKeys = content.keys();
            while (contentKeys.hasNext()) {
                String key = contentKeys.next();
                if (!"posts".equals(key) && !"profile".equals(key) && !"config".equals(key)) {
                    throw new IOException("Invalid content map");
                }
            }
            boolean hasProfile = content.has("profile");
            if (hasProfile && !"data/profile.json".equals(content.optString("profile"))) {
                throw new IOException("Invalid profile content path");
            }
            if (hasProfile) requireMetadataFile(profileFile);
            // Configuration is optional. Older/intermediate exporters may leave a
            // stale manifest.content.config entry even when data/config.json was not
            // written. Importing note data must never fail only because configuration
            // is absent; use it only when the file is actually present.
            boolean configDeclared = content.has("config");
            if (configDeclared && !"data/config.json".equals(content.optString("config"))) {
                throw new IOException("Invalid config content path");
            }
            boolean hasConfig = configDeclared && configFile.isFile();

            String postsJson = readUtf8Limited(postsFile);
            String profileJson = hasProfile ? readUtf8Limited(profileFile) : null;
            String configJson = hasConfig ? readUtf8Limited(configFile) : null;
            if (configJson != null) new JSONObject(configJson);
            File configDir = new File(stageDir, "config");
            if (configDir.isDirectory()) {
                JSONObject folder = new JSONObject();
                File[] sectionFiles = configDir.listFiles();
                if (sectionFiles != null) {
                    java.util.Arrays.sort(sectionFiles, (a, b) -> a.getName().compareTo(b.getName()));
                    for (File sectionFile : sectionFiles) {
                        if (!sectionFile.isFile() || !isSafeConfigSectionName(sectionFile.getName())) {
                            throw new IOException("Invalid config folder entry");
                        }
                        folder.put(sectionFile.getName(), new JSONObject(readUtf8Limited(sectionFile)));
                    }
                }
                if (folder.length() > 0) {
                    JSONObject wrapper = new JSONObject();
                    wrapper.put("__jetnoteConfigFolder", folder);
                    configJson = wrapper.toString();
                }
            }
            if (profileJson != null) validateProfileJson(profileJson);
            JSONArray posts = new JSONArray(postsJson);
            JSONObject checksums = new JSONObject(readUtf8Limited(checksumsFile));
            for (String required : new String[]{"manifest.json", "data/posts.json"}) {
                throwIfImportCancelled();
                String expected = checksums.optString(required, "");
                File requiredFile = fileInside(stageDir, required);
                if (expected.isEmpty() || !expected.equalsIgnoreCase(sha256ImportFile(requiredFile))) {
                    throw new IOException("Checksum mismatch: " + required);
                }
            }
            if (hasProfile) {
                String expectedProfileSha = checksums.optString("data/profile.json", "");
                if (expectedProfileSha.isEmpty()
                        || !expectedProfileSha.equalsIgnoreCase(sha256ImportFile(profileFile))) {
                    throw new IOException("Checksum mismatch: data/profile.json");
                }
            }
            if (hasConfig) {
                String expectedConfigSha = checksums.optString("data/config.json", "");
                if (expectedConfigSha.isEmpty()
                        || !expectedConfigSha.equalsIgnoreCase(sha256ImportFile(configFile))) {
                    throw new IOException("Checksum mismatch: data/config.json");
                }
            }
            java.util.Iterator<String> keys=checksums.keys();
            while(keys.hasNext()){
                throwIfImportCancelled();
                String path=keys.next();validateArchiveEntryName(path);
                if("checksums.json".equals(path))throw new IOException("Invalid self checksum");
                File checked=fileInside(stageDir,path);
                // data/config.json is optional by design. A stale checksum entry from
                // an intermediate exporter must not block restoration of note data.
                if ("data/config.json".equals(path) && !checked.isFile()) continue;
                if(!checked.isFile()||!checksums.getString(path).equalsIgnoreCase(sha256ImportFile(checked)))throw new IOException("Checksum mismatch: "+path);
            }
            // A hashes JSON as well as media; legacy variants only hash media. Verify all
            // supplied hashes and require hashes for every media file in either format.
            for(String path:mediaDigests.keySet()){
                throwIfImportCancelled();
                if(!mediaDigests.get(path).equalsIgnoreCase(checksums.optString(path,"")))throw new IOException("Unchecked media: "+path);
            }
            LinkedHashMap<String, JSONObject> attachments = collectAttachments(posts);
            if (!mediaDigests.keySet().equals(attachments.keySet())) {
                java.util.Set<String> extra = new java.util.HashSet<>(mediaDigests.keySet());
                extra.removeAll(attachments.keySet());
                java.util.Set<String> missing = new java.util.HashSet<>(attachments.keySet());
                missing.removeAll(mediaDigests.keySet());
                throw new IOException("Media manifest does not match the ZIP" + (!missing.isEmpty() ? "; missing " + missing.size() + " entries" : "") + (!extra.isEmpty() ? "; extra " + extra.size() + " entries" : ""));
            }

            List<String> referencedMedia = new ArrayList<>();
            for (Map.Entry<String, JSONObject> item : attachments.entrySet()) {
                throwIfImportCancelled();
                String path = item.getKey();
                validateMediaPath(path);
                File file = fileInside(stageDir, path);
                if (!file.isFile()) throw new IOException("Backup is missing attachment: " + path);

                String expected = checksums.optString(path, "");
                String actual = mediaDigests.get(path);
                if (expected.isEmpty() || actual == null || !expected.equalsIgnoreCase(actual)) {
                    throw new IOException("SHA-256 verification failed: " + path);
                }
                String metadataSha = item.getValue().optString("sha256", "");
                if (!metadataSha.isEmpty() && !metadataSha.equalsIgnoreCase(actual)) {
                    throw new IOException("Attachment metadata verification failed: " + path);
                }
                JSONObject meta=item.getValue();
                if(meta.has("size")&&!meta.isNull("size")&&meta.getLong("size")!=file.length())throw new IOException("Attachment size mismatch");
                referencedMedia.add(path);
            }

            Map<String, Long> mediaSizes = new HashMap<>();
            for (String path : referencedMedia) mediaSizes.put(path, fileInside(stageDir, path).length());
            throwIfImportCancelled();
            ImportSession session = new ImportSession(token, mode, stageDir, postsJson, profileJson, configJson, referencedMedia, mediaDigests, mediaSizes);
            sessions.put(token, session);
            dispatchProgress("import", "ready", referencedMedia.size(), referencedMedia.size(), 75, "Validation complete. Waiting for import confirmation.");
            dispatchImportValidated(session);
        } catch (Exception e) {
            sessions.remove(token);
            deleteRecursively(stageDir);
            if (token.equals(activeImportToken)) activeImportToken = null;
            if (importCancellationRequested || "Import cancelled".equals(safeMessage(e))) notifyImportCancelledOnce();
            else {
                dispatchProgress("import", "error", 0, 0, 0, "Import validation failed: " + safeMessage(e));
                dispatchImportError("Import validation failed: " + safeMessage(e));
            }
        }
    }

    private Map<String, String> extractZip(Uri source, File stageDir) throws IOException {
        Map<String, String> mediaDigests = new HashMap<>();
        File container = new File(stageDir, "source.zip");
        long sourceTotal = querySize(source);
        try (InputStream sourceStream = openSourceStream(source);
             FileOutputStream out = new FileOutputStream(container)) {
            if (sourceStream == null) throw new IOException("Unable to read backup file");
            byte[] buffer = new byte[COPY_BUFFER];
            long done = 0L;
            int read;
            while ((read = sourceStream.read(buffer)) != -1) {
                throwIfImportCancelled();
                out.write(buffer, 0, read);
                done += read;
                dispatchProgress("import", "read", done, sourceTotal, 2 + scaledPercent(done, sourceTotal, 23), "Reading backup…");
            }
            out.flush();
            out.getFD().sync();
        }
        if (container.length() == 0) throw new IOException("Backup file is empty");
        if (sourceTotal >= 0 && container.length() != sourceTotal) throw new IOException("Backup read is incomplete");

        Map<String, ZipEntry> central = new HashMap<>();
        long expandedTotal = 0L;
        try (java.util.zip.ZipFile directory = new java.util.zip.ZipFile(container)) {
            java.util.Enumeration<? extends ZipEntry> all = directory.entries();
            while (all.hasMoreElements()) {
                throwIfImportCancelled();
                ZipEntry e = all.nextElement();
                String n = e.getName();
                if (central.size() >= MAX_ZIP_ENTRIES || central.put(n, e) != null) throw new IOException("Duplicate or excessive ZIP entries");
                if (e.isDirectory()) {
                    if (!isAllowedDirectory(n)) throw new IOException("Invalid ZIP directory");
                } else {
                    validateArchiveEntryName(n);
                    if (e.getSize() < 0) throw new IOException("Unknown ZIP entry size: " + n);
                    expandedTotal = safeAdd(expandedTotal, e.getSize());
                }
            }
        }
        long usable = stageDir.getUsableSpace();
        if (usable > 0 && expandedTotal > usable - Math.min(128L * 1024L * 1024L, usable / 10)) {
            throw new IOException("Not enough storage to safely extract the backup");
        }

        int entryCount = 0;
        long expandedDone = 0L;
        java.util.Set<String> names = new java.util.HashSet<>();
        try (InputStream raw = new FileInputStream(container);
             ZipInputStream zip = new ZipInputStream(new BufferedInputStream(raw))) {
            ZipEntry entry;
            while ((entry = zip.getNextEntry()) != null) {
                throwIfImportCancelled();
                if (++entryCount > MAX_ZIP_ENTRIES) throw new IOException("Too many ZIP entries");
                String name = entry.getName();
                if (!names.add(name) || !central.containsKey(name)) throw new IOException("Duplicate or inconsistent ZIP entry: " + name);
                if (entry.isDirectory()) {
                    if (!isAllowedDirectory(name)) throw new IOException("Invalid directory: " + name);
                    zip.closeEntry();
                    continue;
                }
                validateArchiveEntryName(name);
                File output = fileInside(stageDir, name);
                File parent = output.getParentFile();
                if (parent != null && !parent.exists() && !parent.mkdirs()) throw new IOException("Unable to create directory");

                long entryDone = 0L;
                long expectedSize = central.get(name).getSize();
                MessageDigest digest = name.startsWith("media/") ? AttachmentStore.sha256Digest() : null;
                try (FileOutputStream out = new FileOutputStream(output)) {
                    byte[] buffer = new byte[COPY_BUFFER];
                    long limit = name.startsWith("media/") ? Long.MAX_VALUE : MAX_METADATA_BYTES;
                    int read;
                    while ((read = zip.read(buffer)) != -1) {
                        throwIfImportCancelled();
                        entryDone += read;
                        if (entryDone > limit) throw new IOException("Entry too large: " + name);
                        out.write(buffer, 0, read);
                        if (digest != null) digest.update(buffer, 0, read);
                        long totalDone = expandedDone + entryDone;
                        dispatchProgress("import", "extract", totalDone, expandedTotal,
                                25 + scaledPercent(totalDone, expandedTotal, 35), "Extracting and verifying…");
                    }
                    out.flush();
                    out.getFD().sync();
                }
                if (entryDone != expectedSize || output.length() != expectedSize) throw new IOException("Incomplete ZIP entry: " + name);
                if (digest != null) mediaDigests.put(name, AttachmentStore.hex(digest.digest()));
                expandedDone += entryDone;
                zip.closeEntry();
                ZipEntry expected = central.get(name);
                if (expected.getSize() != entry.getSize() || expected.getCrc() != entry.getCrc()) throw new IOException("ZIP headers disagree");
            }
        }
        if (names.size() != central.size()) throw new IOException("Truncated ZIP entries");
        //noinspection ResultOfMethodCallIgnored
        container.delete();
        if (entryCount == 0) throw new IOException("Empty or invalid ZIP");
        return mediaDigests;
    }

    private void commitStagedMedia(ImportSession session) throws IOException {
        long total = 0L;
        for (String path : session.mediaPaths) total = safeAdd(total, session.mediaSizes.getOrDefault(path, 0L));
        long done = 0L;
        int index = 0;
        for (String path : session.mediaPaths) {
            throwIfImportCancelled();
            index++;
            File staged = fileInside(session.stageDir, path);
            File target = store.fileForArchivePath(path);
            if (target == null) throw new IOException("Invalid media path: " + path);
            String expectedSha = session.mediaDigests.get(path);
            long expectedSize = session.mediaSizes.getOrDefault(path, staged.length());
            if (expectedSha == null || staged.length() != expectedSize) throw new IOException("Staged media is incomplete: " + path);

            if (target.exists()) {
                if (target.length() != expectedSize) throw new IOException("Attachment ID collision (different size): " + path);
                String existing = sha256ImportFile(target);
                if (!existing.equalsIgnoreCase(expectedSha)) throw new IOException("Attachment ID collision: " + path);
                done += expectedSize;
                dispatchProgress("import", "commit", done, total, 75 + scaledPercent(done, total, 20),
                        "Installing media " + index + "/" + session.mediaPaths.size());
                continue;
            }

            File temp = new File(store.mediaDirectory(), target.getName() + ".import-" + session.token);
            try {
                MessageDigest digest = AttachmentStore.sha256Digest();
                long fileDone = 0L;
                try (InputStream in = new BufferedInputStream(new FileInputStream(staged));
                     FileOutputStream out = new FileOutputStream(temp)) {
                    byte[] buffer = new byte[COPY_BUFFER];
                    int read;
                    while ((read = in.read(buffer)) != -1) {
                        throwIfImportCancelled();
                        out.write(buffer, 0, read);
                        digest.update(buffer, 0, read);
                        fileDone += read;
                        long totalDone = done + fileDone;
                        dispatchProgress("import", "commit", totalDone, total, 75 + scaledPercent(totalDone, total, 20),
                                "Installing media " + index + "/" + session.mediaPaths.size());
                    }
                    out.flush();
                    out.getFD().sync();
                }
                String copiedSha = AttachmentStore.hex(digest.digest());
                if (fileDone != expectedSize || temp.length() != expectedSize || !copiedSha.equalsIgnoreCase(expectedSha)) {
                    throw new IOException("Media copy verification failed: " + path);
                }

                if (!temp.renameTo(target)) {
                    try (InputStream in = new BufferedInputStream(new FileInputStream(temp));
                         FileOutputStream out = new FileOutputStream(target)) {
                        byte[] buffer = new byte[COPY_BUFFER];
                        int read;
                        while ((read = in.read(buffer)) != -1) {
                            throwIfImportCancelled();
                            out.write(buffer, 0, read);
                        }
                        out.flush();
                        out.getFD().sync();
                    }
                    //noinspection ResultOfMethodCallIgnored
                    temp.delete();
                }
                if (!target.isFile() || target.length() != expectedSize || !sha256ImportFile(target).equalsIgnoreCase(expectedSha)) {
                    //noinspection ResultOfMethodCallIgnored
                    target.delete();
                    throw new IOException("Media verification after write failed: " + path);
                }
                session.createdFiles.add(target);
                done += expectedSize;
            } catch (IOException error) {
                //noinspection ResultOfMethodCallIgnored
                temp.delete();
                //noinspection ResultOfMethodCallIgnored
                if (target.exists() && session.createdFiles.contains(target)) target.delete();
                throw error;
            }
        }
        dispatchProgress("import", "commit", total, total, 95, "Media integrity verified");
    }

    private void rollbackFiles(ImportSession session) {
        for (File file : session.createdFiles) {
            //noinspection ResultOfMethodCallIgnored
            file.delete();
        }
        session.createdFiles.clear();
        session.mediaCommitted = false;
    }

    private LinkedHashMap<String, JSONObject> collectAttachments(JSONArray posts) throws JSONException, IOException {
        LinkedHashMap<String, JSONObject> result = new LinkedHashMap<>();
        collectAttachmentsFromArray(posts, result);
        return result;
    }

    private void collectAttachmentsFromArray(JSONArray entries, LinkedHashMap<String, JSONObject> result)
            throws JSONException, IOException {
        for (int i = 0; i < entries.length(); i++) {
            JSONObject entry = entries.getJSONObject(i);
            if(!entry.has("id")||entry.isNull("id")||!"post".equals(entry.optString("type")))throw new IOException("Invalid Entry");
            JSONArray attachments = entry.optJSONArray("attachments");
            if (attachments == null) throw new IOException("Missing attachments array");
            for (int j = 0; j < attachments.length(); j++) {
                JSONObject attachment = attachments.getJSONObject(j);
                String path = attachment.optString("path", "");
                String checksum=attachment.optString("sha256","");
                if(!checksum.matches("(?i)[a-f0-9]{64}"))throw new IOException("Invalid attachment SHA-256");
                String type = attachment.optString("type", "");
                String mime = attachment.optString("mimeType", "");
                if (!("image".equals(type) || "audio".equals(type) || "video".equals(type) || "file".equals(type))) throw new IOException("Invalid attachment type");
                if (mime.isEmpty() || !mime.matches("(?i)^[a-z0-9.+-]+/[a-z0-9.+-]+$")) throw new IOException("Invalid attachment MIME");
                if ("image".equals(type) && !mime.toLowerCase(Locale.US).startsWith("image/")) throw new IOException("Image MIME mismatch");
                if ("audio".equals(type) && !mime.toLowerCase(Locale.US).startsWith("audio/")) throw new IOException("Audio MIME mismatch");
                if ("video".equals(type) && !mime.toLowerCase(Locale.US).startsWith("video/")) throw new IOException("Video MIME mismatch");
                if (attachment.has("size") && !attachment.isNull("size") && attachment.getLong("size") < 0) throw new IOException("Invalid attachment size");
                validateMediaPath(path);
                JSONObject previous = result.get(path);
                if (previous != null) {
                    String a = previous.optString("sha256", "");
                    String b = attachment.optString("sha256", "");
                    if (!a.isEmpty() && !b.isEmpty() && !a.equalsIgnoreCase(b)) {
                        throw new IOException("Different attachments use the same path: " + path);
                    }
                } else {
                    result.put(path, attachment);
                }
            }
        }
    }

    private void validateExportPayload(String payload) throws JSONException, IOException {
        JSONObject root = new JSONObject(payload);
        JSONArray posts = root.optJSONArray("posts");
        if (posts == null) throw new IOException("Missing posts");
        JSONObject profile = root.optJSONObject("profile");
        if (profile != null) validateProfileJson(profile.toString());
        if (root.has("config") && root.optJSONObject("config") == null) throw new IOException("Invalid config");
        collectAttachments(posts);
    }

    private void dispatchScript(String script, android.webkit.ValueCallback<String> callback) {
        activity.runOnUiThread(()->{if(!destroyed)webView.evaluateJavascript(script,callback);});
    }

    private void dispatchImportValidated(ImportSession session) {
        dispatchScript(
                "window.JetNoteArchive&&window.JetNoteArchive.onValidated("
                        + JSONObject.quote(session.token) + ","
                        + JSONObject.quote(session.mode) + ","
                        + JSONObject.quote(session.postsJson) + ","
                        + (session.profileJson == null ? "null" : JSONObject.quote(session.profileJson)) + ","
                        + (session.configJson == null ? "null" : JSONObject.quote(session.configJson)) + ");", null);
    }

    private void dispatchMediaCommitted(String token) {
        dispatchScript(
                "window.JetNoteArchive&&window.JetNoteArchive.onMediaCommitted("
                        + JSONObject.quote(token) + ");", null);
    }

    private void dispatchImportError(String message) {
        dispatchScript(
                "window.JetNoteArchive&&window.JetNoteArchive.onError("
                        + JSONObject.quote(message) + ");", null);
    }

    private void dispatchExportFinished(boolean success, String message) {
        dispatchScript(
                "window.JetNoteArchive&&window.JetNoteArchive.onExportFinished("
                        + success + "," + JSONObject.quote(message) + ");", null);
    }

    private void dispatchProgress(String operation, String phase, long done, long total, int percent, String message) {
        int safePercent = Math.max(0, Math.min(100, percent));
        dispatchScript(
                "window.JetNoteArchive&&window.JetNoteArchive.onProgress("
                        + JSONObject.quote(operation) + ","
                        + JSONObject.quote(phase) + ","
                        + done + "," + total + "," + safePercent + ","
                        + JSONObject.quote(message == null ? "" : message) + ");", null);
    }


    private InputStream openSourceStream(Uri uri) throws IOException {
        if (uri == null) throw new IOException("Invalid import file URI.");
        if ("file".equalsIgnoreCase(uri.getScheme())) {
            String path = uri.getPath();
            if (path == null) throw new IOException("Invalid file path");
            return new FileInputStream(new File(path));
        }
        InputStream in = activity.getContentResolver().openInputStream(uri);
        if (in == null) throw new IOException("Unable to read backup file");
        return in;
    }

    private long querySize(Uri uri) {
        if (uri == null) return -1L;
        if ("file".equalsIgnoreCase(uri.getScheme())) {
            String path = uri.getPath();
            return path == null ? -1L : new File(path).length();
        }
        try (Cursor cursor = activity.getContentResolver().query(uri, new String[]{OpenableColumns.SIZE}, null, null, null)) {
            if (cursor != null && cursor.moveToFirst()) {
                int index = cursor.getColumnIndex(OpenableColumns.SIZE);
                if (index >= 0 && !cursor.isNull(index)) return cursor.getLong(index);
            }
        } catch (Exception ignored) { }
        return -1L;
    }

    private static int scaledPercent(long done, long total, int span) {
        if (span <= 0) return 0;
        if (total <= 0) return 0;
        if (done <= 0) return 0;
        if (done >= total) return span;
        return (int) Math.min(span, (done * span) / total);
    }

    private static long safeAdd(long a, long b) throws IOException {
        if (b < 0 || a > Long.MAX_VALUE - b) throw new IOException("Archive size overflow");
        return a + b;
    }

    private static String formatBytes(long bytes) {
        if (bytes < 1024) return bytes + " B";
        double value = bytes / 1024.0;
        if (value < 1024) return String.format(Locale.US, "%.1f KB", value);
        value /= 1024.0;
        if (value < 1024) return String.format(Locale.US, "%.1f MB", value);
        return String.format(Locale.US, "%.2f GB", value / 1024.0);
    }

    private String sha256ImportFile(File file) throws IOException {
        MessageDigest digest = AttachmentStore.sha256Digest();
        try (InputStream in = new BufferedInputStream(new FileInputStream(file))) {
            byte[] buffer = new byte[COPY_BUFFER];
            int read;
            while ((read = in.read(buffer)) != -1) {
                throwIfImportCancelled();
                digest.update(buffer, 0, read);
            }
        }
        return AttachmentStore.hex(digest.digest());
    }

    private void cleanupSession(String token) {
        ImportSession session = sessions.remove(token);
        if (session != null) deleteRecursively(session.stageDir);
        if (token != null && token.equals(activeImportToken)) activeImportToken = null;
    }

    private static void putCheckedText(ZipOutputStream zip,String path,String text,JSONObject checksums)throws IOException,JSONException{
        byte[] bytes=text.getBytes(StandardCharsets.UTF_8);
        if(bytes.length>MAX_METADATA_BYTES)throw new IOException("Metadata exceeds 32 MiB");
        checksums.put(path,AttachmentStore.hex(AttachmentStore.sha256Digest().digest(bytes)));
        putText(zip,path,text);
    }

    private static void putText(ZipOutputStream zip, String path, String value) throws IOException {
        zip.putNextEntry(new ZipEntry(path));
        byte[] bytes = value.getBytes(StandardCharsets.UTF_8);
        zip.write(bytes);
        zip.closeEntry();
    }

    private static String readUtf8Limited(InputStream in, long limit) throws IOException {
        java.io.ByteArrayOutputStream out = new java.io.ByteArrayOutputStream();
        byte[] buffer = new byte[32 * 1024];
        long total = 0L;
        int read;
        while ((read = in.read(buffer)) != -1) {
            total += read;
            if (total > limit) throw new IOException("Metadata entry too large");
            out.write(buffer, 0, read);
        }
        return out.toString(StandardCharsets.UTF_8.name());
    }

    private static String readUtf8Limited(File file) throws IOException {
        if (!file.isFile() || file.length() > MAX_METADATA_BYTES) throw new IOException("Metadata file is too large or missing");
        try (InputStream in = new FileInputStream(file)) {
            byte[] bytes = new byte[(int) file.length()];
            int offset = 0;
            while (offset < bytes.length) {
                int read = in.read(bytes, offset, bytes.length - offset);
                if (read == -1) break;
                offset += read;
            }
            if (offset != bytes.length) throw new IOException("Incomplete metadata read");
            return new String(bytes, StandardCharsets.UTF_8);
        }
    }

    private static void copyLimited(InputStream in, File output, long limit) throws IOException {
        byte[] buffer = new byte[32 * 1024];
        long total = 0;
        try (FileOutputStream out = new FileOutputStream(output)) {
            int read;
            while ((read = in.read(buffer)) != -1) {
                total += read;
                if (total > limit) throw new IOException("Metadata entry too large");
                out.write(buffer, 0, read);
            }
        }
    }

    private static File fileInside(File root, String relative) throws IOException {
        File file = new File(root, relative);
        String rootPath = root.getCanonicalPath() + File.separator;
        String filePath = file.getCanonicalPath();
        if (!filePath.startsWith(rootPath)) throw new IOException("ZIP path traversal rejected");
        return file;
    }

    private static void validateArchiveEntryName(String name) throws IOException {
        if ("manifest.json".equals(name) || "checksums.json".equals(name)
                || "data/posts.json".equals(name) || "data/profile.json".equals(name)
                || "data/config.json".equals(name)) return;
        if (name != null && name.startsWith("config/") && isSafeConfigSectionName(name.substring("config/".length()))) return;
        validateMediaPath(name);
    }

    private static boolean isAllowedDirectory(String name) {
        return "data/".equals(name) || "media/".equals(name) || "config/".equals(name);
    }

    private static boolean isSafeConfigSectionName(String name) {
        return name != null
                && name.endsWith(".json")
                && name.length() > 5
                && !name.contains("/")
                && !name.contains("\\")
                && !name.contains("..")
                && name.matches("[A-Za-z0-9_.-]+\\.json");
    }

    private static void validateMediaPath(String path) throws IOException {
        if (path == null || !path.startsWith("media/")) throw new IOException("Invalid attachment path: " + path);
        String fileName = path.substring("media/".length());
        if (!AttachmentStore.isSafeFileName(fileName)) throw new IOException("Invalid attachment filename");
    }

    private static void requireMetadataFile(File file) throws IOException {
        if (!file.isFile()) throw new IOException("Missing " + file.getName());
        if (file.length() > MAX_METADATA_BYTES) throw new IOException(file.getName() + " is too large");
    }

    private static void validateProfileJson(String json) throws JSONException, IOException {
        JSONObject profile = new JSONObject(json);
        String name = profile.optString("name", "").trim();
        if (name.isEmpty() || name.length() > 200) throw new IOException("Invalid profile name");
        if (profile.has("avatar") && !profile.isNull("avatar")) {
            String avatar = profile.optString("avatar", "");
            if (!avatar.matches("(?s)^data:image/[A-Za-z0-9.+-]+;base64,[A-Za-z0-9+/=\r\n]+$")) {
                throw new IOException("Invalid profile avatar");
            }
            if (avatar.length() > MAX_METADATA_BYTES) throw new IOException("Profile avatar too large");
        }
    }

    private static String normalizeMode(String mode) {
        if ("overwrite".equals(mode)) return "replace";
        if ("add-only".equals(mode)) return "add";
        if ("replace".equals(mode) || "add".equals(mode) || "merge".equals(mode)) return mode;
        return "merge";
    }

    private static String isoNow() {
        SimpleDateFormat format = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSSXXX", Locale.US);
        return format.format(new Date());
    }

    private static String safeMessage(Throwable error) {
        String message = error.getMessage();
        return message == null || message.trim().isEmpty() ? error.getClass().getSimpleName() : message;
    }

    private static void deleteRecursively(File file) {
        if (file == null || !file.exists()) return;
        if (file.isDirectory()) {
            File[] children = file.listFiles();
            if (children != null) for (File child : children) deleteRecursively(child);
        }
        //noinspection ResultOfMethodCallIgnored
        file.delete();
    }

    private static final class ImportSession {
        final String token;
        final String mode;
        final File stageDir;
        final String postsJson;
        final String profileJson;
        final String configJson;
        final List<String> mediaPaths;
        final Map<String, String> mediaDigests;
        final Map<String, Long> mediaSizes;
        final List<File> createdFiles = new ArrayList<>();
        boolean mediaCommitted;

        ImportSession(
                String token,
                String mode,
                File stageDir,
                String postsJson,
                String profileJson,
                String configJson,
                List<String> mediaPaths,
                Map<String, String> mediaDigests,
                Map<String, Long> mediaSizes
        ) {
            this.token = token;
            this.mode = mode;
            this.stageDir = stageDir;
            this.postsJson = postsJson;
            this.profileJson = profileJson;
            this.configJson = configJson;
            this.mediaPaths = mediaPaths;
            this.mediaDigests = new HashMap<>(mediaDigests);
            this.mediaSizes = new HashMap<>(mediaSizes);
        }
    }

    /** Prevent closing ZipInputStream when DigestInputStream closes for one entry. */
    private static final class NonClosingInputStream extends InputStream {
        private final InputStream delegate;
        NonClosingInputStream(InputStream delegate) { this.delegate = delegate; }
        @Override public int read() throws IOException { return delegate.read(); }
        @Override public int read(byte[] b, int off, int len) throws IOException { return delegate.read(b, off, len); }
        @Override public void close() { /* ZipInputStream owns the stream */ }
    }
}
