package com.ingeniousidea.space;

import android.app.Activity;
import android.content.Context;
import android.content.SharedPreferences;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Color;
import android.graphics.drawable.GradientDrawable;
import android.view.GestureDetector;
import android.os.Handler;
import android.os.Looper;
import android.view.Gravity;
import android.view.MotionEvent;
import android.view.View;
import android.view.ViewGroup;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.TextView;

import java.io.InputStream;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Locale;

/** Image-driven entrance guide. Drop images into assets/intro/zh or assets/intro/en. */
public final class IntroGuideController {
    private static final String ROOT = "intro";
    private static final String PREFS = "jet_note_intro";
    private static final String KEY_SEEN = "intro_seen";
    // Keep transparent guide artwork on the same green canvas used by Jet Note startup/UI.
    private static final int GUIDE_BACKGROUND = Color.rgb(174, 209, 148); // #AED194

    private final Activity activity;
    private final FrameLayout host;
    private FrameLayout overlay;
    private ImageView image;
    private TextView action;
    private List<String> pages = new ArrayList<>();
    private final List<Bitmap> pageBitmaps = new ArrayList<>();
    private int index;
    private String preparedFolder;
    private boolean prepared;
    private final Handler uiHandler = new Handler(Looper.getMainLooper());
    private final Runnable deferredImageRender = () -> renderCurrentImage();

    public IntroGuideController(Activity activity, FrameLayout host) {
        this.activity = activity;
        this.host = host;
    }

    /**
     * Preload every guide bitmap while the native startup animation is still visible.
     * The completion callback always runs on the UI thread.
     */
    public void preloadAsync(Runnable onComplete) {
        final String languageFolder = "zh".equals(UiLanguage.languageCode(activity)) ? "zh" : "en";
        final String folder = ROOT + "/" + languageFolder;
        prepared = false;
        new Thread(() -> {
            List<String> loadedPages = listImages(folder);
            List<Bitmap> loadedBitmaps = new ArrayList<>();
            for (String page : loadedPages) {
                try (InputStream in = activity.getAssets().open(page)) {
                    loadedBitmaps.add(BitmapFactory.decodeStream(in));
                } catch (Exception ignored) {
                    loadedBitmaps.add(null);
                }
            }
            new Handler(Looper.getMainLooper()).post(() -> {
                pages = loadedPages;
                pageBitmaps.clear();
                pageBitmaps.addAll(loadedBitmaps);
                preparedFolder = folder;
                prepared = true;
                if (onComplete != null) onComplete.run();
            });
        }, "JetNote-IntroPreload").start();
    }

    /** Show automatically only once, on the first launch that actually has guide images. */
    public boolean showFirstLaunchIfAvailable() {
        SharedPreferences prefs = activity.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        if (prefs.getBoolean(KEY_SEEN, false)) return false;
        boolean shown = showIfAvailable();
        // An empty language folder must not permanently consume the first-run guide.
        return shown;
    }

    /** Manual entry from Settings. This deliberately ignores intro_seen. */
    public boolean showManual() {
        if (overlay != null) return true;
        return showIfAvailable();
    }

    /** @return true when a guide overlay was actually shown. */
    private boolean showIfAvailable() {
        String languageFolder = "zh".equals(UiLanguage.languageCode(activity)) ? "zh" : "en";
        String folder = ROOT + "/" + languageFolder;
        // Normally this has already been completed under the startup animation.
        // Keep a synchronous fallback only for unusual lifecycle/recreation paths.
        if (!prepared || !folder.equals(preparedFolder)) {
            pages = listImages(folder);
            pageBitmaps.clear();
            for (String page : pages) {
                try (InputStream in = activity.getAssets().open(page)) {
                    pageBitmaps.add(BitmapFactory.decodeStream(in));
                } catch (Exception ignored) {
                    pageBitmaps.add(null);
                }
            }
            preparedFolder = folder;
            prepared = true;
        }
        if (pages.isEmpty()) return false;

        overlay = new FrameLayout(activity);
        overlay.setBackgroundColor(GUIDE_BACKGROUND);
        overlay.setClickable(true);
        overlay.setFocusable(true);

        image = new ImageView(activity);
        image.setScaleType(ImageView.ScaleType.FIT_CENTER);
        image.setBackgroundColor(Color.TRANSPARENT);
        overlay.addView(image, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));

        action = new TextView(activity);
        action.setTextSize(16f);
        action.setTextColor(Color.rgb(25, 25, 25));
        action.setGravity(Gravity.CENTER);
        action.setPadding(dp(24), dp(12), dp(24), dp(12));
        action.setClickable(true);
        action.setFocusable(true);
        GradientDrawable bg = new GradientDrawable();
        bg.setColor(0xEFFFFFFF);
        bg.setCornerRadius(dp(24));
        action.setBackground(bg);

        // Advance on ACTION_DOWN, not ACTION_UP. This deliberately removes the perceived
        // tap cooldown: every new finger-down is handled immediately, even when taps are
        // much faster than the display refresh / image redraw. The event is fully consumed
        // by the button so the swipe detector cannot steal or delay it.
        action.setOnTouchListener((v, event) -> {
            switch (event.getActionMasked()) {
                case MotionEvent.ACTION_DOWN:
                    v.setPressed(true);
                    nextOrEnter();
                    return true;
                case MotionEvent.ACTION_UP:
                case MotionEvent.ACTION_CANCEL:
                    v.setPressed(false);
                    return true;
                default:
                    return true;
            }
        });

        FrameLayout.LayoutParams ap = new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT, dp(52), Gravity.BOTTOM | Gravity.CENTER_HORIZONTAL);
        // Raised from 42dp to 76dp above the bottom edge.
        ap.bottomMargin = dp(76);
        overlay.addView(action, ap);

        GestureDetector detector = new GestureDetector(activity, new GestureDetector.SimpleOnGestureListener() {
            @Override public boolean onDown(MotionEvent e) { return true; }
            @Override public boolean onFling(MotionEvent e1, MotionEvent e2, float vx, float vy) {
                if (e1 == null || e2 == null) return false;
                float dx = e2.getX() - e1.getX();
                if (Math.abs(dx) < dp(45) || Math.abs(vx) < 180) return false;
                if (dx < 0) goTo(index + 1); else goTo(index - 1);
                return true;
            }
        });
        overlay.setOnTouchListener((v, e) -> detector.onTouchEvent(e));

        host.addView(overlay, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        index = 0;
        updateActionText();
        renderCurrentImage();
        return true;
    }

    private boolean isPointInside(View v, float x, float y) {
        return x >= 0 && y >= 0 && x < v.getWidth() && y < v.getHeight();
    }

    private List<String> listImages(String folder) {
        List<String> result = new ArrayList<>();
        try {
            String[] names = activity.getAssets().list(folder);
            if (names == null) return result;
            Arrays.sort(names, (a, b) -> a.compareToIgnoreCase(b));
            for (String name : names) {
                String n = name.toLowerCase(Locale.ROOT);
                if (n.endsWith(".png") || n.endsWith(".jpg") || n.endsWith(".jpeg") ||
                        n.endsWith(".webp") || n.endsWith(".gif")) {
                    result.add(folder + "/" + name);
                }
            }
        } catch (Exception ignored) { }
        return result;
    }

    private void goTo(int target) {
        if (pages.isEmpty()) return;
        if (target < 0) target = 0;
        if (target >= pages.size()) target = pages.size() - 1;

        // IMPORTANT: advancing the guide must never wait for an ImageView/bitmap redraw.
        // Only update the logical page and button synchronously. Bitmap replacement is
        // deferred a little; repeated fast taps collapse into one render of the latest page.
        // This prevents large guide images / GPU texture uploads from making every other tap
        // appear to be ignored.
        index = target;
        updateActionText();
        uiHandler.removeCallbacks(deferredImageRender);
        uiHandler.postDelayed(deferredImageRender, 70L);
    }

    private void updateActionText() {
        if (action == null || pages.isEmpty()) return;
        boolean last = index == pages.size() - 1;
        action.setText(last ? ("zh".equals(UiLanguage.languageCode(activity)) ? "进入" : "Enter")
                : ("zh".equals(UiLanguage.languageCode(activity)) ? "下一步" : "Next"));
    }

    private void renderCurrentImage() {
        if (image == null || pages.isEmpty()) return;
        Bitmap bitmap = index < pageBitmaps.size() ? pageBitmaps.get(index) : null;
        if (bitmap != null) image.setImageBitmap(bitmap); else image.setImageDrawable(null);
    }

    private void nextOrEnter() {
        if (overlay == null) return;
        if (index < pages.size() - 1) goTo(index + 1);
        else dismiss();
    }

    public void dismiss() {
        activity.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putBoolean(KEY_SEEN, true).apply();
        uiHandler.removeCallbacks(deferredImageRender);
        if (overlay != null && overlay.getParent() == host) host.removeView(overlay);
        overlay = null;
        image = null;
        action = null;
        // Bitmaps can now be reclaimed normally; do not recycle here because ImageView may
        // still be completing a draw in the same frame in which the overlay is removed.
        pageBitmaps.clear();
    }

    private int dp(float v) { return Math.round(v * activity.getResources().getDisplayMetrics().density); }
}
