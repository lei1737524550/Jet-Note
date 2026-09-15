package com.ingeniousidea.space;

import android.app.Activity;
import android.graphics.Color;
import android.graphics.SurfaceTexture;
import android.graphics.drawable.GradientDrawable;
import android.media.MediaPlayer;
import android.view.MotionEvent;
import android.view.ScaleGestureDetector;
import android.view.Surface;
import android.view.TextureView;
import android.view.View;
import android.view.ViewConfiguration;
import android.view.HapticFeedbackConstants;
import android.view.ViewGroup;
import android.webkit.WebView;
import android.widget.FrameLayout;

import org.json.JSONObject;

import java.io.File;

/**
 * Inline Android-native video renderer for Jet Note.
 *
 * The WebView owns the post card/progress UI. Android owns only the decoded
 * video surface and MediaPlayer state. The native surface is positioned over
 * the exact video-card rectangle reported by JavaScript, so playback stays
 * inline instead of opening a fullscreen overlay.
 */
final class NativeVideoPlayer implements TextureView.SurfaceTextureListener {
    private final Activity activity;
    private final FrameLayout root;
    private final WebView webView;
    private final AttachmentStore store;

    private FrameLayout stage;
    private TextureView textureView;
    private MediaPlayer player;
    private Surface surface;
    private File currentFile;
    private String mediaId;

    private int durationMs;
    private boolean prepared;
    private boolean everStarted;
    private boolean userSeeking;
    private boolean wasPlayingBeforeSeek;
    private boolean autoStartWhenPrepared;
    private double pendingSeekFraction = -1d;
    private boolean pendingSeekShouldPlay;
    private boolean overlayAllowed = true;
    private int playerGeneration = 0;

    private int videoWidth;
    private int videoHeight;
    private float zoom = 1f;

    private float downX;
    private float downY;
    private float lastRawY;
    private boolean scrollingGesture;
    private final int touchSlop;
    private ScaleGestureDetector scaleDetector;
    private boolean scaleGestureOccurred;
    private float rightEdgeGestureYieldPercent = 7f;

    // Same deliberate long-press reset contract as the proven Video Lab player.
    // The reset itself happens on ACTION_UP after the hold threshold has fired.
    private static final long LONG_PRESS_MS = 550L;
    private boolean longPressReady;
    private Runnable longPressRunnable;

    private final Runnable progressTicker = new Runnable() {
        @Override public void run() {
            if (!isOpen()) return;
            dispatchProgress();
            if (stage != null) stage.postDelayed(this, 100L);
        }
    };

    NativeVideoPlayer(Activity activity, FrameLayout root, WebView webView, AttachmentStore store) {
        this.activity = activity;
        this.root = root;
        this.webView = webView;
        this.store = store;
        this.touchSlop = ViewConfiguration.get(activity).getScaledTouchSlop();
    }


    void setRightEdgeGestureYieldPercent(double percent) {
        activity.runOnUiThread(() -> {
            float value = (float) percent;
            if (!Float.isFinite(value)) value = 7f;
            rightEdgeGestureYieldPercent = Math.max(0f, Math.min(40f, value));
        });
    }

    boolean isOpen() {
        return stage != null && stage.getParent() != null;
    }

    void setOverlayAllowed(boolean allowed) {
        activity.runOnUiThread(() -> {
            overlayAllowed = allowed;
            if (stage == null) return;
            if (!allowed) {
                try {
                    if (prepared && player != null && player.isPlaying()) player.pause();
                } catch (RuntimeException ignored) { }
                stage.setVisibility(View.INVISIBLE);
                dispatchProgress();
            } else {
                stage.setVisibility(View.VISIBLE);
                dispatchProgress();
            }
        });
    }

    void playInline(
            String archivePath,
            String requestedMediaId,
            double leftCss,
            double topCss,
            double widthCss,
            double heightCss,
            double devicePixelRatio
    ) {
        activity.runOnUiThread(() -> {
            if (!overlayAllowed) return;
            File file = store.fileForArchivePath(archivePath);
            if (file == null || !file.isFile()) return;

            if (isOpen() && requestedMediaId != null && requestedMediaId.equals(mediaId)
                    && currentFile != null && currentFile.equals(file)) {
                updateRectInternal(leftCss, topCss, widthCss, heightCss, devicePixelRatio);
                togglePlayback();
                return;
            }

            closeInternal(false);
            currentFile = file;
            mediaId = requestedMediaId == null ? "" : requestedMediaId;
            durationMs = 0;
            prepared = false;
            everStarted = false;
            userSeeking = false;
            wasPlayingBeforeSeek = false;
            autoStartWhenPrepared = true;
            pendingSeekFraction = -1d;
            pendingSeekShouldPlay = false;
            videoWidth = 0;
            videoHeight = 0;
            zoom = 1f;
            scaleGestureOccurred = false;

            createInlineStage();
            updateRectInternal(leftCss, topCss, widthCss, heightCss, devicePixelRatio);
            stage.post(progressTicker);

            if (textureView.isAvailable()) {
                onSurfaceTextureAvailable(
                        textureView.getSurfaceTexture(),
                        textureView.getWidth(),
                        textureView.getHeight());
            }
        });
    }

    void updateRect(
            String requestedMediaId,
            double leftCss,
            double topCss,
            double widthCss,
            double heightCss,
            double devicePixelRatio
    ) {
        activity.runOnUiThread(() -> {
            if (!isOpen() || requestedMediaId == null || !requestedMediaId.equals(mediaId)) return;
            updateRectInternal(leftCss, topCss, widthCss, heightCss, devicePixelRatio);
        });
    }

    void beginSeek(String requestedMediaId, double fraction) {
        activity.runOnUiThread(() -> {
            if (!matches(requestedMediaId)) return;
            userSeeking = true;
            if (!prepared || player == null || durationMs <= 0) {
                pendingSeekFraction = clamp01(fraction);
                pendingSeekShouldPlay = true;
                return;
            }
            try {
                wasPlayingBeforeSeek = player.isPlaying();
            } catch (RuntimeException ignored) {
                wasPlayingBeforeSeek = false;
            }
        });
    }

    void endSeek(String requestedMediaId, double fraction) {
        activity.runOnUiThread(() -> {
            if (!matches(requestedMediaId)) return;
            if (!prepared || player == null || durationMs <= 0) {
                pendingSeekFraction = clamp01(fraction);
                pendingSeekShouldPlay = true;
                userSeeking = false;
                return;
            }

            int target = Math.max(0, Math.min(durationMs,
                    (int) Math.round(durationMs * clamp01(fraction))));
            try {
                player.seekTo(target);
                if (wasPlayingBeforeSeek) {
                    if (!player.isPlaying()) player.start();
                } else if (player.isPlaying()) {
                    player.pause();
                }
            } catch (RuntimeException ignored) { }
            userSeeking = false;
            dispatchProgress();
        });
    }

    void synchronizeViewerPosition(String requestedMediaId, int positionMs) {
        activity.runOnUiThread(() -> {
            if (!matches(requestedMediaId) || player == null || !prepared) return;
            try {
                int safePosition = Math.max(0, durationMs > 0
                        ? Math.min(positionMs, Math.max(0, durationMs - 1))
                        : positionMs);
                player.seekTo(safePosition);
                if (player.isPlaying()) player.pause();
                everStarted = true;
                dispatchProgress();
            } catch (RuntimeException ignored) { }
        });
    }

    void stop(String requestedMediaId) {
        activity.runOnUiThread(() -> {
            if (requestedMediaId == null || requestedMediaId.isEmpty() || matches(requestedMediaId)) {
                closeInternal(true);
            }
        });
    }

    void onHostPause() {
        activity.runOnUiThread(() -> {
            if (player != null && prepared) {
                try {
                    if (player.isPlaying()) player.pause();
                } catch (RuntimeException ignored) { }
                dispatchProgress();
            }
        });
    }

    void onHostResume() {
        activity.runOnUiThread(() -> {
            if (isOpen() && stage != null) {
                stage.removeCallbacks(progressTicker);
                stage.post(progressTicker);
            }
        });
    }

    void close() {
        activity.runOnUiThread(() -> closeInternal(true));
    }

    private boolean matches(String requestedMediaId) {
        return requestedMediaId != null && requestedMediaId.equals(mediaId) && isOpen();
    }

    private void cancelLongPressTimer() {
        if (stage != null && longPressRunnable != null) stage.removeCallbacks(longPressRunnable);
        longPressRunnable = null;
    }

    private void armLongPressReset() {
        cancelLongPressTimer();
        longPressReady = false;
        if (stage == null) return;
        longPressRunnable = () -> {
            longPressRunnable = null;
            longPressReady = true;
            try { stage.performHapticFeedback(HapticFeedbackConstants.LONG_PRESS); } catch (RuntimeException ignored) { }
        };
        stage.postDelayed(longPressRunnable, LONG_PRESS_MS);
    }

    /**
     * True cold reset. Do not seek the existing decoder back to zero: retire the
     * whole MediaPlayer + Surface + TextureView pipeline so no old decoded frame
     * can survive and flash on the next play. The WebView poster underneath is
     * already Jet Note's extracted real first frame.
     */
    private void coldResetFromLongPress() {
        String resetMediaId = mediaId;
        cancelLongPressTimer();
        longPressReady = false;
        closeInternal(false);
        dispatchReset(resetMediaId);
    }

    private void createInlineStage() {
        stage = new FrameLayout(activity);
        GradientDrawable stageBackground = new GradientDrawable();
        stageBackground.setColor(Color.BLACK);
        stageBackground.setCornerRadius(dp(14));
        stage.setBackground(stageBackground);
        stage.setClipChildren(true);
        stage.setClipToOutline(true);
        stage.setAlpha(0f); // keep the real first-frame poster visible until native rendering starts
        stage.setVisibility(overlayAllowed ? View.VISIBLE : View.INVISIBLE);

        textureView = new TextureView(activity);
        textureView.setOpaque(true);
        textureView.setSurfaceTextureListener(this);
        stage.addView(textureView, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT));

        scaleDetector = new ScaleGestureDetector(activity,
                new ScaleGestureDetector.SimpleOnScaleGestureListener() {
                    @Override public boolean onScaleBegin(ScaleGestureDetector detector) {
                        scaleGestureOccurred = true;
                        updateVideoTransformPivot(detector.getFocusX(), detector.getFocusY());
                        return true;
                    }

                    @Override public boolean onScale(ScaleGestureDetector detector) {
                        // Keep the zoom anchored to the midpoint between the two fingers.
                        // The previous implementation only changed scaleX/scaleY, so Android
                        // always enlarged the TextureView around its center regardless of
                        // where the gesture actually happened.
                        updateVideoTransformPivot(detector.getFocusX(), detector.getFocusY());
                        zoom *= detector.getScaleFactor();
                        zoom = Math.max(1f, Math.min(4f, zoom));
                        if (zoom <= 1.001f) resetVideoTransformPivot();
                        applyVideoTransform();
                        return true;
                    }
                });

        stage.setOnTouchListener((view, event) -> {
            scaleDetector.onTouchEvent(event);
            switch (event.getActionMasked()) {
                case MotionEvent.ACTION_DOWN:
                    // The configured right-most slice belongs to the WebView/right-edge scrollbar.
                    // Returning false on DOWN lets Android continue hit-testing the WebView below;
                    // that target then owns the complete gesture sequence.
                    if (stage.getWidth() > 0 && event.getX() >= stage.getWidth() * (1f - rightEdgeGestureYieldPercent / 100f)) {
                        return false;
                    }
                    scaleGestureOccurred = false;
                    downX = event.getX();
                    downY = event.getY();
                    lastRawY = event.getRawY();
                    scrollingGesture = false;
                    armLongPressReset();
                    return true;

                case MotionEvent.ACTION_MOVE:
                    if (scaleDetector.isInProgress()) {
                        cancelLongPressTimer();
                        longPressReady = false;
                        return true;
                    }
                    float dx = event.getX() - downX;
                    float dy = event.getY() - downY;
                    if (Math.hypot(dx, dy) > touchSlop) {
                        cancelLongPressTimer();
                        longPressReady = false;
                    }
                    if (!scrollingGesture && Math.abs(dy) > touchSlop && Math.abs(dy) > Math.abs(dx)) {
                        scrollingGesture = true;
                    }
                    if (scrollingGesture) {
                        float rawY = event.getRawY();
                        int delta = Math.round(lastRawY - rawY);
                        lastRawY = rawY;
                        if (delta != 0) webView.scrollBy(0, delta);
                    }
                    return true;

                case MotionEvent.ACTION_UP:
                    cancelLongPressTimer();
                    if (longPressReady) {
                        // Exactly like maine: recognition can happen while held,
                        // but destructive reset waits for the finger to lift.
                        coldResetFromLongPress();
                        return true;
                    }
                    longPressReady = false;
                    if (!scrollingGesture && !scaleGestureOccurred && !scaleDetector.isInProgress()) {
                        dispatchVideoSurfaceTapped();
                    }
                    scrollingGesture = false;
                    scaleGestureOccurred = false;
                    return true;

                case MotionEvent.ACTION_CANCEL:
                    cancelLongPressTimer();
                    longPressReady = false;
                    scrollingGesture = false;
                    scaleGestureOccurred = false;
                    return true;

                default:
                    return true;
            }
        });

        root.addView(stage, new FrameLayout.LayoutParams(1, 1));
        stage.setElevation(ZAxisHeights.MEDIA);
        stage.bringToFront();
    }

    private void updateRectInternal(
            double leftCss,
            double topCss,
            double widthCss,
            double heightCss,
            double devicePixelRatio
    ) {
        if (stage == null) return;

        float scale = (float) devicePixelRatio;
        if (!Float.isFinite(scale) || scale <= 0f) {
            scale = activity.getResources().getDisplayMetrics().density;
        }

        int[] webLocation = new int[2];
        int[] rootLocation = new int[2];
        webView.getLocationOnScreen(webLocation);
        root.getLocationOnScreen(rootLocation);

        float x = webLocation[0] - rootLocation[0] + (float) leftCss * scale;
        float y = webLocation[1] - rootLocation[1] + (float) topCss * scale;
        int width = Math.max(1, Math.round((float) widthCss * scale));
        int height = Math.max(1, Math.round((float) heightCss * scale));

        FrameLayout.LayoutParams lp = (FrameLayout.LayoutParams) stage.getLayoutParams();
        if (lp == null) lp = new FrameLayout.LayoutParams(width, height);
        lp.width = width;
        lp.height = height;
        stage.setLayoutParams(lp);
        stage.setX(x);
        stage.setY(y);
        applyVideoTransform();
    }

    private void createPlayer(Surface targetSurface) {
        releasePlayerOnly();
        if (currentFile == null || targetSurface == null || !targetSurface.isValid()) return;

        final int generation = ++playerGeneration;
        final MediaPlayer candidate = new MediaPlayer();
        player = candidate;
        candidate.setSurface(targetSurface);
        candidate.setOnPreparedListener(mp -> {
            if (generation != playerGeneration || player != mp || !isOpen()) return;
            prepared = true;
            durationMs = Math.max(0, mp.getDuration());
            if (pendingSeekFraction >= 0d && durationMs > 0) {
                int target = Math.max(0, Math.min(durationMs,
                        (int) Math.round(durationMs * clamp01(pendingSeekFraction))));
                try { mp.seekTo(target); } catch (RuntimeException ignored) { }
                boolean shouldPlay = pendingSeekShouldPlay;
                pendingSeekFraction = -1d;
                pendingSeekShouldPlay = false;
                autoStartWhenPrepared = false;
                if (shouldPlay && overlayAllowed) {
                    try {
                        everStarted = true;
                        mp.start();
                    } catch (RuntimeException ignored) { }
                }
            } else if (autoStartWhenPrepared) {
                autoStartWhenPrepared = false;
                if (overlayAllowed) {
                    try {
                        everStarted = true;
                        mp.start();
                    } catch (RuntimeException ignored) { }
                }
            }
            dispatchProgress();
        });
        candidate.setOnVideoSizeChangedListener((mp, width, height) -> {
            if (generation != playerGeneration || player != mp || !isOpen()) return;
            videoWidth = Math.max(0, width);
            videoHeight = Math.max(0, height);
            applyVideoTransform();
        });
        candidate.setOnInfoListener((mp, what, extra) -> {
            if (generation != playerGeneration || player != mp || !isOpen()) return true;
            if (what == MediaPlayer.MEDIA_INFO_VIDEO_RENDERING_START && stage != null) {
                stage.animate().alpha(1f).setDuration(80L).start();
            }
            return false;
        });
        candidate.setOnCompletionListener(mp -> {
            if (generation != playerGeneration || player != mp || !isOpen()) return;
            dispatchProgress();
        });
        candidate.setOnSeekCompleteListener(mp -> {
            if (generation == playerGeneration && player == mp && isOpen()) dispatchProgress();
        });
        candidate.setOnErrorListener((mp, what, extra) -> {
            if (generation != playerGeneration || player != mp || !isOpen()) return true;
            prepared = false;
            if (stage != null) stage.setAlpha(0f); // fall back to HTML poster
            dispatchProgress();
            return true;
        });

        try {
            candidate.setDataSource(currentFile.getAbsolutePath());
            candidate.prepareAsync();
        } catch (Exception ignored) {
            prepared = false;
            if (stage != null) stage.setAlpha(0f);
            dispatchProgress();
        }
    }

    private void togglePlayback() {
        if (!prepared || player == null) return;
        try {
            if (player.isPlaying()) {
                player.pause();
            } else {
                if (durationMs > 0 && player.getCurrentPosition() >= durationMs - 100) {
                    player.seekTo(0);
                }
                everStarted = true;
                player.start();
            }
            dispatchProgress();
        } catch (RuntimeException ignored) { }
    }

    private void dispatchProgress() {
        if (!isOpen() || userSeeking || mediaId == null) return;

        int current = 0;
        boolean playing = false;
        if (prepared && player != null) {
            try {
                current = Math.max(0, player.getCurrentPosition());
                playing = player.isPlaying();
            } catch (RuntimeException ignored) { }
        }

        String script = "window.__jetNativeVideoProgress&&window.__jetNativeVideoProgress("
                + JSONObject.quote(mediaId) + ","
                + current + ","
                + Math.max(0, durationMs) + ","
                + (playing ? "true" : "false") + ","
                + (everStarted ? "true" : "false") + ");";
        webView.evaluateJavascript(script, null);
    }

    private void dispatchClosed(String closedMediaId) {
        if (closedMediaId == null || closedMediaId.isEmpty()) return;
        webView.evaluateJavascript(
                "window.__jetNativeVideoClosed&&window.__jetNativeVideoClosed("
                        + JSONObject.quote(closedMediaId) + ");",
                null);
    }

    private void dispatchReset(String resetMediaId) {
        if (resetMediaId == null || resetMediaId.isEmpty()) return;
        webView.evaluateJavascript(
                "window.__jetNativeVideoReset&&window.__jetNativeVideoReset("
                        + JSONObject.quote(resetMediaId) + ");",
                null);
    }

    /**
     * Move TextureView's transform pivot without visually jumping the already
     * zoomed frame. This lets consecutive pinch gestures start from a new
     * two-finger midpoint instead of snapping back to the view center.
     */
    private void updateVideoTransformPivot(float pivotX, float pivotY) {
        if (textureView == null) return;
        float oldPivotX = textureView.getPivotX();
        float oldPivotY = textureView.getPivotY();
        float sx = textureView.getScaleX();
        float sy = textureView.getScaleY();
        textureView.setTranslationX(textureView.getTranslationX()
                + (oldPivotX - pivotX) * (1f - sx));
        textureView.setTranslationY(textureView.getTranslationY()
                + (oldPivotY - pivotY) * (1f - sy));
        textureView.setPivotX(pivotX);
        textureView.setPivotY(pivotY);
    }

    private void resetVideoTransformPivot() {
        if (textureView == null) return;
        textureView.setPivotX(textureView.getWidth() / 2f);
        textureView.setPivotY(textureView.getHeight() / 2f);
        textureView.setTranslationX(0f);
        textureView.setTranslationY(0f);
    }

    private void dispatchVideoSurfaceTapped() {
        if (mediaId == null || mediaId.isEmpty()) return;
        int current = 0;
        if (prepared && player != null) {
            try { current = Math.max(0, player.getCurrentPosition()); }
            catch (RuntimeException ignored) { }
        }
        webView.evaluateJavascript(
                "window.__jetNativeVideoSurfaceTapped&&window.__jetNativeVideoSurfaceTapped("
                        + JSONObject.quote(mediaId) + "," + current + ");",
                null);
    }

    private void applyVideoTransform() {
        if (textureView == null) return;
        int viewWidth = textureView.getWidth();
        int viewHeight = textureView.getHeight();
        if (viewWidth <= 0 || viewHeight <= 0 || videoWidth <= 0 || videoHeight <= 0) {
            textureView.setScaleX(zoom);
            textureView.setScaleY(zoom);
            return;
        }

        float viewAspect = viewWidth / (float) viewHeight;
        float videoAspect = videoWidth / (float) videoHeight;
        float sx = 1f;
        float sy = 1f;
        if (videoAspect > viewAspect) {
            sy = viewAspect / videoAspect;
        } else if (videoAspect < viewAspect) {
            sx = videoAspect / viewAspect;
        }
        textureView.setScaleX(sx * zoom);
        textureView.setScaleY(sy * zoom);
    }

    private void closeInternal(boolean notifyFrontend) {
        String closedMediaId = mediaId;
        cancelLongPressTimer();
        longPressReady = false;
        if (stage != null) stage.removeCallbacks(progressTicker);
        releasePlayerOnly();
        if (surface != null) {
            try { surface.release(); } catch (RuntimeException ignored) { }
            surface = null;
        }
        if (stage != null && stage.getParent() instanceof ViewGroup) {
            ((ViewGroup) stage.getParent()).removeView(stage);
        }
        stage = null;
        textureView = null;
        currentFile = null;
        mediaId = null;
        durationMs = 0;
        prepared = false;
        everStarted = false;
        userSeeking = false;
        autoStartWhenPrepared = false;
        videoWidth = 0;
        videoHeight = 0;
        zoom = 1f;
        scaleGestureOccurred = false;
        if (notifyFrontend) dispatchClosed(closedMediaId);
    }

    private void releasePlayerOnly() {
        playerGeneration++;
        prepared = false;
        if (player != null) {
            try { player.reset(); } catch (RuntimeException ignored) { }
            try { player.release(); } catch (RuntimeException ignored) { }
            player = null;
        }
    }

    @Override public void onSurfaceTextureAvailable(SurfaceTexture surfaceTexture, int width, int height) {
        if (surface != null) {
            try { surface.release(); } catch (RuntimeException ignored) { }
        }
        surface = new Surface(surfaceTexture);
        createPlayer(surface);
    }

    @Override public void onSurfaceTextureSizeChanged(SurfaceTexture surfaceTexture, int width, int height) {
        applyVideoTransform();
    }

    @Override public boolean onSurfaceTextureDestroyed(SurfaceTexture surfaceTexture) {
        releasePlayerOnly();
        if (surface != null) {
            try { surface.release(); } catch (RuntimeException ignored) { }
            surface = null;
        }
        return true;
    }

    @Override public void onSurfaceTextureUpdated(SurfaceTexture surfaceTexture) { }

    private int dp(int value) {
        return Math.round(value * activity.getResources().getDisplayMetrics().density);
    }

    private static double clamp01(double value) {
        return Math.max(0d, Math.min(1d, value));
    }
}
