package com.leixj.jetnote

import android.content.Context
import android.os.Build
import android.os.Bundle
import android.util.AttributeSet
import android.view.inputmethod.EditorInfo
import android.view.inputmethod.InputConnection
import android.view.inputmethod.InputConnectionWrapper
import android.view.inputmethod.InputContentInfo
import android.view.inputmethod.InputMethodManager
import android.webkit.WebView

/**
 * 接收 Gboard 等输入法提交的富内容。
 *
 * 仅当帖子编辑框是当前粘贴目标时，Jet Note 才处理富内容。
 * 普通文字输入和其他输入路径保持 WebView 的原有行为。
 */
internal class RichContentWebView : WebView {

    fun interface RichContentListener {
        fun onRichContent(
            content: InputContentInfo,
            flags: Int,
            opts: Bundle?
        ): Boolean
    }

    private var richContentListener: RichContentListener? = null

    @Volatile
    private var postComposerPasteTargetActive = false

    constructor(context: Context) : super(context)

    constructor(context: Context, attrs: AttributeSet?) : super(context, attrs)

    fun setRichContentListener(listener: RichContentListener?) {
        richContentListener = listener
    }

    fun setPostComposerPasteTargetActive(active: Boolean) {
        if (postComposerPasteTargetActive == active) return
        postComposerPasteTargetActive = active

        // 输入法创建 InputConnection 时协商 EditorInfo。
        // JS 焦点通知可能晚于连接创建，因此在粘贴目标改变时，
        // 让输入法重新协商支持的 MIME 类型。
        post {
            val imm = context.getSystemService(Context.INPUT_METHOD_SERVICE)
                as? InputMethodManager
            if (imm != null && hasFocus()) {
                imm.restartInput(this)
            }
        }
    }

    override fun onCreateInputConnection(outAttrs: EditorInfo): InputConnection? {
        val base = super.onCreateInputConnection(outAttrs)
        if (base == null || Build.VERSION.SDK_INT < Build.VERSION_CODES.N_MR1) {
            return base
        }

        // 仅当帖子编辑框为当前目标时，向输入法声明支持图片。
        // 否则 Gboard 可能在调用 commitContent() 前就拒绝剪贴板图片。
        outAttrs.contentMimeTypes = if (postComposerPasteTargetActive) {
            arrayOf("image/*")
        } else {
            emptyArray<String>()
        }

        return object : InputConnectionWrapper(base, false) {
            override fun commitContent(
                inputContentInfo: InputContentInfo,
                flags: Int,
                opts: Bundle?
            ): Boolean {
                if (
                    postComposerPasteTargetActive &&
                    inputContentInfo.description.hasMimeType("image/*")
                ) {
                    val listener = richContentListener
                    if (
                        listener != null &&
                        listener.onRichContent(inputContentInfo, flags, opts)
                    ) {
                        return true
                    }
                }

                return super.commitContent(inputContentInfo, flags, opts)
            }
        }
    }
}