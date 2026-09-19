package com.ingeniousidea.space;

import android.content.Context;
import android.os.Build;
import android.os.Bundle;
import android.util.AttributeSet;
import android.view.inputmethod.EditorInfo;
import android.view.inputmethod.InputConnection;
import android.view.inputmethod.InputConnectionWrapper;
import android.view.inputmethod.InputContentInfo;
import android.view.inputmethod.InputMethodManager;
import android.webkit.WebView;

/**
 * WebView input bridge for rich content committed by IMEs such as Gboard.
 *
 * Jet Note only consumes rich content while the Post Composer textarea is the
 * active paste target. Normal text input and all other WebView input paths are
 * delegated back to WebView unchanged.
 */
final class RichContentWebView extends WebView {
    interface RichContentListener {
        boolean onRichContent(InputContentInfo content, int flags, Bundle opts);
    }

    private RichContentListener richContentListener;
    private volatile boolean postComposerPasteTargetActive;

    RichContentWebView(Context context) {
        super(context);
    }

    RichContentWebView(Context context, AttributeSet attrs) {
        super(context, attrs);
    }

    void setRichContentListener(RichContentListener listener) {
        this.richContentListener = listener;
    }

    void setPostComposerPasteTargetActive(boolean active) {
        if (postComposerPasteTargetActive == active) return;
        postComposerPasteTargetActive = active;

        // EditorInfo is negotiated when the IME creates its InputConnection.
        // The JS focus notification arrives after that connection may already
        // exist, so force Gboard/other IMEs to renegotiate the supported MIME
        // types whenever the Post Composer becomes (or stops being) the target.
        post(() -> {
            InputMethodManager imm =
                    (InputMethodManager) getContext().getSystemService(Context.INPUT_METHOD_SERVICE);
            if (imm != null && hasFocus()) imm.restartInput(this);
        });
    }

    /** Restore the native WebView input/caret after a visual-only frozen transition. */
    void restoreInputAfterFrozenTransition() {
        post(() -> {
            requestFocus();
            InputMethodManager imm =
                    (InputMethodManager) getContext().getSystemService(Context.INPUT_METHOD_SERVICE);
            if (imm != null) imm.restartInput(this);
            invalidate();
        });
    }

    @Override
    public InputConnection onCreateInputConnection(EditorInfo outAttrs) {
        final InputConnection base = super.onCreateInputConnection(outAttrs);
        if (base == null || Build.VERSION.SDK_INT < Build.VERSION_CODES.N_MR1) return base;

        // Advertise image support to the IME only while the Post Composer is
        // the active target. Without this Gboard rejects the clipboard image
        // before commitContent() is ever called.
        outAttrs.contentMimeTypes = postComposerPasteTargetActive
                ? new String[] { "image/*" }
                : new String[0];

        return new InputConnectionWrapper(base, false) {
            @Override
            public boolean commitContent(InputContentInfo inputContentInfo, int flags, Bundle opts) {
                if (postComposerPasteTargetActive
                        && inputContentInfo != null
                        && inputContentInfo.getDescription() != null
                        && inputContentInfo.getDescription().hasMimeType("image/*")) {
                    RichContentListener listener = richContentListener;
                    if (listener != null && listener.onRichContent(inputContentInfo, flags, opts)) {
                        return true;
                    }
                }
                return super.commitContent(inputContentInfo, flags, opts);
            }
        };
    }
}
