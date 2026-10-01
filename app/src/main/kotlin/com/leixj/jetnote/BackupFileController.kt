package com.leixj.jetnote

import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.util.Base64
import android.webkit.WebView
import org.json.JSONArray
import org.json.JSONObject
import java.io.*
import java.nio.charset.StandardCharsets
import java.security.MessageDigest
import java.text.SimpleDateFormat
import java.util.*
import java.util.concurrent.Executors
import java.util.zip.ZipEntry
import java.util.zip.ZipFile
import java.util.zip.ZipInputStream
import java.util.zip.ZipOutputStream

/** .jnote v2 transport adapted from the original Jet Note archive pipeline. */
internal class BackupFileController(
    private val activity: Activity,
    private val webView: WebView,
    private val store: AttachmentStore
) {
    companion object {
        const val SAVE = 7311
        const val OPEN = 7312
        private const val FORMAT = "jet-note"
        private const val FORMAT_VERSION = 2
        private const val MAX_ENTRIES = 10_000
        private const val MAX_METADATA = 32L * 1024L * 1024L
        private const val MAX_ARCHIVE = 128L * 1024L * 1024L
    }
    private val io = Executors.newSingleThreadExecutor()
    private var pendingExport: String? = null
    private val sessions = mutableMapOf<String, ImportSession>()
    private data class ImportSession(val token:String,val dir:File,val posts:JSONArray,val staged:MutableList<Pair<File,File>> = mutableListOf(),val installed:MutableList<File> = mutableListOf())

    fun exportArchive(payload:String) {
        val root=JSONObject(payload); if(root.optJSONArray("posts")==null) throw IllegalArgumentException("posts missing")
        pendingExport=payload
        val name="JetNote_"+SimpleDateFormat("yyyy-MM-dd_HH-mm-ss",Locale.US).format(Date())+".jnote"
        activity.startActivityForResult(Intent(Intent.ACTION_CREATE_DOCUMENT).apply { addCategory(Intent.CATEGORY_OPENABLE); type="application/vnd.jnote+zip"; putExtra(Intent.EXTRA_TITLE,name) },SAVE)
    }
    fun chooseArchive(){ activity.startActivityForResult(Intent(Intent.ACTION_OPEN_DOCUMENT).apply { addCategory(Intent.CATEGORY_OPENABLE); type="*/*"; putExtra(Intent.EXTRA_MIME_TYPES,arrayOf("application/vnd.jnote+zip","application/zip","application/octet-stream")) },OPEN) }
    fun handles(code:Int)=code==SAVE||code==OPEN
    fun onActivityResult(code:Int,result:Int,data:Intent?){
        if(result!=Activity.RESULT_OK||data?.data==null){ if(code==SAVE)pendingExport=null; return }
        val uri=data.data!!
        if(code==SAVE){ val p=pendingExport?:return; pendingExport=null; io.execute{writeArchive(uri,p)} } else io.execute{readArchive(uri)}
    }

    private fun writeArchive(uri:Uri,payload:String){
        val temp=File(activity.cacheDir,"jnote-export-${UUID.randomUUID()}.jnote")
        try{
            val root=JSONObject(payload); val posts=root.getJSONArray("posts")
            validateAttachmentMetadata(posts) { store.fileForArchivePath(it) }
            val paths=collectMediaPaths(posts)
            val mediaMeta=LinkedHashMap<String,JSONObject>()
            for(path in paths){ val f=store.fileForArchivePath(path)?:throw IOException("Invalid media path: $path"); if(!f.isFile)throw IOException("Missing media: $path"); mediaMeta[path]=store.describe(path) }
            val manifest=JSONObject().put("format",FORMAT).put("formatVersion",FORMAT_VERSION).put("app","Jet Note").put("appVersion",root.optString("appVersion","current")).put("createdAt",isoNow()).put("encoding","UTF-8").put("composerLabel",root.opt("composerLabel")).put("content",JSONObject().put("posts","data/posts.json"))
            val checksums=JSONObject()
            ZipOutputStream(BufferedOutputStream(FileOutputStream(temp))).use{zip->
                putCheckedText(zip,"manifest.json",manifest.toString(2),checksums)
                putCheckedText(zip,"data/posts.json",posts.toString(2),checksums)
                for((path,meta) in mediaMeta){
                    val f=store.fileForArchivePath(path)!!
                    val expected=meta.getString("sha256"); val actual=AttachmentStore.sha256(f); if(!expected.equals(actual,true))throw IOException("Attachment integrity mismatch: $path")
                    zip.putNextEntry(ZipEntry(path)); FileInputStream(f).use{it.copyTo(zip,128*1024)}; zip.closeEntry(); checksums.put(path,actual)
                }
                zip.putNextEntry(ZipEntry("checksums.json")); zip.write(checksums.toString(2).toByteArray(StandardCharsets.UTF_8)); zip.closeEntry()
            }
            // Phase 1: verify the exact archive bytes before they leave app-private storage.
            verifyExport(temp,paths)
            val sourceArchiveSha256=AttachmentStore.sha256(temp)

            // Phase 2: write the user-selected SAF destination. A successful write call is
            // not treated as proof that the exported file is intact.
            activity.contentResolver.openOutputStream(uri,"w")?.use{out->
                FileInputStream(temp).use{it.copyTo(out,128*1024)}
                out.flush()
            } ?: throw IOException("Cannot open export destination")

            // Phase 3: read the FINAL exported file back through ContentResolver, compare
            // the whole-file SHA-256, then run the ZIP/member/checksum verifier again.
            val written=File(activity.cacheDir,"jnote-export-verify-${UUID.randomUUID()}.jnote")
            try {
                activity.contentResolver.openInputStream(uri)?.use{input->
                    FileOutputStream(written).use{out->copyLimited(input,out,MAX_ARCHIVE)}
                } ?: throw IOException("Cannot read exported file back")
                val writtenSha256=AttachmentStore.sha256(written)
                if(!sourceArchiveSha256.equals(writtenSha256,true))
                    throw IOException("Final export file integrity mismatch")
                verifyExport(written,paths)
            } finally { written.delete() }
            callback("window.JetNoteBackupNative&&window.JetNoteBackupNative.onExportFinished(true,null)")
        }catch(e:Exception){ callback("window.JetNoteBackupNative&&window.JetNoteBackupNative.onExportFinished(false,${JSONObject.quote(e.message?:"Export failed")})") }
        finally{temp.delete()}
    }

    private fun verifyExport(file:File,media:Set<String>){
        ZipFile(file).use{zip->
            val required=listOf("manifest.json","data/posts.json","checksums.json"); required.forEach{if(zip.getEntry(it)==null)throw IOException("Export missing $it")}
            val checks=JSONObject(readLimited(zip.getInputStream(zip.getEntry("checksums.json")),MAX_METADATA).toString(StandardCharsets.UTF_8))
            val posts=JSONArray(readLimited(zip.getInputStream(zip.getEntry("data/posts.json")),MAX_METADATA).toString(StandardCharsets.UTF_8))
            for(i in 0 until posts.length()){
                val post=posts.optJSONObject(i)?:throw IOException("Invalid Post at index $i")
                if(!post.has("archived") || post.opt("archived") !is Boolean)
                    throw IOException("Post $i is missing boolean archived state")
            }
            for(key in checks.keys()){ val e=zip.getEntry(key)?:throw IOException("Export missing $key"); val actual=sha256(zip.getInputStream(e)); if(!actual.equals(checks.getString(key),true))throw IOException("Export checksum failed: $key") }
            for(path in media)if(!checks.has(path))throw IOException("Unchecked media: $path")
            val actualMedia=zip.entries().asSequence().map{it.name}.filter{it.startsWith("media/")&&!it.endsWith("/")}.toSet()
            if(actualMedia!=media)throw IOException("Export media set does not match Posts")
        }
    }

    private fun readArchive(uri:Uri){
        var stage:File?=null
        try{
            val token=UUID.randomUUID().toString(); stage=File(activity.cacheDir,"jnote-import-$token").apply{mkdirs()}
            val archive=File(stage,"source.jnote")
            activity.contentResolver.openInputStream(uri)!!.use{input->FileOutputStream(archive).use{out->copyLimited(input,out,MAX_ARCHIVE)}}
            val extracted=LinkedHashSet<String>(); var count=0
            ZipInputStream(BufferedInputStream(FileInputStream(archive))).use{zip-> while(true){ val e=zip.nextEntry?:break; if(++count>MAX_ENTRIES)throw IOException("Too many archive entries"); val name=normalizeEntry(e.name); if(e.isDirectory){zip.closeEntry();continue}; validateEntry(name); val out=safeFile(stage,name); out.parentFile?.mkdirs(); FileOutputStream(out).use{zip.copyTo(it,128*1024)}; extracted.add(name); zip.closeEntry() } }
            val manifestFile=safeFile(stage,"manifest.json"); val postsFile=safeFile(stage,"data/posts.json"); val checksFile=safeFile(stage,"checksums.json")
            if(!manifestFile.isFile||!postsFile.isFile||!checksFile.isFile)throw IOException("Backup is missing required metadata")
            val manifest=JSONObject(readUtf8(manifestFile)); if(manifest.optString("format")!=FORMAT||manifest.optInt("formatVersion",-1)!=FORMAT_VERSION)throw IOException("Unsupported Jet Note backup")
            if(manifest.optString("encoding")!="UTF-8"||manifest.optJSONObject("content")?.optString("posts")!="data/posts.json")throw IOException("Invalid content map")
            val posts=JSONArray(readUtf8(postsFile)); val checks=JSONObject(readUtf8(checksFile))
            for(key in checks.keys()){ validateEntry(key); if(key=="checksums.json")throw IOException("Invalid self checksum"); val f=safeFile(stage,key); if(!f.isFile||!AttachmentStore.sha256(f).equals(checks.getString(key),true))throw IOException("Checksum mismatch: $key") }
            for(req in listOf("manifest.json","data/posts.json"))if(!checks.has(req))throw IOException("Missing checksum: $req")
            val referenced=collectMediaPaths(posts); val actual=extracted.filter{it.startsWith("media/")}.toSet(); if(actual!=referenced)throw IOException("Media manifest does not match ZIP")
            val importRoot = requireNotNull(stage)
            validateAttachmentMetadata(posts) { safeFile(importRoot, it) }
            val session=ImportSession(token,stage,posts)
            for(path in referenced){ if(!checks.has(path))throw IOException("Unchecked media: $path"); val from=safeFile(stage,path); val target=store.fileForArchivePath(path)?:throw IOException("Invalid media destination"); if(target.exists()&&!AttachmentStore.sha256(target).equals(AttachmentStore.sha256(from),true))throw IOException("Media ID collision: $path"); session.staged.add(from to target) }
            sessions[token]=session; stage=null
            // Do not push the whole archive manifest through one evaluateJavascript call.
            // Large note sets can exceed WebView's practical script payload size and appear
            // truncated/incomplete. Stream UTF-8 JSON as small Base64 chunks instead.
            val validated = JSONObject()
                .put("token", token)
                .put("posts", posts)
                .put("hasComposerLabel", manifest.has("composerLabel"))
                .put("composerLabel", if(manifest.isNull("composerLabel")) JSONObject.NULL else manifest.opt("composerLabel"))
            callback("window.JetNoteBackupNative&&window.JetNoteBackupNative.onImportValidatedChunkStart()")
            val encoded = Base64.encodeToString(validated.toString().toByteArray(StandardCharsets.UTF_8), Base64.NO_WRAP)
            val chunkSize = 24 * 1024
            var offset = 0
            while (offset < encoded.length) {
                val end = minOf(offset + chunkSize, encoded.length)
                callback("window.JetNoteBackupNative&&window.JetNoteBackupNative.onImportValidatedChunk(${JSONObject.quote(encoded.substring(offset,end))})")
                offset = end
            }
            callback("window.JetNoteBackupNative&&window.JetNoteBackupNative.onImportValidatedChunkEnd()")
        }catch(e:Exception){stage?.deleteRecursively();callback("window.JetNoteBackupNative&&window.JetNoteBackupNative.onImportFailed(${JSONObject.quote(e.message?:"Import failed")})")}
    }

    fun commitImportMedia(token: String) {
        io.execute {
            val session = sessions[token] ?: return@execute callback(
                "window.JetNoteBackupNative&&window.JetNoteBackupNative.onImportFailed('Import session expired')"
            )
            try {
                for ((from, to) in session.staged) {
                    val expected = AttachmentStore.sha256(from)
                    if (to.exists()) {
                        if (!to.isFile || to.length() != from.length() || AttachmentStore.sha256(to) != expected)
                            throw IOException("Media ID collision: ${to.name}")
                        continue
                    }
                    to.parentFile?.mkdirs()
                    val temp = File(to.parentFile, ".import-$token-${to.name}")
                    try {
                        FileInputStream(from).use { input ->
                            FileOutputStream(temp).use { output ->
                                input.copyTo(output, 128 * 1024)
                                output.fd.sync()
                            }
                        }
                        if (temp.length() != from.length() || AttachmentStore.sha256(temp) != expected)
                            throw IOException("Committed media integrity mismatch: ${to.name}")
                        if (!temp.renameTo(to)) throw IOException("Cannot install media: ${to.name}")
                        session.installed.add(to)
                    } finally { temp.delete() }
                }
                callback("window.JetNoteBackupNative&&window.JetNoteBackupNative.onMediaCommitted(${JSONObject.quote(token)})")
            } catch (e: Exception) {
                rollbackFiles(session)
                sessions.remove(token)
                session.dir.deleteRecursively()
                callback("window.JetNoteBackupNative&&window.JetNoteBackupNative.onImportFailed(${JSONObject.quote(e.message ?: "Media import failed")})")
            }
        }
    }
    fun finalizeImport(token:String){io.execute{sessions.remove(token)?.dir?.deleteRecursively()}}
    fun rollbackImport(token:String){io.execute{sessions.remove(token)?.let{rollbackFiles(it);it.dir.deleteRecursively()}}}
    fun destroy(){io.shutdownNow();sessions.values.forEach{it.dir.deleteRecursively()};sessions.clear()}
    private fun rollbackFiles(s:ImportSession){s.installed.forEach{it.delete()}}

    private fun validateAttachmentMetadata(posts: JSONArray, resolve: (String) -> File?) {
        val ids = mutableMapOf<String, String>()
        for (i in 0 until posts.length()) {
            val attachments = posts.optJSONObject(i)?.optJSONArray("attachments") ?: continue
            for (j in 0 until attachments.length()) {
                val item = attachments.getJSONObject(j)
                val id = item.optString("id")
                val path = toMediaPath(item.optString("path"))
                    ?: toMediaPath(item.optString("url"))
                    ?: toMediaPath(item.optString("src"))
                    ?: throw IOException("Attachment has no durable path: $id")
                val file = resolve(path) ?: throw IOException("Invalid attachment path: $path")
                if (id.isBlank() || !file.isFile) throw IOException("Missing attachment: $path")
                if (ids.put(id, path)?.let { it != path } == true) throw IOException("Media ID collision: $id")
                val hash = AttachmentStore.sha256(file)
                if (item.has("size") && !item.isNull("size") && item.getLong("size") != file.length())
                    throw IOException("Attachment size mismatch: $path")
                if (item.optString("sha256").isNotEmpty() && !hash.equals(item.getString("sha256"), true))
                    throw IOException("Attachment checksum mismatch: $path")
                item.put("path", path).put("size", file.length()).put("sha256", hash)
                // Keep declared MIME (including aliases); derive only missing legacy metadata.
                if (item.optString("mimeType").isBlank())
                    item.put("mimeType", store.mimeForFileName(file.name))
            }
        }
    }

    private fun collectMediaPaths(posts:JSONArray):LinkedHashSet<String>{ val result=LinkedHashSet<String>(); fun visit(v:Any?){when(v){is JSONObject->{for(k in v.keys())visit(v.opt(k))};is JSONArray->{for(i in 0 until v.length())visit(v.opt(i))};is String->{val p=toMediaPath(v);if(p!=null)result.add(p)}}};visit(posts);return result }
    private fun toMediaPath(v:String):String?=when{Regex("^media/[A-Za-z0-9_.-]+$").matches(v)->v;Regex("^https://appassets\\.androidplatform\\.net/media/[A-Za-z0-9_.-]+$").matches(v)->v.substringAfter("https://appassets.androidplatform.net/");else->null}
    private fun putCheckedText(zip:ZipOutputStream,name:String,text:String,checks:JSONObject){val b=text.toByteArray(StandardCharsets.UTF_8);zip.putNextEntry(ZipEntry(name));zip.write(b);zip.closeEntry();checks.put(name,sha256(b))}
    private fun sha256(bytes:ByteArray)=hex(MessageDigest.getInstance("SHA-256").digest(bytes))
    private fun sha256(input:InputStream):String=input.use{val d=MessageDigest.getInstance("SHA-256");val b=ByteArray(64*1024);while(true){val n=it.read(b);if(n<0)break;d.update(b,0,n)};hex(d.digest())}
    private fun hex(b:ByteArray)=b.joinToString(""){"%02x".format(it)}
    private fun isoNow()=java.text.SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'",Locale.US).apply{timeZone=TimeZone.getTimeZone("UTC")}.format(Date())
    private fun normalizeEntry(n:String)=n.replace('\\','/')
    private fun validateEntry(n:String){if(n.isBlank()||n.startsWith('/')||n.contains("..")||(!setOf("manifest.json","checksums.json","data/posts.json").contains(n)&&!Regex("^media/[A-Za-z0-9_.-]+$").matches(n)))throw IOException("Invalid archive entry: $n")}
    private fun safeFile(root:File,name:String):File{val f=File(root,name).canonicalFile;if(!f.path.startsWith(root.canonicalPath+File.separator))throw IOException("Unsafe archive path");return f}
    private fun readUtf8(f:File)=String(readLimited(FileInputStream(f),MAX_METADATA),StandardCharsets.UTF_8)
    private fun readLimited(input:InputStream,max:Long):ByteArray=input.use{val out=ByteArrayOutputStream();val b=ByteArray(32*1024);var total=0L;while(true){val n=it.read(b);if(n<0)break;total+=n;if(total>max)throw IOException("Metadata too large");out.write(b,0,n)};out.toByteArray()}
    private fun copyLimited(input:InputStream,out:OutputStream,max:Long){val b=ByteArray(64*1024);var total=0L;while(true){val n=input.read(b);if(n<0)break;total+=n;if(total>max)throw IOException("Backup exceeds 128 MiB");out.write(b,0,n)}}
    private fun callback(script:String){activity.runOnUiThread{webView.evaluateJavascript(script,null)}}
}
