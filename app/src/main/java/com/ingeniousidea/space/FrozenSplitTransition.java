package com.ingeniousidea.space;

import android.animation.Animator;
import android.animation.AnimatorListenerAdapter;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Color;
import android.view.View;
import android.view.ViewTreeObserver;
import android.view.animation.PathInterpolator;
import android.webkit.WebView;
import android.widget.FrameLayout;
import android.widget.ImageView;

import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Reusable target-oriented frozen split transition.
 *
 * The live WebView is captured once and remains visible/enabled underneath an
 * opaque transition backdrop. Two immutable bitmap halves move from opposite
 * screen edges and meet over that backdrop. Keeping the WebView alive preserves
 * its native InputConnection/caret while no live DOM is visually exposed.
 */
final class FrozenSplitTransition {
    interface Completion { void onComplete(); }

    private final FrameLayout root;
    private final WebView content;
    private final int backgroundColor;
    private final long durationMs;
    private final PathInterpolator interpolator;
    private final float splitPercent;
    private final float sourceZAxisHeight;
    private final float targetZAxisHeight;

    FrozenSplitTransition(FrameLayout root, WebView content, JSONObject effectiveConfig, String targetKey) {
        this(root, content, effectiveConfig, targetKey, content == null ? ZAxisHeights.CONTENT : content.getZ(),
                content == null ? ZAxisHeights.CONTENT : content.getZ());
    }

    FrozenSplitTransition(FrameLayout root, WebView content, JSONObject effectiveConfig, String targetKey,
                          float sourceZAxisHeight, float targetZAxisHeight) {
        this.root = root;
        this.content = content;
        JSONObject transitionRoot = effectiveConfig == null ? null : effectiveConfig.optJSONObject("frozen_split_transition");
        JSONObject transition = transitionRoot == null ? null : transitionRoot.optJSONObject(targetKey == null ? "x_to_home" : targetKey);
        this.backgroundColor = parseColor(
                effectiveConfig == null ? null : effectiveConfig.optString("global_set_background", null),
                Color.rgb(174, 209, 148));
        this.durationMs = Math.max(0L, transition == null ? 320L : transition.optLong("duration_ms", 320L));
        this.splitPercent = clampSplitPercent(transition == null ? 50.0 : transition.optDouble("split_percent", 50.0));
        float[] easing = parseEasing(transition == null ? null : transition.optJSONArray("easing"));
        this.interpolator = new PathInterpolator(easing[0], easing[1], easing[2], easing[3]);
        this.sourceZAxisHeight = sourceZAxisHeight;
        this.targetZAxisHeight = targetZAxisHeight;
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

        final int topHeight = Math.max(1, Math.min(height - 1, Math.round(height * splitPercent / 100f)));
        final int bottomHeight = height - topHeight;
        final Bitmap topBitmap = Bitmap.createBitmap(full, 0, 0, width, topHeight);
        final Bitmap bottomBitmap = Bitmap.createBitmap(full, 0, topHeight, width, bottomHeight);
        full.recycle();

        // Strict A -> B insertion model. Only the two participating layers
        // determine the temporary transition heights; unrelated root children
        // do not affect the calculation. A and B keep their original heights.
        final ZAxisHeights.TransitionHeights transitionHeights =
                ZAxisHeights.between(sourceZAxisHeight, targetZAxisHeight);

        final FrameLayout backgroundHost = new FrameLayout(content.getContext());
        backgroundHost.setClickable(true);
        backgroundHost.setFocusable(true);
        backgroundHost.setZ(transitionHeights.background);

        final FrameLayout animationHost = new FrameLayout(content.getContext());
        animationHost.setClickable(true);
        animationHost.setFocusable(true);
        animationHost.setZ(transitionHeights.animation);

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

        FrameLayout.LayoutParams backdropParams = new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.MATCH_PARENT);
        FrameLayout.LayoutParams topParams = new FrameLayout.LayoutParams(width, topHeight);
        topParams.leftMargin = left;
        topParams.topMargin = top;
        FrameLayout.LayoutParams bottomParams = new FrameLayout.LayoutParams(width, bottomHeight);
        bottomParams.leftMargin = left;
        bottomParams.topMargin = top + topHeight;

        // Do NOT hide or disable the WebView here. Android WebView may tear down
        // its native InputConnection/caret when it becomes INVISIBLE/disabled.
        // The opaque backdrop is added above it, so the live page stays fully
        // alive but cannot be seen or touched during the frozen animation.
        // Two temporary native layers implement the exact A -> B stack:
        // max(A, B) + 1 = opaque configured background
        // max(A, B) + 2 = immutable frozen animation
        // The real target remains untouched at its original Z-axis height.
        root.addView(backgroundHost, new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.MATCH_PARENT));
        root.addView(animationHost, new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.MATCH_PARENT));
        backgroundHost.addView(backdrop, backdropParams);
        animationHost.addView(topFrame, topParams);
        animationHost.addView(bottomFrame, bottomParams);
        topFrame.setTranslationY(-topHeight);
        bottomFrame.setTranslationY(bottomHeight);

        final Runnable cleanup = () -> {
            animationHost.removeAllViews();
            backgroundHost.removeAllViews();
            root.removeView(animationHost);
            root.removeView(backgroundHost);
            if (!topBitmap.isRecycled()) topBitmap.recycle();
            if (!bottomBitmap.isRecycled()) bottomBitmap.recycle();
            if (completion != null) completion.onComplete();
        };

        final Runnable finishAfterCommittedFrame = () -> {
            // Freeze the exact merged geometry, then wait for that geometry to
            // participate in a real Android draw pass before removing either
            // temporary layer. postOnAnimation alone is not a draw guarantee.
            topFrame.animate().setListener(null).cancel();
            bottomFrame.animate().setListener(null).cancel();
            topFrame.setTranslationY(0f);
            bottomFrame.setTranslationY(0f);
            animationHost.invalidate();

            final ViewTreeObserver observer = animationHost.getViewTreeObserver();
            final ViewTreeObserver.OnPreDrawListener[] listener = new ViewTreeObserver.OnPreDrawListener[1];
            listener[0] = () -> {
                ViewTreeObserver current = animationHost.getViewTreeObserver();
                if (current.isAlive()) current.removeOnPreDrawListener(listener[0]);
                // Keep the fully merged bitmap + opaque background alive for
                // the draw that is about to happen, and remove them next VSYNC.
                root.postOnAnimation(cleanup);
                return true;
            };
            observer.addOnPreDrawListener(listener[0]);
            animationHost.requestLayout();
            animationHost.invalidate();
        };

        final Runnable startAnimation = () -> {
            if (durationMs == 0L) {
                finishAfterCommittedFrame.run();
                return;
            }

            final int[] ended = new int[]{0};
            final boolean[] finished = new boolean[]{false};
            Runnable markEnded = () -> {
                ended[0]++;
                if (ended[0] >= 2 && !finished[0]) {
                    finished[0] = true;
                    finishAfterCommittedFrame.run();
                }
            };

            topFrame.animate().translationY(0f).setDuration(durationMs).setInterpolator(interpolator)
                    .setListener(new AnimatorListenerAdapter() {
                        @Override public void onAnimationEnd(Animator animation) { markEnded.run(); }
                    }).start();
            bottomFrame.animate().translationY(0f).setDuration(durationMs).setInterpolator(interpolator)
                    .setListener(new AnimatorListenerAdapter() {
                        @Override public void onAnimationEnd(Animator animation) { markEnded.run(); }
                    }).start();
        };

        // Transactional first-frame barrier:
        // 1. install opaque background + frozen halves at their initial positions;
        // 2. let Android actually draw that protected composition once;
        // 3. only on the following VSYNC start moving the frozen halves.
        // This closes the race where the live target/source WebView could be
        // submitted before the native transition layers became visible.
        final ViewTreeObserver observer = animationHost.getViewTreeObserver();
        final ViewTreeObserver.OnPreDrawListener[] firstFrameListener =
                new ViewTreeObserver.OnPreDrawListener[1];
        firstFrameListener[0] = () -> {
            ViewTreeObserver current = animationHost.getViewTreeObserver();
            if (current.isAlive()) current.removeOnPreDrawListener(firstFrameListener[0]);
            root.postOnAnimation(startAnimation);
            return true;
        };
        observer.addOnPreDrawListener(firstFrameListener[0]);
        backgroundHost.invalidate();
        animationHost.invalidate();
        root.invalidate();
    }

    private ImageView frozenHalf(Bitmap bitmap) {
        ImageView view = new ImageView(content.getContext());
        view.setImageBitmap(bitmap);
        view.setScaleType(ImageView.ScaleType.FIT_XY);
        view.setClickable(true);
        view.setFocusable(true);
        return view;
    }

    private static float clampSplitPercent(double value) {
        if (!Double.isFinite(value)) return 50f;
        return (float) Math.max(1.0, Math.min(99.0, value));
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
