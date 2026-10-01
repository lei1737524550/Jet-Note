package com.leixj.jetnote

import android.content.Context
import android.graphics.Bitmap
import android.media.MediaMetadataRetriever
import android.net.Uri
import android.webkit.WebResourceResponse
import java.io.ByteArrayInputStream
import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream
import java.io.IOException
import java.io.InputStream
import java.net.URLConnection
import java.nio.charset.StandardCharsets
import kotlin.math.min

/** Local HTTP boundary; no Activity, UI state or lifecycle ownership. */
internal class LocalResourceRouter(
    private val context: Context,
    private val attachmentStore: AttachmentStore
) {
    companion object {
        private const val APP_HOST = "appassets.androidplatform.net"
        private const val VIDEO_THUMB_CACHE_DIR = "jetnote-video-thumbs"
        private const val VIDEO_THUMB_PREFIX = "user-"
        private const val VIDEO_THUMB_QUALITY = 82
    }

    fun intercept(uri: Uri, range: String?, method: String): WebResourceResponse? =
        videoThumbnailResponse(uri) ?: mediaResponse(uri, range, method) ?: assetResponse(uri)

    private fun assetResponse(uri: Uri?): WebResourceResponse? {
        if (uri == null || !uri.scheme.equals("https", true) || !uri.host.equals(APP_HOST, true)) return null
        val path = uri.path ?: return null
        if (!path.startsWith("/assets/")) return null

        var assetPath = path.removePrefix("/assets/")
        if (assetPath.isEmpty()) assetPath = "index.html"
        if (assetPath.startsWith("/") || "../" in assetPath || '\\' in assetPath) return missingMedia()

        return try {
            val input: InputStream = when {
                assetPath == "config.json" -> ByteArrayInputStream(
                    RuntimeConfigStore.readEffective(context).toByteArray(StandardCharsets.UTF_8)
                )
                assetPath.startsWith("config/") && assetPath.endsWith(".json") -> {
                    val sectionName = assetPath.removePrefix("config/")
                    ByteArrayInputStream(
                        RuntimeConfigStore.readEffectiveSection(context, sectionName)
                            .toByteArray(StandardCharsets.UTF_8)
                    )
                }
                else -> context.assets.open(assetPath)
            }
            val mime = mimeTypeForAsset(assetPath)
            val encoding = if (
                mime.startsWith("text/") || mime.contains("javascript") ||
                mime.contains("json") || mime.contains("svg")
            ) "UTF-8" else null
            WebResourceResponse(mime, encoding, 200, "OK", mutableMapOf(
                "Cache-Control" to "no-cache",
                "X-Content-Type-Options" to "nosniff"
            ), input)
        } catch (_: IOException) {
            missingMedia()
        }
    }

    private fun mimeTypeForAsset(path: String): String =
        URLConnection.guessContentTypeFromName(path) ?: when {
            path.endsWith(".js", true) -> "application/javascript"
            path.endsWith(".css", true) -> "text/css"
            path.endsWith(".json", true) -> "application/json"
            path.endsWith(".svg", true) -> "image/svg+xml"
            else -> "application/octet-stream"
        }

    private fun videoThumbnailResponse(uri: Uri?): WebResourceResponse? {
        if (uri == null || !uri.scheme.equals("https", true) || !uri.host.equals(APP_HOST, true)) return null
        val path = uri.path ?: return null
        if (!path.matches(Regex("/video-thumb/[A-Za-z0-9_.-]+\\.jpg"))) return null
        val requested = uri.lastPathSegment?.takeIf { it.endsWith(".jpg") } ?: return null
        val fileName = requested.dropLast(4)
        if (!AttachmentStore.isSafeFileName(fileName)) return missingMedia()

        val store = attachmentStore
        val source = try { store.fileForWeb(fileName) } catch (_: IOException) { return missingMedia() }
        val cacheDir = File(context.cacheDir, VIDEO_THUMB_CACHE_DIR).apply { if (!exists()) mkdirs() }
        val cached = File(cacheDir, "$VIDEO_THUMB_PREFIX$fileName.jpg")

        return try {
            if (!cached.isFile || cached.lastModified() < source.lastModified()) {
                createVideoThumbnail(source, cached) ?: return missingMedia()
            }
            WebResourceResponse(
                "image/jpeg", null, 200, "OK",
                mutableMapOf("Cache-Control" to "private, max-age=86400"),
                FileInputStream(cached)
            )
        } catch (_: Exception) {
            missingMedia()
        }
    }

    private fun createVideoThumbnail(source: File, target: File): File? {
        val retriever = MediaMetadataRetriever()
        var frame: Bitmap? = null
        return try {
            retriever.setDataSource(source.absolutePath)
            frame = retriever.getFrameAtTime(0, MediaMetadataRetriever.OPTION_CLOSEST_SYNC)
                ?: retriever.getFrameAtTime(-1)
                ?: return null
            FileOutputStream(target).use { out ->
                if (!frame.compress(Bitmap.CompressFormat.JPEG, VIDEO_THUMB_QUALITY, out)) return null
            }
            target
        } finally {
            frame?.recycle()
            try { retriever.release() } catch (_: Exception) { }
        }
    }

    private fun mediaResponse(uri: Uri?, rangeHeader: String?, method: String): WebResourceResponse? {
        if (!isJetNoteLocalUrl(uri)) return null
        val path = uri?.path ?: return null
        if (!path.matches(Regex("/media/[A-Za-z0-9_.-]+"))) return null
        val fileName = uri.lastPathSegment ?: return missingMedia()
        if (!AttachmentStore.isSafeFileName(fileName)) return missingMedia()
        val store = attachmentStore

        return try {
            val file = store.fileForWeb(fileName)
            val mime = store.mimeForFileName(fileName)
            val size = file.length()
            val baseHeaders = mediaHeaders(mime).apply { put("Accept-Ranges", "bytes") }

            if (method.equals("OPTIONS", true)) {
                return emptyResponse(mime, 204, "No Content", baseHeaders)
            }

            val parsedRange = parseRange(rangeHeader, size)
            if (parsedRange.requested && !parsedRange.valid) {
                baseHeaders["Content-Range"] = "bytes */$size"
                baseHeaders["Content-Length"] = "0"
                return emptyResponse(mime, 416, "Range Not Satisfiable", baseHeaders)
            }

            if (parsedRange.valid) {
                val length = parsedRange.end - parsedRange.start + 1
                val headers = baseHeaders.toMutableMap().apply {
                    put("Content-Range", "bytes ${parsedRange.start}-${parsedRange.end}/$size")
                    put("Content-Length", length.toString())
                }
                if (method.equals("HEAD", true)) {
                    return emptyResponse(mime, 206, "Partial Content", headers)
                }

                val input = FileInputStream(file)
                if (!skipExactly(input, parsedRange.start)) {
                    input.close()
                    return missingMedia()
                }
                return WebResourceResponse(
                    mime, null, 206, "Partial Content", headers,
                    LimitedInputStream(input, length)
                )
            }

            baseHeaders["Content-Length"] = size.toString()
            if (method.equals("HEAD", true)) {
                emptyResponse(mime, 200, "OK", baseHeaders)
            } else {
                WebResourceResponse(mime, null, 200, "OK", baseHeaders, FileInputStream(file))
            }
        } catch (_: IOException) {
            missingMedia()
        }
    }

    private fun skipExactly(input: InputStream, target: Long): Boolean {
        var skipped = 0L
        while (skipped < target) {
            var step = input.skip(target - skipped)
            if (step <= 0) {
                if (input.read() == -1) return false
                step = 1
            }
            skipped += step
        }
        return skipped == target
    }

    private fun emptyResponse(
        mime: String,
        status: Int,
        reason: String,
        headers: MutableMap<String, String>
    ) = WebResourceResponse(mime, null, status, reason, headers, ByteArrayInputStream(ByteArray(0)))

    private fun missingMedia() = WebResourceResponse(
        "text/plain", "UTF-8", 404, "Not Found", mutableMapOf(),
        ByteArrayInputStream(ByteArray(0))
    )

    private data class RangeResult(
        val requested: Boolean,
        val valid: Boolean,
        val start: Long = 0,
        val end: Long = 0
    )

    private fun parseRange(header: String?, size: Long): RangeResult {
        if (header.isNullOrBlank()) return RangeResult(requested = false, valid = false)
        if (size <= 0 || !header.regionMatches(0, "bytes=", 0, 6, ignoreCase = true)) {
            return RangeResult(requested = true, valid = false)
        }
        return try {
            val raw = header.substring(6).trim()
            if (raw.isEmpty() || ',' in raw) return RangeResult(true, false)
            val dash = raw.indexOf('-')
            if (dash < 0) return RangeResult(true, false)

            val startRaw = raw.substring(0, dash).trim()
            val endRaw = raw.substring(dash + 1).trim()
            val start: Long
            var end: Long
            if (startRaw.isEmpty()) {
                if (endRaw.isEmpty()) return RangeResult(true, false)
                val suffix = endRaw.toLong()
                if (suffix <= 0) return RangeResult(true, false)
                start = maxOf(0, size - suffix)
                end = size - 1
            } else {
                start = startRaw.toLong()
                end = if (endRaw.isEmpty()) size - 1 else endRaw.toLong()
            }
            if (start < 0 || start >= size || end < start) return RangeResult(true, false)
            end = min(end, size - 1)
            RangeResult(true, true, start, end)
        } catch (_: RuntimeException) {
            RangeResult(true, false)
        }
    }

    private fun mediaHeaders(mime: String?) = mutableMapOf(
        "Access-Control-Allow-Origin" to "*",
        "Access-Control-Allow-Headers" to "Range, Content-Type",
        "Access-Control-Allow-Methods" to "GET, HEAD, OPTIONS",
        "Cache-Control" to "no-store",
        "Content-Type" to (mime ?: "application/octet-stream"),
        "X-Content-Type-Options" to "nosniff"
    )

    private fun isJetNoteLocalUrl(uri: Uri?): Boolean {
        if (uri == null || !uri.scheme.equals("https", true)) return false
        return uri.host.equals(APP_HOST, true)
    }

    fun isAppAssetUrl(uri: Uri?): Boolean =
        uri != null && uri.scheme.equals("https", true) && uri.host.equals(APP_HOST, true)


    private class LimitedInputStream(
        private val delegate: InputStream,
        remaining: Long
    ) : InputStream() {
        private var remaining = remaining

        override fun read(): Int {
            if (remaining <= 0) return -1
            return delegate.read().also { if (it != -1) remaining-- }
        }

        override fun read(buffer: ByteArray, offset: Int, length: Int): Int {
            if (offset < 0 || length < 0 || offset > buffer.size - length) throw IndexOutOfBoundsException()
            if (length == 0) return 0
            if (remaining <= 0) return -1
            val read = delegate.read(buffer, offset, min(length.toLong(), remaining).toInt())
            if (read > 0) remaining -= read
            return read
        }

        override fun available(): Int =
            min(delegate.available().toLong(), min(remaining, Int.MAX_VALUE.toLong())).toInt()

        override fun skip(byteCount: Long): Long {
            if (remaining <= 0 || byteCount <= 0) return 0
            return delegate.skip(min(byteCount, remaining)).also {
                if (it > 0) remaining -= it
            }
        }

        override fun close() = delegate.close()
    }

}
