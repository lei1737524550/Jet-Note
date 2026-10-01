package com.leixj.jetnote

import android.app.Activity
import android.content.ClipData
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.MediaStore
import android.webkit.WebView
import org.json.JSONArray
import org.json.JSONObject
import java.util.LinkedHashSet
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors

/** Picks media for post attachments and immediately copies it into app-owned storage. */
internal class AttachmentPickerController(
    private val activity: Activity,
    private val webView: WebView,
    private val store: AttachmentStore
) {
    companion object {
        private const val REQUEST_PICK_ATTACHMENT = 1201

        private fun normalizeType(type: String?): String {
            return when (type) {
                "image", "audio", "video", "file" -> type
                else -> "file"
            }
        }
    }

    private val io: ExecutorService = Executors.newSingleThreadExecutor()

    @Volatile
    private var destroyed = false

    private var requestId: String? = null
    private var requestedType: String? = null
    private var multiple = false

    fun choose(requestId: String, type: String?, multiple: Boolean) {
        activity.runOnUiThread {
            chooseOnUiThread(requestId, type, multiple)
        }
    }

    private fun chooseOnUiThread(
        requestId: String,
        type: String?,
        multiple: Boolean
    ) {
        if (this.requestId != null) {
            dispatchError(requestId, "picker-busy")
            return
        }

        this.requestId = requestId
        this.requestedType = normalizeType(type)
        this.multiple = multiple

        val intent: Intent

        if (this.requestedType == "image" || this.requestedType == "video") {
            // Images and videos use Android's system visual-media picker.
            // Android 13+ uses the privacy-preserving Photo Picker and filters
            // it to exactly one media kind. Older Android versions fall back
            // to the corresponding platform gallery surface.
            val mime = if (this.requestedType == "video") "video/*" else "image/*"

            intent = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                Intent(MediaStore.ACTION_PICK_IMAGES).apply {
                    setType(mime)
                    if (multiple) {
                        putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true)
                        putExtra(
                            MediaStore.EXTRA_PICK_IMAGES_MAX,
                            MediaStore.getPickImagesMaxLimit()
                        )
                    }
                }
            } else {
                val collection = if (this.requestedType == "video") {
                    MediaStore.Video.Media.EXTERNAL_CONTENT_URI
                } else {
                    MediaStore.Images.Media.EXTERNAL_CONTENT_URI
                }
                Intent(Intent.ACTION_PICK, collection).apply {
                    setType(mime)
                    putExtra(Intent.EXTRA_ALLOW_MULTIPLE, multiple)
                }
            }

            intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        } else {
            // Audio uses Android's system Storage Access Framework picker.
            // audio/* keeps the surface focused on playable audio instead of
            // exposing Jet Note's own scanner/browser UI.
            intent = Intent(Intent.ACTION_OPEN_DOCUMENT).apply {
                addCategory(Intent.CATEGORY_OPENABLE)
                addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                putExtra(Intent.EXTRA_ALLOW_MULTIPLE, multiple)

                when (this@AttachmentPickerController.requestedType) {
                    "audio" -> setType("audio/*")
                    else -> setType("*/*")
                }
            }
        }

        try {
            activity.startActivityForResult(
                intent,
                REQUEST_PICK_ATTACHMENT
            )
        } catch (error: RuntimeException) {
            val failedRequest = this.requestId
            clearPending()

            if (failedRequest != null) {
                dispatchError(failedRequest, "picker-unavailable")
            }
        }
    }

    fun handles(requestCode: Int): Boolean {
        return requestCode == REQUEST_PICK_ATTACHMENT
    }

    fun onActivityResult(
        requestCode: Int,
        resultCode: Int,
        data: Intent?
    ) {
        if (requestCode != REQUEST_PICK_ATTACHMENT || requestId == null) {
            return
        }

        val completedRequest = requestId!!
        val completedType = requestedType!!
        val allowMultiple = multiple

        clearPending()

        if (resultCode != Activity.RESULT_OK || data == null) {
            dispatchCancelled(completedRequest)
            return
        }

        val unique = LinkedHashSet<Uri>()

        val clipData: ClipData? = data.clipData
        if (clipData != null) {
            val count = if (allowMultiple) {
                clipData.itemCount
            } else {
                minOf(1, clipData.itemCount)
            }

            for (i in 0 until count) {
                val uri = clipData.getItemAt(i).uri
                if (uri != null) {
                    unique.add(uri)
                }
            }
        }

        val single = data.data
        if (single != null && (allowMultiple || unique.isEmpty())) {
            unique.add(single)
        }

        if (unique.isEmpty()) {
            dispatchCancelled(completedRequest)
            return
        }

        val uris = ArrayList(unique)

        io.execute {
            val results = JSONArray()

            try {
                for (uri in uris) {
                    val metadata: JSONObject =
                        store.importFromUri(uri, completedType)

                    results.put(metadata)
                }

                activity.runOnUiThread {
                    dispatchSuccess(completedRequest, results)
                }
            } catch (error: Exception) {
                activity.runOnUiThread {
                    dispatchError(
                        completedRequest,
                        "attachment-read-failed"
                    )
                }
            }
        }
    }

    fun destroy() {
        destroyed = true

        requestId?.let {
            dispatchCancelled(it)
        }

        clearPending()
        io.shutdownNow()
    }

    private fun dispatchSuccess(
        id: String,
        attachments: JSONArray
    ) {
        val script =
            "window.JetNoteNativeCallbacks&&window.JetNoteNativeCallbacks.onAttachmentsPicked(" +
                JSONObject.quote(id) +
                "," +
                attachments.toString() +
                ");"

        if (!destroyed) {
            webView.evaluateJavascript(script, null)
        }
    }

    private fun dispatchCancelled(id: String) {
        val script =
            "window.JetNoteNativeCallbacks&&window.JetNoteNativeCallbacks.onAttachmentPickCancelled(" +
                JSONObject.quote(id) +
                ");"

        if (!destroyed) {
            webView.evaluateJavascript(script, null)
        }
    }

    private fun dispatchError(
        id: String,
        error: String?
    ) {
        val script =
            "window.JetNoteNativeCallbacks&&window.JetNoteNativeCallbacks.onAttachmentPickError(" +
                JSONObject.quote(id) +
                "," +
                JSONObject.quote(error ?: "error") +
                ");"

        if (!destroyed) {
            webView.evaluateJavascript(script, null)
        }
    }

    private fun clearPending() {
        requestId = null
        requestedType = null
        multiple = false
    }
}