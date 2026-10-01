package com.leixj.jetnote

import android.content.ContentResolver
import android.content.Context
import android.graphics.BitmapFactory
import android.media.MediaMetadataRetriever
import android.net.Uri
import android.provider.OpenableColumns
import org.json.JSONException
import org.json.JSONObject
import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream
import java.io.IOException
import java.io.InputStream
import java.io.OutputStream
import java.security.DigestInputStream
import java.security.MessageDigest
import java.security.NoSuchAlgorithmException
import java.util.Locale
import java.util.UUID

/**
 * App-owned, lossless attachment repository.
 *
 * New media is copied byte-for-byte into app storage. The same physical files are
 * streamed into/out of .jnote archives, so image/audio/video bytes are never
 * decoded and re-encoded during normal import/export.
 */
internal class AttachmentStore(context: Context) {

    companion object {
        const val MEDIA_URL_PREFIX =
            "https://appassets.androidplatform.net/media/"

        @JvmStatic
        @Throws(IOException::class)
        fun copy(input: InputStream, out: FileOutputStream): Long {
            val buffer = ByteArray(64 * 1024)
            var total = 0L

            while (true) {
                val read = input.read(buffer)
                if (read == -1) break

                out.write(buffer, 0, read)
                total += read
            }

            return total
        }

        @JvmStatic
        @Throws(IOException::class)
        fun copy(input: InputStream, out: OutputStream): Long {
            val buffer = ByteArray(64 * 1024)
            var total = 0L

            while (true) {
                val read = input.read(buffer)
                if (read == -1) break

                out.write(buffer, 0, read)
                total += read
            }

            return total
        }

        @JvmStatic
        @Throws(IOException::class)
        fun sha256Digest(): MessageDigest {
            return try {
                MessageDigest.getInstance("SHA-256")
            } catch (e: NoSuchAlgorithmException) {
                throw IOException("SHA-256 unavailable", e)
            }
        }

        @JvmStatic
        @Throws(IOException::class)
        fun sha256(file: File): String {
            val digest = sha256Digest()

            DigestInputStream(
                FileInputStream(file),
                digest
            ).use { input ->
                val buffer = ByteArray(64 * 1024)

                while (input.read(buffer) != -1) {
                    // stream
                }
            }

            return hex(digest.digest())
        }

        private fun readDurationMs(
            file: File,
            mimeType: String?
        ): Long? {
            if (
                mimeType == null ||
                (!mimeType.startsWith("audio/") &&
                    !mimeType.startsWith("video/"))
            ) {
                return null
            }

            val retriever = MediaMetadataRetriever()

            return try {
                retriever.setDataSource(file.absolutePath)

                val raw = retriever.extractMetadata(
                    MediaMetadataRetriever.METADATA_KEY_DURATION
                )

                raw?.toLong()
            } catch (_: RuntimeException) {
                null
            } catch (_: NumberFormatException) {
                null
            } finally {
                try {
                    retriever.release()
                } catch (_: IOException) {
                } catch (_: RuntimeException) {
                }
            }
        }

        private fun readDimensions(
            file: File,
            mimeType: String?
        ): IntArray {
            val result = intArrayOf(0, 0)

            if (mimeType != null && mimeType.startsWith("image/")) {
                val options = BitmapFactory.Options().apply {
                    inJustDecodeBounds = true
                }

                BitmapFactory.decodeFile(
                    file.absolutePath,
                    options
                )

                result[0] = options.outWidth
                result[1] = options.outHeight

                return result
            }

            if (mimeType != null && mimeType.startsWith("video/")) {
                val retriever = MediaMetadataRetriever()

                try {
                    retriever.setDataSource(file.absolutePath)

                    result[0] = parseInt(
                        retriever.extractMetadata(
                            MediaMetadataRetriever.METADATA_KEY_VIDEO_WIDTH
                        )
                    )

                    result[1] = parseInt(
                        retriever.extractMetadata(
                            MediaMetadataRetriever.METADATA_KEY_VIDEO_HEIGHT
                        )
                    )
                } catch (_: RuntimeException) {
                    // Metadata is optional.
                } finally {
                    try {
                        retriever.release()
                    } catch (_: IOException) {
                    } catch (_: RuntimeException) {
                    }
                }
            }

            return result
        }

        private fun parseInt(value: String?): Int {
            return try {
                value?.toInt() ?: 0
            } catch (_: NumberFormatException) {
                0
            }
        }

        private fun queryDisplayName(
            resolver: ContentResolver,
            uri: Uri
        ): String? {
            return try {
                resolver.query(
                    uri,
                    arrayOf(OpenableColumns.DISPLAY_NAME),
                    null,
                    null,
                    null
                )?.use { cursor ->

                    if (cursor.moveToFirst()) {
                        val index = cursor.getColumnIndex(
                            OpenableColumns.DISPLAY_NAME
                        )

                        if (index >= 0) {
                            cursor.getString(index)
                        } else {
                            null
                        }
                    } else {
                        null
                    }
                }
            } catch (_: RuntimeException) {
                null
            }
        }

        private fun normalizeType(
            requested: String?,
            mime: String?
        ): String {
            if (
                requested == "image" ||
                requested == "audio" ||
                requested == "video" ||
                requested == "file"
            ) {
                return requested
            }

            if (mime != null) {
                if (mime.startsWith("image/")) return "image"
                if (mime.startsWith("audio/")) return "audio"
                if (mime.startsWith("video/")) return "video"
            }

            return "file"
        }

        private fun safeExtension(
            name: String?,
            mime: String?
        ): String {
            // MIME comes from ContentResolver and is more reliable for playback
            // than arbitrary display-name suffixes such as .tmp or .bin.
            // Canonicalizing known media extensions also lets the HTTP response
            // expose the right MIME.

            when (mime) {
                "image/jpeg" -> return ".jpg"
                "image/png" -> return ".png"
                "image/webp" -> return ".webp"
                "image/gif" -> return ".gif"
                "image/svg+xml" -> return ".svg"

                "audio/mpeg" -> return ".mp3"
                "audio/ogg" -> return ".ogg"
                "audio/wav",
                "audio/x-wav" -> return ".wav"

                "audio/mp4" -> return ".m4a"
                "audio/aac" -> return ".aac"
                "audio/flac" -> return ".flac"

                "video/mp4" -> return ".mp4"
                "video/webm" -> return ".webm"
                "video/quicktime" -> return ".mov"
                "video/x-matroska" -> return ".mkv"
                "video/3gpp" -> return ".3gp"
            }

            val dot = name?.lastIndexOf('.') ?: -1

            if (
                name != null &&
                dot >= 0 &&
                dot < name.length - 1
            ) {
                val ext = name
                    .substring(dot)
                    .lowercase(Locale.US)

                if (ext.matches(Regex("\\.[a-z0-9]{1,10}"))) {
                    return ext
                }
            }

            return ".bin"
        }

        private fun guessMimeFromName(name: String?): String {
            val lower = name
                ?.lowercase(Locale.US)
                ?: ""

            return when {
                lower.endsWith(".jpg") ||
                    lower.endsWith(".jpeg") -> "image/jpeg"

                lower.endsWith(".png") -> "image/png"
                lower.endsWith(".webp") -> "image/webp"
                lower.endsWith(".gif") -> "image/gif"
                lower.endsWith(".svg") -> "image/svg+xml"

                lower.endsWith(".mp3") -> "audio/mpeg"
                lower.endsWith(".wav") -> "audio/wav"

                lower.endsWith(".ogg") ||
                    lower.endsWith(".oga") -> "audio/ogg"

                lower.endsWith(".m4a") -> "audio/mp4"
                lower.endsWith(".aac") -> "audio/aac"
                lower.endsWith(".flac") -> "audio/flac"

                lower.endsWith(".mp4") -> "video/mp4"
                lower.endsWith(".webm") -> "video/webm"
                lower.endsWith(".mov") -> "video/quicktime"
                lower.endsWith(".mkv") -> "video/x-matroska"

                lower.endsWith(".3gp") ||
                    lower.endsWith(".3gpp") -> "video/3gpp"

                else -> "application/octet-stream"
            }
        }

        @JvmStatic
        fun isSafeFileName(name: String?): Boolean {
            return name != null &&
                name.matches(Regex("[A-Za-z0-9_.-]{1,200}")) &&
                !name.contains("..") &&
                !name.contains("/") &&
                !name.contains("\\") &&
                name != "." &&
                name != ".." &&
                !name.contains("\u0000")
        }

        @JvmStatic
        fun hex(bytes: ByteArray): String {
            val result = StringBuilder(bytes.size * 2)

            for (b in bytes) {
                result.append(
                    String.format(
                        Locale.US,
                        "%02x",
                        b.toInt() and 0xff
                    )
                )
            }

            return result.toString()
        }
    }

    private val context: Context = context.applicationContext

    private val mediaDir: File =
        File(this.context.filesDir, "jetnote-media")

    init {
        if (!mediaDir.exists() && !mediaDir.mkdirs()) {
            throw IllegalStateException(
                "Unable to create attachment directory"
            )
        }
    }

    @Throws(IOException::class, JSONException::class)
    fun importFromUri(
        uri: Uri,
        requestedType: String?
    ): JSONObject {
        val resolver = context.contentResolver

        var mimeType = resolver.getType(uri)

        var originalName = queryDisplayName(
            resolver,
            uri
        )

        if (originalName.isNullOrBlank()) {
            originalName = "attachment"
        }

        if (
            mimeType.isNullOrBlank() ||
            mimeType == "application/octet-stream"
        ) {
            mimeType = guessMimeFromName(originalName)
        }

        val lowerName = originalName.lowercase(Locale.US)

        if (lowerName.endsWith(".mp3")) {
            mimeType = "audio/mpeg"
        }

        if (lowerName.endsWith(".svg")) {
            mimeType = "image/svg+xml"
        }

        if (
            (requestedType == "audio" &&
                !mimeType.startsWith("audio/")) ||
            (requestedType == "image" &&
                !mimeType.startsWith("image/")) ||
            (requestedType == "video" &&
                !mimeType.startsWith("video/"))
        ) {
            throw IOException(
                "Selected file has an unsupported media type"
            )
        }

        val type = normalizeType(
            requestedType,
            mimeType
        )

        val extension = safeExtension(
            originalName,
            mimeType
        )

        val id = UUID.randomUUID().toString()
        val fileName = id + extension

        val destination = File(
            mediaDir,
            fileName
        )

        val digest = sha256Digest()

        val size: Long

        try {
            val raw = resolver.openInputStream(uri)
                ?: throw IOException(
                    "Unable to open selected attachment"
                )

            raw.use {
                DigestInputStream(it, digest).use { input ->
                    FileOutputStream(destination).use { out ->
                        size = copy(input, out)
                    }
                }
            }
        } catch (error: IOException) {
            destination.delete()
            throw error
        }

        return buildMetadata(
            id,
            type,
            mimeType,
            originalName,
            fileName,
            size,
            hex(digest.digest()),
            destination
        )
    }

    @Throws(IOException::class, JSONException::class)
    fun importFromStream(
        raw: InputStream?,
        mimeType: String?,
        originalName: String?,
        requestedType: String?,
        maxBytes: Long
    ): JSONObject {
        if (raw == null) {
            throw IOException(
                "Unable to open attachment stream"
            )
        }

        val resolvedName =
            if (originalName.isNullOrBlank()) {
                "attachment"
            } else {
                originalName.trim()
            }

        var resolvedMime =
            if (mimeType.isNullOrBlank()) {
                guessMimeFromName(resolvedName)
            } else {
                mimeType.trim()
            }

        val lowerName =
            resolvedName.lowercase(Locale.US)

        if (lowerName.endsWith(".mp3")) {
            resolvedMime = "audio/mpeg"
        }

        if (lowerName.endsWith(".svg")) {
            resolvedMime = "image/svg+xml"
        }

        if (
            (requestedType == "audio" &&
                !resolvedMime.startsWith("audio/")) ||
            (requestedType == "image" &&
                !resolvedMime.startsWith("image/")) ||
            (requestedType == "video" &&
                !resolvedMime.startsWith("video/"))
        ) {
            throw IOException(
                "Attachment has an unsupported media type"
            )
        }

        val type = normalizeType(
            requestedType,
            resolvedMime
        )

        val extension = safeExtension(
            resolvedName,
            resolvedMime
        )

        val id = UUID.randomUUID().toString()
        val fileName = id + extension

        val destination = File(
            mediaDir,
            fileName
        )

        val digest = sha256Digest()
        var size = 0L

        try {
            DigestInputStream(
                raw,
                digest
            ).use { input ->

                FileOutputStream(
                    destination
                ).use { out ->

                    val buffer =
                        ByteArray(64 * 1024)

                    while (true) {
                        val read =
                            input.read(buffer)

                        if (read == -1) break

                        size += read

                        if (
                            maxBytes > 0 &&
                            size > maxBytes
                        ) {
                            throw IOException(
                                "Attachment exceeds the size limit"
                            )
                        }

                        out.write(
                            buffer,
                            0,
                            read
                        )
                    }
                }
            }
        } catch (error: IOException) {
            destination.delete()
            throw error
        }

        return buildMetadata(
            id,
            type,
            resolvedMime,
            resolvedName,
            fileName,
            size,
            hex(digest.digest()),
            destination
        )
    }

    fun deleteArchivePath(archivePath: String?) {
        val file = fileForArchivePath(archivePath)

        if (file != null && file.isFile) {
            file.delete()
        }
    }

    fun fileForArchivePath(
        archivePath: String?
    ): File? {
        if (
            archivePath == null ||
            !archivePath.startsWith("media/")
        ) {
            return null
        }

        val name =
            archivePath.substring(
                "media/".length
            )

        if (!isSafeFileName(name)) {
            return null
        }

        return File(
            mediaDir,
            name
        )
    }

    @Throws(IOException::class, JSONException::class)
    fun describe(path: String?): JSONObject {
        val file =
            fileForArchivePath(path)

        if (
            file == null ||
            !file.isFile
        ) {
            throw IOException(
                "Missing media"
            )
        }

        val name = file.name
        val dot = name.lastIndexOf('.')
        val mime = guessMimeFromName(name)

        return buildMetadata(
            if (dot > 0) {
                name.substring(0, dot)
            } else {
                name
            },
            normalizeType(null, mime),
            mime,
            null,
            name,
            file.length(),
            sha256(file),
            file
        )
    }

    fun mediaDirectory(): File {
        return mediaDir
    }

    @Throws(IOException::class)
    fun fileForWeb(fileName: String): File {
        if (!isSafeFileName(fileName)) {
            throw IOException(
                "Invalid media name"
            )
        }

        val file =
            File(mediaDir, fileName)

        if (!file.isFile) {
            throw IOException(
                "Attachment not found"
            )
        }

        return file
    }

    @Throws(IOException::class)
    fun openForWeb(
        fileName: String
    ): InputStream {
        return FileInputStream(
            fileForWeb(fileName)
        )
    }

    fun mimeForFileName(
        fileName: String
    ): String {
        return guessMimeFromName(fileName)
    }

    @Throws(JSONException::class)
    private fun buildMetadata(
        id: String,
        type: String,
        mimeType: String?,
        originalName: String?,
        fileName: String,
        size: Long,
        sha256: String,
        file: File
    ): JSONObject {
        val result = JSONObject()

        result.put("id", id)
        result.put("type", type)

        result.put(
            "mimeType",
            mimeType ?: "application/octet-stream"
        )

        result.put(
            "originalName",
            originalName
        )

        result.put(
            "path",
            "media/$fileName"
        )

        result.put("size", size)
        result.put("sha256", sha256)

        val duration =
            readDurationMs(
                file,
                mimeType
            )

        val dimensions =
            readDimensions(
                file,
                mimeType
            )

        result.put(
            "duration",
            if (duration == null) {
                JSONObject.NULL
            } else {
                duration / 1000.0
            }
        )

        result.put(
            "width",
            if (dimensions[0] > 0) {
                dimensions[0]
            } else {
                JSONObject.NULL
            }
        )

        result.put(
            "height",
            if (dimensions[1] > 0) {
                dimensions[1]
            } else {
                JSONObject.NULL
            }
        )

        result.put(
            "extra",
            JSONObject()
        )

        return result
    }
}