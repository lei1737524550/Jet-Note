package com.ingeniousidea.space;

import android.app.Activity;
import android.graphics.Color;
import android.net.Uri;
import android.view.Gravity;
import android.view.MotionEvent;
import android.view.ScaleGestureDetector;
import android.view.View;
import android.view.ViewGroup;
import android.widget.FrameLayout;
import android.widget.MediaController;
import android.widget.TextView;
import android.widget.VideoView;

import java.io.File;

/**
 * Native, dependency-free video player used by Jet Note.
 *
 * WebView only renders a lightweight poster. Playback is performed by Android's
 * media stack against the app-owned file directly, avoiding WebView HTTP range,
 * HTMLMediaElement lifecycle and Chromium control-layout issues.
 */
final class NativeVideoPlayer {
    private final Activity activity;
    private final FrameLayout root;
    private final AttachmentStore store;

    private FrameLayout overlay;
    private VideoView videoView;
    private float scale = 1f;

    NativeVideoPlayer(Activity activity, FrameLayout root, AttachmentStore store) {
        this.activity = activity;
        this.root = root;
        this.store = store;
    }

    boolean isOpen() {
        return overlay != null && overlay.getParent() != null;
    }

    void play(String archivePath) {
        activity.runOnUiThread(() -> openInternal(archivePath));
    }

    private void openInternal(String archivePath) {
        File file = store.fileForArchivePath(archivePath);
        if (file == null || !file.isFile()) return;

        close();
        scale = 1f;

        overlay = new FrameLayout(activity);
        overlay.setBackgroundColor(Color.BLACK);
        overlay.setClickable(true);
        overlay.setFocusable(true);

        videoView = new VideoView(activity);
        FrameLayout.LayoutParams videoParams = new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT,
                Gravity.CENTER);
        overlay.addView(videoView, videoParams);

        MediaController controller = new MediaController(activity);
        controller.setAnchorView(videoView);
        videoView.setMediaController(controller);

        TextView close = new TextView(activity);
        close.setText("×");
        close.setTextColor(Color.WHITE);
        close.setTextSize(34);
        close.setGravity(Gravity.CENTER);
        close.setBackgroundColor(0x66000000);
        FrameLayout.LayoutParams closeParams = new FrameLayout.LayoutParams(dp(52), dp(52), Gravity.TOP | Gravity.END);
        closeParams.topMargin = dp(16);
        closeParams.rightMargin = dp(12);
        overlay.addView(close, closeParams);
        close.setOnClickListener(v -> close());

        ScaleGestureDetector scaler = new ScaleGestureDetector(activity,
                new ScaleGestureDetector.SimpleOnScaleGestureListener() {
                    @Override public boolean onScale(ScaleGestureDetector detector) {
                        scale *= detector.getScaleFactor();
                        scale = Math.max(1f, Math.min(4f, scale));
                        videoView.setScaleX(scale);
                        videoView.setScaleY(scale);
                        return true;
                    }
                });
        videoView.setOnTouchListener((v, event) -> {
            scaler.onTouchEvent(event);
            if (event.getActionMasked() == MotionEvent.ACTION_UP && !scaler.isInProgress()) {
                controller.show(2500);
            }
            return scaler.isInProgress();
        });

        root.addView(overlay, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT));
        overlay.bringToFront();

        videoView.setVideoURI(Uri.fromFile(file));
        videoView.setOnPreparedListener(mp -> {
            mp.setLooping(false);
            videoView.start();
            controller.show(1800);
        });
        videoView.setOnErrorListener((mp, what, extra) -> {
            controller.hide();
            return false;
        });
    }

    void close() {
        activity.runOnUiThread(() -> {
            if (videoView != null) {
                try { videoView.stopPlayback(); } catch (Exception ignored) { }
            }
            if (overlay != null && overlay.getParent() instanceof ViewGroup) {
                ((ViewGroup) overlay.getParent()).removeView(overlay);
            }
            videoView = null;
            overlay = null;
            scale = 1f;
        });
    }

    private int dp(int value) {
        return Math.round(value * activity.getResources().getDisplayMetrics().density);
    }
}
