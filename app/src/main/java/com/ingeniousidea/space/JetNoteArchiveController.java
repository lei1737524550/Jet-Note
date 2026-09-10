package com.ingeniousidea.space;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
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
import java.io.OutputStream;
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

    private final Activity activity;
    private final WebView webView;
    private final AttachmentStore store;
    private final ExecutorService io = Executors.newSingleThreadExecutor();
    private final Map<String, ImportSession> sessions = new HashMap<>();

    private volatile boolean destroyed;
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
                dispatchExportFinished(false, "导出数据结构无效：" + safeMessage(e));
                return;
            }

            pendingExportPayload = payload;
            Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
            intent.addCategory(Intent.CATEGORY_OPENABLE);
            intent.setType("application/vnd.jnote+zip");
            String date = new SimpleDateFormat("yyyy-MM-dd_HH-mm-ss", Locale.US).format(new Date());
            intent.putExtra(Intent.EXTRA_TITLE, "JetNote_" + date + ".jnote");
            try {
                activity.startActivityForResult(intent, REQUEST_EXPORT);
            } catch (RuntimeException e) {
                pendingExportPayload = null;
                dispatchExportFinished(false, "没有可用的文件保存器");
            }
        });
    }

    void importFromUri(Uri source, String mode) {
        if (source == null) {
            dispatchImportError("导入文件地址无效");
            return;
        }
        io.execute(() -> stageAndValidateImport(source, normalizeMode(mode)));
    }

    void requestImport(String mode) {
        activity.runOnUiThread(() -> {
            pendingImportMode = normalizeMode(mode);
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
                dispatchImportError("没有可用的文件选择器");
            }
        });
    }

    boolean handles(int requestCode) {
        return requestCode == REQUEST_EXPORT || requestCode == REQUEST_IMPORT;
    }

    void onActivityResult(int requestCode, int resultCode, Intent data) {
        if (requestCode == REQUEST_EXPORT) {
            String payload = pendingExportPayload;
            pendingExportPayload = null;
            if (resultCode != Activity.RESULT_OK || data == null || data.getData() == null || payload == null) {
                dispatchExportFinished(false, "已取消导出");
                return;
            }
            Uri destination = data.getData();
            io.execute(() -> exportArchive(destination, payload));
            return;
        }

        if (requestCode == REQUEST_IMPORT) {
            String mode = pendingImportMode == null ? "merge" : pendingImportMode;
            pendingImportMode = null;
            if (resultCode != Activity.RESULT_OK || data == null || data.getData() == null) {
                dispatchImportError("已取消导入");
                return;
            }
            Uri source = data.getData();
            io.execute(() -> stageAndValidateImport(source, mode));
        }
    }

    void commitImportMedia(String token) {
        io.execute(() -> {
            ImportSession session = sessions.get(token);
            if (session == null) {
                dispatchImportError("导入会话已失效");
                return;
            }
            try {
                commitStagedMedia(session);
                session.mediaCommitted = true;
                dispatchMediaCommitted(token);
            } catch (Exception e) {
                rollbackFiles(session);
                dispatchImportError("媒体导入失败：" + safeMessage(e));
                cleanupSession(token);
            }
        });
    }

    void finalizeImport(String token) {
        io.execute(() -> {
            ImportSession session = sessions.remove(token);
            if (session != null) deleteRecursively(session.stageDir);
            activity.runOnUiThread(() -> Toast.makeText(activity, "Jet Note 导入成功", Toast.LENGTH_SHORT).show());
        });
    }

    void rollbackImport(String token) {
        io.execute(() -> {
            ImportSession session = sessions.remove(token);
            if (session != null) {
                rollbackFiles(session);
                deleteRecursively(session.stageDir);
            }
        });
    }

    void destroy() {
        pendingExportPayload = null;
        pendingImportMode = null;
        destroyed=true;
        // All session operations stay on the I/O executor. IDB may have committed
        // immediately before Activity destruction, so never remove published media here.
        // Unreferenced immutable files are safer than deleting committed user bytes.
        io.execute(()->{for(ImportSession session:sessions.values())deleteRecursively(session.stageDir);sessions.clear();});
        io.shutdown();
    }

    private void exportArchive(Uri destination, String payload) {
        try {
            JSONObject root = new JSONObject(payload);
            JSONArray posts = root.optJSONArray("posts");
            if (posts == null) throw new JSONException("posts missing");
            JSONObject profile = root.optJSONObject("profile");

            LinkedHashMap<String, JSONObject> attachments = collectAttachments(posts);
            JSONObject checksums = new JSONObject();

            JSONObject manifest = new JSONObject();
            manifest.put("format", "jet-note");
            manifest.put("formatVersion", FORMAT_VERSION);
            manifest.put("app", "Jet Note");
            manifest.put("appVersion", root.optString("appVersion", "2.4"));
            manifest.put("createdAt", isoNow());
            manifest.put("encoding", "UTF-8");
            JSONObject content = new JSONObject();
            content.put("posts", "data/posts.json");
            if (profile != null) content.put("profile", "data/profile.json");
            manifest.put("content", content);

            OutputStream raw = activity.getContentResolver().openOutputStream(destination, "w");
            if (raw == null) throw new IOException("无法打开导出文件");

            try (ZipOutputStream zip = new ZipOutputStream(new BufferedOutputStream(raw))) {
                putCheckedText(zip, "manifest.json", manifest.toString(2), checksums);
                putCheckedText(zip, "data/posts.json", posts.toString(2), checksums);
                if (profile != null) {
                    putCheckedText(zip, "data/profile.json", profile.toString(2), checksums);
                }

                for (Map.Entry<String, JSONObject> item : attachments.entrySet()) {
                    String path = item.getKey();
                    File file = store.fileForArchivePath(path);
                    if (file == null || !file.isFile()) throw new IOException("附件不存在：" + path);

                    MessageDigest digest = AttachmentStore.sha256Digest();
                    zip.putNextEntry(new ZipEntry(path));
                    try (DigestInputStream in = new DigestInputStream(
                            new BufferedInputStream(new FileInputStream(file)), digest)) {
                        AttachmentStore.copy(in, zip);
                    }
                    zip.closeEntry();

                    String actualSha = AttachmentStore.hex(digest.digest());
                    String expectedSha = item.getValue().optString("sha256", "");
                    if (!expectedSha.isEmpty() && !expectedSha.equalsIgnoreCase(actualSha)) {
                        throw new IOException("附件完整性异常：" + path);
                    }
                    checksums.put(path, actualSha);
                }

                putText(zip, "checksums.json", checksums.toString(2));
                zip.finish();
            }
            dispatchExportFinished(true, "导出成功");
        } catch (Exception e) {
            dispatchExportFinished(false, "导出失败：" + safeMessage(e));
        }
    }

    private void stageAndValidateImport(Uri source, String mode) {
        String token = UUID.randomUUID().toString();
        File stageDir = new File(activity.getCacheDir(), "jetnote-import-" + token);
        if (!stageDir.mkdirs()) {
            dispatchImportError("无法创建导入临时目录");
            return;
        }

        try {
            Map<String, String> mediaDigests = extractZip(source, stageDir);
            File manifestFile = new File(stageDir, "manifest.json");
            File postsFile = new File(stageDir, "data/posts.json");
            File profileFile = new File(stageDir, "data/profile.json");
            File checksumsFile = new File(stageDir, "checksums.json");
            requireMetadataFile(manifestFile);
            requireMetadataFile(postsFile);
            requireMetadataFile(checksumsFile);

            JSONObject manifest = new JSONObject(readUtf8Limited(manifestFile));
            if (!"jet-note".equals(manifest.optString("format"))) throw new IOException("不是 Jet Note 备份文件");
            if (manifest.optInt("formatVersion", -1) != FORMAT_VERSION) {
                throw new IOException("暂不支持 formatVersion=" + manifest.optInt("formatVersion", -1));
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
                if (!"posts".equals(key) && !"profile".equals(key)) {
                    throw new IOException("Invalid content map");
                }
            }
            boolean hasProfile = content.has("profile");
            if (hasProfile && !"data/profile.json".equals(content.optString("profile"))) {
                throw new IOException("Invalid profile content path");
            }
            if (hasProfile) requireMetadataFile(profileFile);

            String postsJson = readUtf8Limited(postsFile);
            String profileJson = hasProfile ? readUtf8Limited(profileFile) : null;
            if (profileJson != null) validateProfileJson(profileJson);
            JSONArray posts = new JSONArray(postsJson);
            JSONObject checksums = new JSONObject(readUtf8Limited(checksumsFile));
            if (hasProfile) {
                String expectedProfileSha = checksums.optString("data/profile.json", "");
                if (expectedProfileSha.isEmpty()
                        || !expectedProfileSha.equalsIgnoreCase(AttachmentStore.sha256(profileFile))) {
                    throw new IOException("Checksum mismatch: data/profile.json");
                }
            }
            java.util.Iterator<String> keys=checksums.keys();
            while(keys.hasNext()){
                String path=keys.next();validateArchiveEntryName(path);
                if("checksums.json".equals(path))throw new IOException("Invalid self checksum");
                File checked=fileInside(stageDir,path);
                if(!checked.isFile()||!checksums.getString(path).equalsIgnoreCase(AttachmentStore.sha256(checked)))throw new IOException("Checksum mismatch: "+path);
            }
            // A hashes JSON as well as media; legacy variants only hash media. Verify all
            // supplied hashes and require hashes for every media file in either format.
            for(String path:mediaDigests.keySet())if(!mediaDigests.get(path).equalsIgnoreCase(checksums.optString(path,"")))throw new IOException("Unchecked media: "+path);
            LinkedHashMap<String, JSONObject> attachments = collectAttachments(posts);

            List<String> referencedMedia = new ArrayList<>();
            for (Map.Entry<String, JSONObject> item : attachments.entrySet()) {
                String path = item.getKey();
                validateMediaPath(path);
                File file = fileInside(stageDir, path);
                if (!file.isFile()) throw new IOException("备份缺少附件：" + path);

                String expected = checksums.optString(path, "");
                String actual = mediaDigests.get(path);
                if (expected.isEmpty() || actual == null || !expected.equalsIgnoreCase(actual)) {
                    throw new IOException("SHA-256 校验失败：" + path);
                }
                String metadataSha = item.getValue().optString("sha256", "");
                if (!metadataSha.isEmpty() && !metadataSha.equalsIgnoreCase(actual)) {
                    throw new IOException("附件元数据校验失败：" + path);
                }
                JSONObject meta=item.getValue();
                if(meta.has("size")&&!meta.isNull("size")&&meta.getLong("size")!=file.length())throw new IOException("Attachment size mismatch");
                referencedMedia.add(path);
            }

            ImportSession session = new ImportSession(token, mode, stageDir, postsJson, profileJson, referencedMedia);
            sessions.put(token, session);
            dispatchImportValidated(session);
        } catch (Exception e) {
            deleteRecursively(stageDir);
            dispatchImportError("导入验证失败：" + safeMessage(e));
        }
    }

    private Map<String, String> extractZip(Uri source, File stageDir) throws IOException {
        Map<String, String> mediaDigests = new HashMap<>();
        File container=new File(stageDir,"source.zip");
        try(InputStream sourceStream=activity.getContentResolver().openInputStream(source);FileOutputStream out=new FileOutputStream(container)){
            if(sourceStream==null)throw new IOException("无法读取备份文件");AttachmentStore.copy(sourceStream,out);
        }
        Map<String,ZipEntry> central=new HashMap<>();
        // ZipFile requires a valid central directory; ZipInputStream additionally
        // validates local headers and CRC while expanding with fixed buffers.
        try(java.util.zip.ZipFile directory=new java.util.zip.ZipFile(container)){
            java.util.Enumeration<? extends ZipEntry> all=directory.entries();
            while(all.hasMoreElements()){
                ZipEntry e=all.nextElement();String n=e.getName();
                if(central.size()>=MAX_ZIP_ENTRIES||central.put(n,e)!=null)throw new IOException("Duplicate or excessive ZIP entries");
                if(e.isDirectory()){if(!isAllowedDirectory(n))throw new IOException("Invalid ZIP directory");}
                else validateArchiveEntryName(n);
            }
        }
        InputStream raw=new FileInputStream(container);

        int entryCount = 0;
        java.util.Set<String> names=new java.util.HashSet<>();
        try (ZipInputStream zip = new ZipInputStream(new BufferedInputStream(raw))) {
            ZipEntry entry;
            while ((entry = zip.getNextEntry()) != null) {
                if (++entryCount > MAX_ZIP_ENTRIES) throw new IOException("ZIP 条目过多");
                String name = entry.getName();
                if(!names.add(name)||!central.containsKey(name))throw new IOException("Duplicate or inconsistent ZIP entry: "+name);
                if (entry.isDirectory()) {
                    if (!isAllowedDirectory(name)) throw new IOException("非法目录：" + name);
                    zip.closeEntry();
                    continue;
                }
                validateArchiveEntryName(name);
                File output = fileInside(stageDir, name);
                File parent = output.getParentFile();
                if (parent != null && !parent.exists() && !parent.mkdirs()) throw new IOException("无法创建目录");

                if (name.startsWith("media/")) {
                    MessageDigest digest = AttachmentStore.sha256Digest();
                    try (FileOutputStream out = new FileOutputStream(output);
                         DigestInputStream in = new DigestInputStream(new NonClosingInputStream(zip), digest)) {
                        AttachmentStore.copy(in, out);
                    }
                    mediaDigests.put(name, AttachmentStore.hex(digest.digest()));
                } else {
                    copyLimited(zip, output, MAX_METADATA_BYTES);
                }
                zip.closeEntry();
                ZipEntry expected=central.get(name);
                if(expected.getSize()!=entry.getSize()||expected.getCrc()!=entry.getCrc())throw new IOException("ZIP headers disagree");
            }
        }
        if(names.size()!=central.size())throw new IOException("Truncated ZIP entries");
        container.delete();
        if(entryCount==0)throw new IOException("Empty or invalid ZIP");
        return mediaDigests;
    }

    private void commitStagedMedia(ImportSession session) throws IOException {
        for (String path : session.mediaPaths) {
            File staged = fileInside(session.stageDir, path);
            File target = store.fileForArchivePath(path);
            if (target == null) throw new IOException("非法媒体路径：" + path);

            if (target.exists()) {
                String existing = AttachmentStore.sha256(target);
                String incoming = AttachmentStore.sha256(staged);
                if (!existing.equalsIgnoreCase(incoming)) {
                    throw new IOException("附件 ID 冲突：" + path);
                }
                continue;
            }

            File temp = new File(store.mediaDirectory(), target.getName() + ".import-" + session.token);
            try {
                try (InputStream in = new BufferedInputStream(new FileInputStream(staged));
                     FileOutputStream out = new FileOutputStream(temp)) {
                    AttachmentStore.copy(in, out);
                }
                if (!temp.renameTo(target)) {
                    try (InputStream in = new BufferedInputStream(new FileInputStream(temp));
                         FileOutputStream out = new FileOutputStream(target)) {
                        AttachmentStore.copy(in, out);
                    }
                    //noinspection ResultOfMethodCallIgnored
                    temp.delete();
                }
                session.createdFiles.add(target);
            } catch (IOException error) {
                //noinspection ResultOfMethodCallIgnored
                temp.delete();
                // Target did not exist before this import, so a partial fallback copy is safe to remove.
                //noinspection ResultOfMethodCallIgnored
                target.delete();
                throw error;
            }
        }
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
                validateMediaPath(path);
                JSONObject previous = result.get(path);
                if (previous != null) {
                    String a = previous.optString("sha256", "");
                    String b = attachment.optString("sha256", "");
                    if (!a.isEmpty() && !b.isEmpty() && !a.equalsIgnoreCase(b)) {
                        throw new IOException("同一路径出现不同附件：" + path);
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
        if (posts == null) throw new IOException("缺少 posts");
        JSONObject profile = root.optJSONObject("profile");
        if (profile != null) validateProfileJson(profile.toString());
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
                        + (session.profileJson == null ? "null" : JSONObject.quote(session.profileJson)) + ");", null);
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

    private void cleanupSession(String token) {
        ImportSession session = sessions.remove(token);
        if (session != null) deleteRecursively(session.stageDir);
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

    private static String readUtf8Limited(File file) throws IOException {
        if (!file.isFile() || file.length() > MAX_METADATA_BYTES) throw new IOException("元数据文件过大或不存在");
        try (InputStream in = new FileInputStream(file)) {
            byte[] bytes = new byte[(int) file.length()];
            int offset = 0;
            while (offset < bytes.length) {
                int read = in.read(bytes, offset, bytes.length - offset);
                if (read == -1) break;
                offset += read;
            }
            if (offset != bytes.length) throw new IOException("元数据读取不完整");
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
                if (total > limit) throw new IOException("元数据条目过大");
                out.write(buffer, 0, read);
            }
        }
    }

    private static File fileInside(File root, String relative) throws IOException {
        File file = new File(root, relative);
        String rootPath = root.getCanonicalPath() + File.separator;
        String filePath = file.getCanonicalPath();
        if (!filePath.startsWith(rootPath)) throw new IOException("ZIP 路径穿越被拒绝");
        return file;
    }

    private static void validateArchiveEntryName(String name) throws IOException {
        if ("manifest.json".equals(name) || "checksums.json".equals(name)
                || "data/posts.json".equals(name) || "data/profile.json".equals(name)) return;
        validateMediaPath(name);
    }

    private static boolean isAllowedDirectory(String name) {
        return "data/".equals(name) || "media/".equals(name);
    }

    private static void validateMediaPath(String path) throws IOException {
        if (path == null || !path.startsWith("media/")) throw new IOException("非法附件路径：" + path);
        String fileName = path.substring("media/".length());
        if (!AttachmentStore.isSafeFileName(fileName)) throw new IOException("非法附件文件名");
    }

    private static void requireMetadataFile(File file) throws IOException {
        if (!file.isFile()) throw new IOException("缺少 " + file.getName());
        if (file.length() > MAX_METADATA_BYTES) throw new IOException(file.getName() + " 过大");
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
        if ("overwrite".equals(mode) || "add-only".equals(mode)) return mode;
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
        final List<String> mediaPaths;
        final List<File> createdFiles = new ArrayList<>();
        boolean mediaCommitted;

        ImportSession(
                String token,
                String mode,
                File stageDir,
                String postsJson,
                String profileJson,
                List<String> mediaPaths
        ) {
            this.token = token;
            this.mode = mode;
            this.stageDir = stageDir;
            this.postsJson = postsJson;
            this.profileJson = profileJson;
            this.mediaPaths = mediaPaths;
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
