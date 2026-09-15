package com.ingeniousidea.space;

import android.animation.Animator;
import android.animation.AnimatorListenerAdapter;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Color;
import android.view.View;
import android.view.animation.PathInterpolator;
import android.webkit.WebView;
import android.widget.FrameLayout;
import android.widget.ImageView;

import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Reusable frozen-frame center merge transition.
 *
 * The live WebView is captured once, then hidden. Two immutable bitmap halves
 * move from opposite screen edges and meet at the exact vertical midpoint over
 * a static page-background layer. No live DOM participates in the animation.
 */
final class FrozenCenterMergeTransition {
    interface Completion { void onComplete(); }

    private final FrameLayout root;
    private final WebView content;
    private final int backgroundColor;
    private final long durationMs;
    private final PathInterpolator interpolator;

    FrozenCenterMergeTransition(FrameLayout root, WebView content, JSONObject effectiveConfig) {
        this.root = root;
        this.content = content;
        JSONObject transition = effectiveConfig == null ? null : effectiveConfig.optJSONObject("frozen_center_merge_transition");
        this.backgroundColor = parseColor(
                effectiveConfig == null ? null : effectiveConfig.optString("global_set_background", null),
                Color.rgb(174, 209, 148));
        this.durationMs = Math.max(0L, transition == null ? 320L : transition.optLong("duration_ms", 320L));
        float[] easing = parseEasing(transition == null ? null : transition.optJSONArray("easing"));
        this.interpolator = new PathInterpolator(easing[0], easing[1], easing[2], easing[3]);
    }

    void run(Completion completion) {
        final int width = content.getWidth();
        final int height = content.getHeight();
        if (width <= 0 || height < 2) {
            if (completion != null) completion.onComplete();
            return;
        }

        final Bitmap full;
        try {
            full = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888);
            content.draw(new Canvas(full));
        } catch (Throwable error) {
            if (completion != null) completion.onComplete();
            return;
        }

        final int topHeight = height / 2;
        final int bottomHeight = height - topHeight;
        final Bitmap topBitmap = Bitmap.createBitmap(full, 0, 0, width, topHeight);
        final Bitmap bottomBitmap = Bitmap.createBitmap(full, 0, topHeight, width, bottomHeight);
        full.recycle();

        final View backdrop = new View(content.getContext());
        backdrop.setBackgroundColor(backgroundColor);
        backdrop.setClickable(true);
        final ImageView topFrame = frozenHalf(topBitmap);
        final ImageView bottomFrame = frozenHalf(bottomBitmap);

        final int[] rootLocation = new int[2];
        final int[] webLocation = new int[2];
        root.getLocationOnScreen(rootLocation);
        content.getLocationOnScreen(webLocation);
        final int left = webLocation[0] - rootLocation[0];
        final int top = webLocation[1] - rootLocation[1];

        FrameLayout.LayoutParams backdropParams = new FrameLayout.LayoutParams(width, height);
        backdropParams.leftMargin = left;
        backdropParams.topMargin = top;
        FrameLayout.LayoutParams topParams = new FrameLayout.LayoutParams(width, topHeight);
        topParams.leftMargin = left;
        topParams.topMargin = top;
        FrameLayout.LayoutParams bottomParams = new FrameLayout.LayoutParams(width, bottomHeight);
        bottomParams.leftMargin = left;
        bottomParams.topMargin = top + topHeight;

        content.setVisibility(View.INVISIBLE);
        content.setEnabled(false);
        root.addView(backdrop, backdropParams);
        root.addView(topFrame, topParams);
        root.addView(bottomFrame, bottomParams);
        topFrame.setTranslationY(-topHeight);
        bottomFrame.setTranslationY(bottomHeight);

        Runnable finish = () -> {
            content.setVisibility(View.VISIBLE);
            content.setEnabled(true);
            root.removeView(topFrame);
            root.removeView(bottomFrame);
            root.removeView(backdrop);
            if (!topBitmap.isRecycled()) topBitmap.recycle();
            if (!bottomBitmap.isRecycled()) bottomBitmap.recycle();
            if (completion != null) completion.onComplete();
        };

        if (durationMs == 0L) {
            topFrame.setTranslationY(0f);
            bottomFrame.setTranslationY(0f);
            finish.run();
            return;
        }
        topFrame.animate().translationY(0f).setDuration(durationMs).setInterpolator(interpolator).start();
        bottomFrame.animate().translationY(0f).setDuration(durationMs).setInterpolator(interpolator)
                .setListener(new AnimatorListenerAdapter() {
                    @Override public void onAnimationEnd(Animator animation) { finish.run(); }
                }).start();
    }

    private ImageView frozenHalf(Bitmap bitmap) {
        ImageView view = new ImageView(content.getContext());
        view.setImageBitmap(bitmap);
        view.setScaleType(ImageView.ScaleType.FIT_XY);
        view.setClickable(true);
        view.setFocusable(true);
        return view;
    }

    private static int parseColor(String raw, int fallback) {
        if (raw == null) return fallback;
        try { return Color.parseColor(raw.trim()); } catch (Exception ignored) { return fallback; }
    }

    private static float[] parseEasing(JSONArray value) {
        float[] fallback = new float[]{.22f, .72f, .22f, 1f};
        if (value == null || value.length() != 4) return fallback;
        try {
            float[] out = new float[4];
            for (int i = 0; i < 4; i++) out[i] = (float) value.getDouble(i);
            return out;
        } catch (Exception ignored) { return fallback; }
    }
}
