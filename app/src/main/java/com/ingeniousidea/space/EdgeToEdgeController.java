package com.ingeniousidea.space;

import android.app.Activity;
import android.graphics.Color;
import android.graphics.Insets;
import android.os.Build;
import android.view.View;
import android.view.Window;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.view.WindowManager;
import android.webkit.WebView;

/** Extends the surface behind system bars; forwards safe content edges to CSS. */
final class EdgeToEdgeController {
    private final Activity activity;
    private final WebView webView;
    private int top, right, bottom, left, keyboardViewportHeight;

    EdgeToEdgeController(Activity activity, WebView webView) {
        this.activity = activity;
        this.webView = webView;
    }

    @SuppressWarnings("deprecation")
    void install() {
        Window window = activity.getWindow();
        window.clearFlags(WindowManager.LayoutParams.FLAG_FULLSCREEN
                | WindowManager.LayoutParams.FLAG_TRANSLUCENT_STATUS
                | WindowManager.LayoutParams.FLAG_TRANSLUCENT_NAVIGATION);
        window.addFlags(WindowManager.LayoutParams.FLAG_DRAWS_SYSTEM_BAR_BACKGROUNDS);
        window.setStatusBarColor(Color.TRANSPARENT);
        window.setNavigationBarColor(Build.VERSION.SDK_INT >= 26 ? Color.TRANSPARENT : 0x66000000);
        applySystemBarVisibility();
        if (Build.VERSION.SDK_INT >= 28) {
            WindowManager.LayoutParams params = window.getAttributes();
            params.layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
            window.setAttributes(params);
            window.setNavigationBarDividerColor(Color.TRANSPARENT);
        }
        if (Build.VERSION.SDK_INT >= 29) {
            window.setStatusBarContrastEnforced(false);
            window.setNavigationBarContrastEnforced(false);
        }
        if (Build.VERSION.SDK_INT >= 30) window.setDecorFitsSystemWindows(false);
        webView.setOnApplyWindowInsetsListener((view, insets) -> {
            if (Build.VERSION.SDK_INT >= 30) {
                Insets bars = insets.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout());
                top = bars.top; right = bars.right; bottom = bars.bottom; left = bars.left;
                if (insets.isVisible(WindowInsets.Type.ime())) {
                    int imeBottom = insets.getInsets(WindowInsets.Type.ime()).bottom;
                    int windowHeight = activity.getWindowManager().getCurrentWindowMetrics().getBounds().height();
                    keyboardViewportHeight = Math.max(1, Math.min(webView.getHeight(), windowHeight - imeBottom));
                } else {
                    keyboardViewportHeight = 0;
                }
            } else {
                top = insets.getSystemWindowInsetTop();
                right = insets.getSystemWindowInsetRight();
                // Stable bottom excludes the keyboard on API 23–29.
                bottom = insets.getStableInsetBottom();
                left = insets.getSystemWindowInsetLeft();
                if (Build.VERSION.SDK_INT >= 28 && insets.getDisplayCutout() != null) {
                    top = Math.max(top, insets.getDisplayCutout().getSafeInsetTop());
                    left = Math.max(left, insets.getDisplayCutout().getSafeInsetLeft());
                    right = Math.max(right, insets.getDisplayCutout().getSafeInsetRight());
                    bottom = Math.max(bottom, insets.getDisplayCutout().getSafeInsetBottom());
                }
            }
            dispatchInsets();
            return insets;
        });
        webView.requestApplyInsets();
    }

    /** Hide only the top status bar. The navigation bar remains visible.
     *  A swipe from the top edge may reveal the status bar transiently. */
    @SuppressWarnings("deprecation")
    void hideStatusBar() {
        applySystemBarVisibility();
    }

    @SuppressWarnings("deprecation")
    private void applySystemBarVisibility() {
        Window window = activity.getWindow();
        if (Build.VERSION.SDK_INT >= 30) {
            WindowInsetsController controller = window.getInsetsController();
            if (controller != null) {
                controller.setSystemBarsBehavior(
                        WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
                controller.hide(WindowInsets.Type.statusBars());

                // Keep icon appearance explicit for a light Jet Note surface.
                int appearance = WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS;
                if (Build.VERSION.SDK_INT >= 26) {
                    appearance |= WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS;
                }
                controller.setSystemBarsAppearance(appearance, appearance);
            }
            return;
        }

        // API 23-29 fallback: fullscreen hides the status bar only; notably,
        // SYSTEM_UI_FLAG_HIDE_NAVIGATION is intentionally not used.
        int flags = View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                | View.SYSTEM_UI_FLAG_FULLSCREEN
                | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                | View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR;
        if (Build.VERSION.SDK_INT >= 26) flags |= View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR;
        window.getDecorView().setSystemUiVisibility(flags);
    }

    void dispatchInsets() {
        webView.evaluateJavascript("window.applySystemInsets && window.applySystemInsets("
                + top + "," + right + "," + bottom + "," + left + "," + keyboardViewportHeight + ")", null);
    }
}
