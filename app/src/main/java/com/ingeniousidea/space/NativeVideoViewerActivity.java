package com.ingeniousidea.space;

import android.app.Activity;
import android.content.Intent;
import android.graphics.Color;
import android.graphics.Matrix;
import android.graphics.SurfaceTexture;
import android.media.AudioAttributes;
import android.media.MediaPlayer;
import android.os.Bundle;
import android.view.Gravity;
import android.view.MotionEvent;
import android.view.Surface;
import android.view.TextureView;
import android.view.View;
import android.view.ViewGroup;
import android.widget.FrameLayout;
import android.widget.ImageButton;
import android.widget.MediaController;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.InputStream;

/** Full-screen Android-native viewer for a Jet Note video attachment. */
public final class NativeVideoViewerActivity extends Activity
        implements TextureView.SurfaceTextureListener, MediaController.MediaPlayerControl {
    static final int REQUEST_CODE = 64107;
    static final String EXTRA_FILE_PATH = "jetnote.video.file";
    static final String EXTRA_MEDIA_ID = "jetnote.video.media_id";
    static final String EXTRA_START_MS = "jetnote.video.start_ms";
    static final String RESULT_MEDIA_ID = "jetnote.video.result.media_id";
    static final String RESULT_POSITION_MS = "jetnote.video.result.position_ms";
    static final String RESULT_DURATION_MS = "jetnote.video.result.duration_ms";

    private static final String DEBUG_PREFS = "jet_note_debug_config";
    private static final String DEBUG_CURRENT = "current";
    private static final float TOUCH_SLOP_PX = 12f;

    private FrameLayout root;
    private TextureView textureView;
    private MediaPlayer mediaPlayer;
    private MediaController mediaController;
    private String mediaId = "";
    private String filePath = "";
    private int requestedStartMs = 0;
    private int knownDurationMs = 0;
    private boolean prepared = false;
    private boolean resultSent = false;
    private boolean resumeAfterLifecyclePause = false;

    // Config semantics:
    //   0  => viewer zoom disabled
    //  -1  => no user-visible maximum scale
    //  >0  => maximum allowed scale
    private float configuredMaximumScale = -1f;
    private float currentScale = 1f;
    // Translation is expressed in the TextureView's stable, untransformed local coordinate system.
    // The view itself is never scaled/transformed; only its SurfaceTexture content matrix is.
    private float currentTranslationX = 0f;
    private float currentTranslationY = 0f;
    private final Matrix videoContentMatrix = new Matrix();
    private boolean pinchOccurred = false;
    private boolean panOccurred = false;
    private float lastTouchX = 0f;
    private float lastTouchY = 0f;
    private float touchDownX = 0f;
    private float touchDownY = 0f;
    private float pinchStartDistance = 0f;
    private float pinchStartScale = 1f;
    private float pinchStartFocusX = 0f;
    private float pinchStartFocusY = 0f;
    private float pinchStartTranslationX = 0f;
    private float pinchStartTranslationY = 0f;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().setStatusBarColor(Color.BLACK);
        getWindow().setNavigationBarColor(Color.BLACK);
        configuredMaximumScale = readConfiguredMaximumScale();

        Intent input = getIntent();
        mediaId = input == null ? "" : input.getStringExtra(EXTRA_MEDIA_ID);
        if (mediaId == null) mediaId = "";
        requestedStartMs = Math.max(0, input == null ? 0 : input.getIntExtra(EXTRA_START_MS, 0));
        String path = input == null ? null : input.getStringExtra(EXTRA_FILE_PATH);
        if (path == null || !new File(path).isFile()) {
            finishWithPosition();
            return;
        }
        filePath = path;

        root = new FrameLayout(this);
        root.setBackgroundColor(Color.BLACK);

        textureView = new TextureView(this);
        textureView.setOpaque(false);
        textureView.setSurfaceTextureListener(this);
        FrameLayout.LayoutParams videoParams = new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT,
                Gravity.CENTER);
        root.addView(textureView, videoParams);

        mediaController = new MediaController(this);
        mediaController.setMediaPlayer(this);
        mediaController.setAnchorView(root);

        installViewerZoomAndPan();

        ImageButton close = new ImageButton(this);
        close.setImageResource(android.R.drawable.ic_menu_close_clear_cancel);
        close.setBackgroundColor(Color.TRANSPARENT);
        close.setColorFilter(Color.WHITE);
        close.setContentDescription("Close video");
        int size = dp(56);
        FrameLayout.LayoutParams closeParams = new FrameLayout.LayoutParams(size, size, Gravity.TOP | Gravity.END);
        closeParams.topMargin = dp(18);
        closeParams.rightMargin = dp(18);
        root.addView(close, closeParams);
        close.setOnClickListener(v -> finishWithPosition());

        setContentView(root);
    }

    private void createAndPreparePlayer(SurfaceTexture surfaceTexture) {
        releasePlayer();
        try {
            MediaPlayer player = new MediaPlayer();
            mediaPlayer = player;
            player.setAudioAttributes(new AudioAttributes.Builder()
                    .setContentType(AudioAttributes.CONTENT_TYPE_MOVIE)
                    .setUsage(AudioAttributes.USAGE_MEDIA)
                    .build());
            Surface surface = new Surface(surfaceTexture);
            try {
                player.setSurface(surface);
            } finally {
                surface.release();
            }
            player.setDataSource(filePath);
            player.setOnPreparedListener(mp -> {
                if (mediaPlayer != mp) return;
                prepared = true;
                knownDurationMs = Math.max(0, mp.getDuration());
                updateVideoDisplaySize(mp.getVideoWidth(), mp.getVideoHeight());
                int target = knownDurationMs > 0
                        ? Math.min(requestedStartMs, Math.max(0, knownDurationMs - 1))
                        : requestedStartMs;
                if (target > 0) mp.seekTo(target);
                mp.start();
                if (mediaController != null) {
                    mediaController.setEnabled(true);
                    mediaController.show(3000);
                }
            });
            player.setOnVideoSizeChangedListener((mp, width, height) -> updateVideoDisplaySize(width, height));
            player.setOnCompletionListener(mp -> {
                knownDurationMs = Math.max(knownDurationMs, getDuration());
                if (mediaController != null) mediaController.show(0);
            });
            player.setOnErrorListener((mp, what, extra) -> {
                finishWithPosition();
                return true;
            });
            player.prepareAsync();
        } catch (Exception ignored) {
            finishWithPosition();
        }
    }

    /** Fit the unzoomed TextureView to the video aspect ratio before applying user zoom. */
    private void updateVideoDisplaySize(int videoWidth, int videoHeight) {
        if (root == null || textureView == null || videoWidth <= 0 || videoHeight <= 0) return;
        root.post(() -> {
            if (root == null || textureView == null) return;
            int availableWidth = root.getWidth();
            int availableHeight = root.getHeight();
            if (availableWidth <= 0 || availableHeight <= 0) return;
            float videoRatio = (float) videoWidth / (float) videoHeight;
            float screenRatio = (float) availableWidth / (float) availableHeight;
            int displayWidth;
            int displayHeight;
            if (videoRatio > screenRatio) {
                displayWidth = availableWidth;
                displayHeight = Math.max(1, Math.round(availableWidth / videoRatio));
            } else {
                displayHeight = availableHeight;
                displayWidth = Math.max(1, Math.round(availableHeight * videoRatio));
            }
            FrameLayout.LayoutParams params = (FrameLayout.LayoutParams) textureView.getLayoutParams();
            params.width = displayWidth;
            params.height = displayHeight;
            params.gravity = Gravity.CENTER;
            textureView.setLayoutParams(params);
            currentTranslationX = 0f;
            currentTranslationY = 0f;
            applyViewerTransform();
        });
    }

    private void installViewerZoomAndPan() {
        if (textureView == null) return;

        // A configured value of 0 disables viewer zoom completely. Keep a simple tap
        // listener so the native MediaController can still be shown/hidden.
        textureView.setOnTouchListener((view, event) -> {
            final int action = event.getActionMasked();

            if (configuredMaximumScale == 0f) {
                if (action == MotionEvent.ACTION_UP) toggleController();
                return true;
            }

            switch (action) {
                case MotionEvent.ACTION_DOWN:
                    touchDownX = lastTouchX = event.getX();
                    touchDownY = lastTouchY = event.getY();
                    pinchOccurred = false;
                    panOccurred = false;
                    resetPinchBaseline();
                    return true;

                case MotionEvent.ACTION_POINTER_DOWN:
                    pinchOccurred = true;
                    if (event.getPointerCount() >= 2) capturePinchBaseline(event);
                    return true;

                case MotionEvent.ACTION_MOVE:
                    if (event.getPointerCount() >= 2) {
                        pinchOccurred = true;
                        applyPinchFromBaseline(event);
                        return true;
                    }

                    if (event.getPointerCount() == 1 && currentScale > 1.001f) {
                        float x = event.getX();
                        float y = event.getY();
                        float dx = x - lastTouchX;
                        float dy = y - lastTouchY;
                        if (Math.abs(x - touchDownX) > TOUCH_SLOP_PX
                                || Math.abs(y - touchDownY) > TOUCH_SLOP_PX) {
                            panOccurred = true;
                        }
                        currentTranslationX += dx;
                        currentTranslationY += dy;
                        lastTouchX = x;
                        lastTouchY = y;
                        clampTranslations();
                        applyViewerTransform();
                    }
                    return true;

                case MotionEvent.ACTION_POINTER_UP:
                    pinchOccurred = true;
                    resetPinchBaseline();
                    // If one pointer remains after this pointer is removed, use it as the
                    // new pan origin. This avoids the large jump that made shrinking/panning
                    // feel rigid in the previous implementation.
                    if (event.getPointerCount() == 2) {
                        int lifted = event.getActionIndex();
                        int remaining = lifted == 0 ? 1 : 0;
                        lastTouchX = event.getX(remaining);
                        lastTouchY = event.getY(remaining);
                        touchDownX = lastTouchX;
                        touchDownY = lastTouchY;
                    }
                    return true;

                case MotionEvent.ACTION_UP:
                    if (!pinchOccurred && !panOccurred) toggleController();
                    resetPinchBaseline();
                    return true;

                case MotionEvent.ACTION_CANCEL:
                    resetPinchBaseline();
                    return true;

                default:
                    return true;
            }
        });
    }

    private void capturePinchBaseline(MotionEvent event) {
        if (event == null || event.getPointerCount() < 2) return;
        float dx = event.getX(1) - event.getX(0);
        float dy = event.getY(1) - event.getY(0);
        pinchStartDistance = (float) Math.hypot(dx, dy);
        if (!Float.isFinite(pinchStartDistance) || pinchStartDistance <= 0f) {
            pinchStartDistance = 0f;
            return;
        }
        pinchStartScale = currentScale;
        pinchStartFocusX = (event.getX(0) + event.getX(1)) * 0.5f;
        pinchStartFocusY = (event.getY(0) + event.getY(1)) * 0.5f;
        pinchStartTranslationX = currentTranslationX;
        pinchStartTranslationY = currentTranslationY;
    }

    private void applyPinchFromBaseline(MotionEvent event) {
        if (event == null || event.getPointerCount() < 2) return;
        if (pinchStartDistance <= 0f) {
            capturePinchBaseline(event);
            return;
        }

        float dx = event.getX(1) - event.getX(0);
        float dy = event.getY(1) - event.getY(0);
        float distance = (float) Math.hypot(dx, dy);
        if (!Float.isFinite(distance) || distance <= 0f) return;

        float focusX = (event.getX(0) + event.getX(1)) * 0.5f;
        float focusY = (event.getY(0) + event.getY(1)) * 0.5f;
        float requestedScale = pinchStartScale * (distance / pinchStartDistance);
        float nextScale = constrainScale(requestedScale);
        if (!Float.isFinite(nextScale) || nextScale <= 0f) return;

        // Keep the same video point under the moving two-finger midpoint. Computing from
        // the gesture-start snapshot rather than accumulating ScaleGestureDetector factors
        // makes zoom-in and zoom-out exactly reversible and removes the previous stiffness.
        float ratio = nextScale / pinchStartScale;
        float centerX = textureView.getWidth() * 0.5f;
        float centerY = textureView.getHeight() * 0.5f;
        currentTranslationX = focusX - centerX
                - ratio * (pinchStartFocusX - centerX - pinchStartTranslationX);
        currentTranslationY = focusY - centerY
                - ratio * (pinchStartFocusY - centerY - pinchStartTranslationY);
        currentScale = nextScale;

        if (currentScale <= 1.001f) {
            currentScale = 1f;
            currentTranslationX = 0f;
            currentTranslationY = 0f;
        } else {
            clampTranslations();
        }
        applyViewerTransform();
    }

    private void resetPinchBaseline() {
        pinchStartDistance = 0f;
        pinchStartScale = currentScale;
        pinchStartFocusX = 0f;
        pinchStartFocusY = 0f;
        pinchStartTranslationX = currentTranslationX;
        pinchStartTranslationY = currentTranslationY;
    }

    private void toggleController() {
        if (mediaController == null) return;
        if (mediaController.isShowing()) mediaController.hide();
        else mediaController.show(3000);
    }

    private float constrainScale(float candidate) {
        if (configuredMaximumScale == 0f) return 1f;
        float safeCandidate = candidate;
        if (!Float.isFinite(safeCandidate)) safeCandidate = Float.MAX_VALUE / 1024f;
        safeCandidate = Math.max(1f, safeCandidate);
        if (configuredMaximumScale < 0f) {
            // -1 means no configured user-visible maximum. The numeric ceiling only
            // prevents float overflow and is unreachable during normal interaction.
            return Math.min(Float.MAX_VALUE / 1024f, safeCandidate);
        }
        return Math.min(Math.max(1f, configuredMaximumScale), safeCandidate);
    }

    private void clampTranslations() {
        if (textureView == null || currentScale <= 1.001f) {
            currentScale = 1f;
            currentTranslationX = 0f;
            currentTranslationY = 0f;
            return;
        }

        // The unzoomed video is centered. At scale S, the extra content extends equally
        // on both sides, so legal pan distance is symmetric around zero. The previous
        // [-extra, 0] clamp biased the video toward one corner and could make zoom-out
        // appear to get stuck.
        double maxXDouble = Math.max(0d, textureView.getWidth() * ((double) currentScale - 1d) * 0.5d);
        double maxYDouble = Math.max(0d, textureView.getHeight() * ((double) currentScale - 1d) * 0.5d);
        float maxX = (float) Math.min(maxXDouble, Float.MAX_VALUE / 4096d);
        float maxY = (float) Math.min(maxYDouble, Float.MAX_VALUE / 4096d);
        currentTranslationX = Math.max(-maxX, Math.min(maxX, currentTranslationX));
        currentTranslationY = Math.max(-maxY, Math.min(maxY, currentTranslationY));
    }

    private void applyViewerTransform() {
        if (textureView == null) return;

        // Transform only the SurfaceTexture content. Keeping the TextureView itself
        // geometrically stable means MotionEvent coordinates do not change underneath
        // the gesture, which makes pinch scaling smooth and fully reversible.
        float centerX = textureView.getWidth() * 0.5f;
        float centerY = textureView.getHeight() * 0.5f;
        videoContentMatrix.reset();
        videoContentMatrix.setScale(currentScale, currentScale, centerX, centerY);
        videoContentMatrix.postTranslate(currentTranslationX, currentTranslationY);
        textureView.setTransform(videoContentMatrix);
        textureView.invalidate();
    }

    private float readConfiguredMaximumScale() {
        try {
            String source = getSharedPreferences(DEBUG_PREFS, MODE_PRIVATE).getString(DEBUG_CURRENT, null);
            if (source == null || source.trim().isEmpty()) {
                try (InputStream in = getAssets().open("config.json")) {
                    ByteArrayOutputStream out = new ByteArrayOutputStream();
                    byte[] buffer = new byte[8192];
                    int count;
                    while ((count = in.read(buffer)) != -1) out.write(buffer, 0, count);
                    source = out.toString("UTF-8");
                }
            }
            JSONObject rootJson = new JSONObject(source);
            JSONObject viewerScale = rootJson.optJSONObject("viewer_media_scale");
            if (viewerScale == null) return -1f;
            double raw = viewerScale.optDouble("video_viewer_max_scale", -1d);
            if (!Double.isFinite(raw)) return -1f;
            if (raw == 0d) return 0f;
            if (raw < 0d) return -1f;
            return (float) Math.max(1d, Math.min(raw, Float.MAX_VALUE / 1024d));
        } catch (Exception ignored) {
            return -1f;
        }
    }

    @Override
    public void onSurfaceTextureAvailable(SurfaceTexture surface, int width, int height) {
        createAndPreparePlayer(surface);
    }

    @Override
    public void onSurfaceTextureSizeChanged(SurfaceTexture surface, int width, int height) { }

    @Override
    public boolean onSurfaceTextureDestroyed(SurfaceTexture surface) {
        releasePlayer();
        return true;
    }

    @Override
    public void onSurfaceTextureUpdated(SurfaceTexture surface) { }

    // MediaController.MediaPlayerControl
    @Override public void start() { if (prepared && mediaPlayer != null) mediaPlayer.start(); }
    @Override public void pause() { if (prepared && mediaPlayer != null) mediaPlayer.pause(); }
    @Override public int getDuration() {
        if (!prepared || mediaPlayer == null) return Math.max(0, knownDurationMs);
        try { return Math.max(0, mediaPlayer.getDuration()); } catch (RuntimeException ignored) { return Math.max(0, knownDurationMs); }
    }
    @Override public int getCurrentPosition() {
        if (!prepared || mediaPlayer == null) return Math.max(0, requestedStartMs);
        try { return Math.max(0, mediaPlayer.getCurrentPosition()); } catch (RuntimeException ignored) { return Math.max(0, requestedStartMs); }
    }
    @Override public void seekTo(int pos) { if (prepared && mediaPlayer != null) mediaPlayer.seekTo(Math.max(0, pos)); }
    @Override public boolean isPlaying() {
        if (!prepared || mediaPlayer == null) return false;
        try { return mediaPlayer.isPlaying(); } catch (RuntimeException ignored) { return false; }
    }
    @Override public int getBufferPercentage() { return 100; }
    @Override public boolean canPause() { return true; }
    @Override public boolean canSeekBackward() { return true; }
    @Override public boolean canSeekForward() { return true; }
    @Override public int getAudioSessionId() {
        if (mediaPlayer == null) return 0;
        try { return mediaPlayer.getAudioSessionId(); } catch (RuntimeException ignored) { return 0; }
    }

    @Override
    public void onBackPressed() {
        finishWithPosition();
    }

    @Override
    protected void onPause() {
        super.onPause();
        resumeAfterLifecyclePause = isPlaying();
        if (resumeAfterLifecyclePause) pause();
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (resumeAfterLifecyclePause && prepared) {
            start();
            resumeAfterLifecyclePause = false;
        }
    }

    @Override
    protected void onDestroy() {
        if (!resultSent) sendResult();
        releasePlayer();
        super.onDestroy();
    }

    private void releasePlayer() {
        MediaPlayer player = mediaPlayer;
        mediaPlayer = null;
        prepared = false;
        if (player != null) {
            try {
                knownDurationMs = Math.max(knownDurationMs, player.getDuration());
                requestedStartMs = Math.max(0, player.getCurrentPosition());
            } catch (RuntimeException ignored) { }
            try { player.reset(); } catch (RuntimeException ignored) { }
            try { player.release(); } catch (RuntimeException ignored) { }
        }
    }

    private void finishWithPosition() {
        sendResult();
        finish();
    }

    private void sendResult() {
        if (resultSent) return;
        resultSent = true;
        int current = getCurrentPosition();
        int duration = Math.max(knownDurationMs, getDuration());
        Intent result = new Intent();
        result.putExtra(RESULT_MEDIA_ID, mediaId);
        result.putExtra(RESULT_POSITION_MS, current);
        result.putExtra(RESULT_DURATION_MS, Math.max(0, duration));
        setResult(RESULT_OK, result);
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }
}
