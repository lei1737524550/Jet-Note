package com.ingeniousidea.space;

import android.app.Activity;
import android.graphics.Color;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.net.http.SslError;
import android.os.Build;
import android.animation.Animator;
import android.animation.AnimatorListenerAdapter;
import android.view.animation.PathInterpolator;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowInsets;
import android.webkit.CookieManager;
import android.webkit.DownloadListener;
import android.webkit.JsResult;
import android.webkit.SslErrorHandler;
import android.webkit.URLUtil;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.ImageButton;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.TextView;
import android.widget.Toast;

import java.io.File;
import java.io.BufferedInputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.LinkedHashSet;
import java.util.Locale;
import java.util.Set;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

/** Reusable host for every Jet Note toolbox_* web page; source discovery lives in assets/get_source/. */
final class ToolPageController {
    private static final String ADD_SCHEME = "jetnote-add";
    private static final String SAVE_SCHEME = "jetnote-save"; // long-press resource download
    private static final String SOURCE_STATE_SCHEME = "jetnote-source-state";
    private static final Pattern CSS_RGB_COLOR = Pattern.compile(
            "rgba?\\(\\s*(\\d{1,3})\\s*,\\s*(\\d{1,3})\\s*,\\s*(\\d{1,3})(?:\\s*,\\s*(?:0(?:\\.\\d+)?|1(?:\\.0+)?))?\\s*\\)",
            Pattern.CASE_INSENSITIVE);
    private final PageActionBarSpec pageActionBarSpec;

    /*
     * Resource discovery lives in assets/get_source/. Short taps keep the primary add-to-post
     * flow; long presses use MediaDownloadController for the shared Downloads/Jet Note behavior.
     */
    private final Activity activity;
    private final FrameLayout root;
    private final WebView mainWebView;
    private final AttachmentStore attachmentStore;
    private final ExecutorService audioImportExecutor = Executors.newSingleThreadExecutor();
    private final Set<String> observedAudioUrls = new LinkedHashSet<>();

    private FrameLayout overlay;
    private WebView toolWebView;
    private View toolbar;
    private ImageButton sourceActionButton;
    private boolean sourceActionActive;
    private View loadStatePanel;
    private TextView loadStateTitle;
    private TextView loadStateCode;
    private ProgressBar loadSpinner;
    private boolean pageFailed;
    private String pageUrl="about:blank";
    private String pageTitle="Tool";
    private String pageLanguage="en";
    private int toolBackgroundColor = Color.WHITE;
    private int toolBorderColor = 0xffbfc1c4;
    private volatile String getSourceExtensionFilterJson = "[]";
    private boolean browserMode;
    private String fallbackPageUrl;
    private String fallbackPageTitle;
    private boolean fallbackAttempted;
    private boolean homeRevealInProgress;
    private TextView toolbarTitle;
    private static final String HOME_PRELOAD_URL = "https://appassets.androidplatform.net/assets/app/home/home.html?startupBrowserPreload=1";

    ToolPageController(
            Activity activity, FrameLayout root, WebView mainWebView, AttachmentStore attachmentStore
    ) {
        this.activity = activity;
        this.pageActionBarSpec = PageActionBarSpec.load(activity);
        this.root = root;
        this.mainWebView = mainWebView;
        this.attachmentStore = attachmentStore;
    }

    void setGetSourceExtensionFilterJson(String json) {
        String normalized = "[]";
        try {
            JSONArray input = new JSONArray(json == null ? "[]" : json);
            JSONArray output = new JSONArray();
            LinkedHashSet<String> seen = new LinkedHashSet<>();
            for (int i = 0; i < input.length(); i++) {
                String ext = input.optString(i, "").trim().toLowerCase(Locale.US);
                if (ext.matches("[a-z0-9]+") && seen.add(ext)) output.put(ext);
            }
            normalized = output.toString();
        } catch (Exception ignored) { }
        getSourceExtensionFilterJson = normalized;
    }

    void open(String url, String title, String language, String backgroundColor, String borderColor) {
        open(url, title, language, backgroundColor, borderColor, false);
    }

    void open(String url, String title, String language, String backgroundColor, String borderColor, boolean browserMode) {
        activity.runOnUiThread(() -> {
            if (overlay != null && url.equals(pageUrl) && this.browserMode == browserMode) return;
            if (overlay != null) close();
            pageUrl = url;
            pageTitle = title;
            this.browserMode = browserMode;
            pageLanguage = language == null || language.trim().isEmpty() ? "en" : language.trim();
            toolBackgroundColor = parseColor(backgroundColor, pageActionBarSpec.backgroundColor);
            toolBorderColor = parseColor(borderColor, pageActionBarSpec.borderColor);
            observedAudioUrls.clear();
            fallbackPageUrl = null;
            fallbackPageTitle = null;
            fallbackAttempted = false;
            openOnUiThread();
        });
    }

    /**
     * Opens the primary tool URL when reachable, otherwise falls back to the
     * configured secondary URL. The probe runs off the UI thread. If both fail,
     * show Jet Note's shared Android-native rounded notice instead of a WebView alert.
     */
    void openWithFallback(
            String primaryUrl,
            String fallbackUrl,
            String title,
            String language,
            String backgroundColor,
            String borderColor,
            int timeoutMs
    ) {
        openWithFallback(primaryUrl, fallbackUrl, title, title, language, backgroundColor, borderColor, timeoutMs, false);
    }

    void openWithFallback(
            String primaryUrl,
            String fallbackUrl,
            String primaryTitle,
            String fallbackTitle,
            String language,
            String backgroundColor,
            String borderColor,
            int timeoutMs,
            boolean browserMode
    ) {
        activity.runOnUiThread(() -> {
            if (overlay != null) close();
            pageUrl = primaryUrl;
            pageTitle = primaryTitle;
            this.browserMode = browserMode;
            pageLanguage = language == null || language.trim().isEmpty() ? "en" : language.trim();
            toolBackgroundColor = parseColor(backgroundColor, pageActionBarSpec.backgroundColor);
            toolBorderColor = parseColor(borderColor, pageActionBarSpec.borderColor);
            observedAudioUrls.clear();
            fallbackPageUrl = (fallbackUrl != null && fallbackUrl.startsWith("https://")) ? fallbackUrl : null;
            fallbackPageTitle = fallbackTitle == null || fallbackTitle.trim().isEmpty() ? primaryTitle : fallbackTitle.trim();
            fallbackAttempted = false;
            openOnUiThread();
        });
    }

    private void openOnUiThread() {
        if (overlay != null) return;

        overlay = new FrameLayout(activity);
        overlay.setBackgroundColor(toolBackgroundColor);
        overlay.setElevation(ZAxisHeights.TOOL);
        root.addView(overlay, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));

        toolWebView = new WebView(activity);
        toolWebView.setVerticalScrollBarEnabled(false);
        toolWebView.setHorizontalScrollBarEnabled(false);
        toolWebView.setBackgroundColor(toolBackgroundColor);
        configure(toolWebView);
        FrameLayout.LayoutParams webParams = new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT);
        webParams.topMargin = dp(pageActionBarSpec.height);
        overlay.addView(toolWebView, webParams);

        toolbar = createToolbar();
        FrameLayout.LayoutParams toolbarParams = new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, dp(pageActionBarSpec.height), Gravity.TOP);
        overlay.addView(toolbar, toolbarParams);

        // Transient audio status is shown only through the Android Toast below.
        // The old in-overlay banner duplicated the same message in green.

        loadStatePanel = createLoadStatePanel();
        FrameLayout.LayoutParams stateParams = new FrameLayout.LayoutParams(
                dp(250), ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.CENTER);
        stateParams.topMargin = dp(pageActionBarSpec.height / 2);
        overlay.addView(loadStatePanel, stateParams);
        showLoadingState();

        if (Build.VERSION.SDK_INT >= 20) {
            overlay.setOnApplyWindowInsetsListener((view, insets) -> {
                int top = 0;
                int left = 0;
                int right = 0;
                int bottom = 0;
                if (Build.VERSION.SDK_INT >= 30) {
                    android.graphics.Insets bars = insets.getInsets(
                            WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout());
                    top = bars.top;
                    left = bars.left;
                    right = bars.right;
                    bottom = bars.bottom;
                } else {
                    top = insets.getSystemWindowInsetTop();
                    left = insets.getSystemWindowInsetLeft();
                    right = insets.getSystemWindowInsetRight();
                    bottom = insets.getSystemWindowInsetBottom();
                }

                FrameLayout.LayoutParams tp = (FrameLayout.LayoutParams) toolbar.getLayoutParams();
                tp.topMargin = top;
                tp.leftMargin = left;
                tp.rightMargin = right;
                toolbar.setLayoutParams(tp);

                FrameLayout.LayoutParams wp = (FrameLayout.LayoutParams) toolWebView.getLayoutParams();
                wp.topMargin = top + dp(pageActionBarSpec.height);
                wp.leftMargin = left;
                wp.rightMargin = right;
                toolWebView.setLayoutParams(wp);
                return insets;
            });
            overlay.requestApplyInsets();
        }

        if (browserMode) preloadHomeBehindBrowser();
        toolWebView.loadUrl(pageUrl);
    }

    private void preloadHomeBehindBrowser() {
        if (mainWebView == null) return;
        mainWebView.loadUrl(HOME_PRELOAD_URL);
    }

    boolean isOpen() {
        return overlay != null;
    }

    void handleBack() {
        close();
    }

    void close() {
        if (overlay == null) return;
        if (browserMode) {
            beginFrozenHomeReveal(0);
            return;
        }
        requestCloseToEditorTransition();
    }

    /** X -> Editor owns the transaction; toolbox_* only requests the target. */
    private void requestCloseToEditorTransition() {
        if (overlay == null) return;
        final float sourceZ = overlay.getZ();
        mainWebView.evaluateJavascript(
                "try{window.JetTargetTransition&&window.JetTargetTransition.nativeSourceToEditor(" + sourceZ + ");}catch(e){}", null);
    }

    /** Called by NativeBridge only after the common X -> Editor cover is visibly committed. */
    void completeCloseToEditorBehindTransitionCover() {
        if (overlay == null) {
            dispatchNativeEditorPrepared();
            return;
        }
        finishToolClose(true);
        mainWebView.evaluateJavascript(
                "(function(){if(window.EditorController&&window.EditorController.resume){" +
                "window.EditorController.resume();window.dispatchEvent(new CustomEvent('jetnote:editor-resume'));}" +
                "window.dispatchEvent(new CustomEvent('jetnote:native-target-prepared',{detail:{action:'editor'}}));})()", null);
    }

    private void dispatchNativeEditorPrepared() {
        mainWebView.evaluateJavascript(
                "try{window.dispatchEvent(new CustomEvent('jetnote:native-target-prepared',{detail:{action:'editor'}}));}catch(e){}", null);
    }

    /**
     * Browser Mode keeps Home alive behind the native browser. On Back we do not
     * animate live Home DOM nodes: status time, battery and post layout may update
     * while an animation is running and produce visibly wrong intermediate frames.
     * Instead, wait until Home reports ready, capture one stable WebView frame, cut
     * that frame at the exact vertical midpoint, and animate the two immutable
     * bitmap halves from the screen edges until they meet. Only after the merge is
     * complete is the real Home WebView made visible/interactable again.
     */
    private void beginFrozenHomeReveal(int attempt) {
        if (homeRevealInProgress || mainWebView == null || overlay == null) return;
        mainWebView.evaluateJavascript(
                "(function(){try{return !!(window.JetNoteStartupBrowserEntry&&window.JetNoteStartupBrowserEntry.isReady&&window.JetNoteStartupBrowserEntry.isReady());}catch(e){return false;}})()",
                value -> {
                    if (overlay == null || !browserMode) return;
                    boolean ready = "true".equalsIgnoreCase(String.valueOf(value).replace("\"", "").trim());
                    if (ready) {
                        homeRevealInProgress = true;
                        captureAndAnimateFrozenHome();
                    } else if (attempt < 80) {
                        mainWebView.postDelayed(() -> beginFrozenHomeReveal(attempt + 1), 50L);
                    } else {
                        // Keep the Browser visible while restarting the hidden Home;
                        // never expose a half-initialized live page.
                        mainWebView.loadUrl(HOME_PRELOAD_URL);
                        mainWebView.postDelayed(() -> beginFrozenHomeReveal(0), 100L);
                    }
                });
    }

    private void captureAndAnimateFrozenHome() {
        JSONObject effectiveConfig;
        try {
            effectiveConfig = new JSONObject(RuntimeConfigStore.readEffective(activity));
        } catch (Exception ignored) {
            effectiveConfig = new JSONObject();
        }

        FrozenSplitTransition transition =
                new FrozenSplitTransition(root, mainWebView, effectiveConfig, "x_to_home",
                        overlay == null ? ZAxisHeights.TOOL : overlay.getZ(), mainWebView.getZ());
        transition.run(() -> {
            homeRevealInProgress = false;
            mainWebView.evaluateJavascript(
                    "try{window.JetNoteStartupBrowserEntry&&window.JetNoteStartupBrowserEntry.finishFrozenReveal&&window.JetNoteStartupBrowserEntry.finishFrozenReveal();}catch(e){}",
                    null);
        });

        // The Browser overlay is removed only after the frozen Home layers have
        // been installed. App startup Splash is not part of this route.
        finishToolClose(true);
    }

    private void finishToolClose(boolean returnToHome) {
        if (overlay == null) return;
        applyCachePolicyOnToolClose();
        root.removeView(overlay);
        if (toolWebView != null) {
            toolWebView.stopLoading();
            toolWebView.setDownloadListener(null);
            toolWebView.setWebChromeClient(null);
            toolWebView.setWebViewClient(null);
            toolWebView.destroy();
        }
        toolWebView = null;
        toolbar = null;
        toolbarTitle = null;
        sourceActionButton = null;
        sourceActionActive = false;
        overlay = null;
        loadStatePanel = null;
        loadStateTitle = null;
        loadStateCode = null;
        loadSpinner = null;
        observedAudioUrls.clear();
        browserMode = false;
    }

    private void applyCachePolicyOnToolClose() {
        clearWebCacheOnUiThread();
    }

    private void clearWebCacheOnUiThread() {
        WebView target = toolWebView;
        boolean temporary = false;
        if (target == null) {
            target = new WebView(activity);
            temporary = true;
        }
        target.clearCache(true);
        if (temporary) target.destroy();
    }

    private long webCacheBytes() {
        return cacheDirectoryBytes(activity.getCacheDir());
    }

    private long cacheDirectoryBytes(File file) {
        if (file == null || !file.exists()) return 0L;
        String name = file.getName();
        if (name.startsWith("jetnote-import-") || name.startsWith("media-write-")) return 0L;
        if (file.isFile()) return file.length();
        File[] children = file.listFiles();
        if (children == null) return 0L;
        long total = 0L;
        for (File child : children) total += cacheDirectoryBytes(child);
        return total;
    }

    void pause() { if (toolWebView != null) toolWebView.onPause(); }
    void resume() { if (toolWebView != null) toolWebView.onResume(); }
    void destroy() {
        close();
        audioImportExecutor.shutdownNow();
    }

    private View createToolbar() {
        FrameLayout bar = new FrameLayout(activity);
        bar.setPadding(0, 0, 0, 0);
        bar.setBackgroundColor(toolBackgroundColor);
        bar.setElevation(dp(pageActionBarSpec.shadowElevation));

        ImageButton back = createBackButton();
        back.setContentDescription(UiLanguage.text(activity, "commonBack"));
        back.setOnClickListener(v -> close());
        TextView title = new TextView(activity);
        toolbarTitle = title;
        title.setText(pageTitle);
        title.setTextColor(pageActionBarSpec.titleColor);
        title.setTextSize(pageActionBarSpec.titleSize);
        title.setGravity(Gravity.CENTER);
        // Keep the title at the true toolbar center, regardless of the side button widths.
        FrameLayout.LayoutParams titleParams = new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, dp(pageActionBarSpec.controlHeight), Gravity.CENTER);
        bar.addView(title, titleParams);

        FrameLayout.LayoutParams backParams = new FrameLayout.LayoutParams(
                dp(pageActionBarSpec.iconButtonWidth), dp(pageActionBarSpec.controlHeight), Gravity.START | Gravity.CENTER_VERTICAL);
        backParams.leftMargin = dp(pageActionBarSpec.leftAxis - pageActionBarSpec.iconButtonWidth / 2);
        bar.addView(back, backParams);

        sourceActionButton = createToolbarIconButton(
                com.ingeniousidea.space.R.drawable.ic_source_inactive,
                null);
        sourceActionButton.setContentDescription(UiLanguage.text(activity, "toolGetPageResources"));
        sourceActionButton.setOnClickListener(v -> {
            if (sourceActionActive) {
                if (toolWebView != null) {
                    toolWebView.evaluateJavascript(
                            "window.JetNoteGetSource&&window.JetNoteGetSource.hideResults&&window.JetNoteGetSource.hideResults();",
                            null);
                }
                setSourceActionActive(false);
            } else {
                setSourceActionActive(true);
                runGetScript();
            }
        });
        // Long press remains the compact page refresh shortcut.
        sourceActionButton.setOnLongClickListener(v -> { reloadCurrentPage(); return true; });
        FrameLayout.LayoutParams getParams = new FrameLayout.LayoutParams(
                dp(pageActionBarSpec.iconButtonWidth), dp(pageActionBarSpec.controlHeight), Gravity.END | Gravity.CENTER_VERTICAL);
        getParams.rightMargin = dp(pageActionBarSpec.rightAxis - pageActionBarSpec.iconButtonWidth / 2);
        bar.addView(sourceActionButton, getParams);

        // Same 1px bottom divider used by the HTML .page-action-bar.
        View divider = new View(activity);
        divider.setBackgroundColor(pageActionBarSpec.dividerColor);
        FrameLayout.LayoutParams dividerParams = new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, dp(1), Gravity.BOTTOM);
        bar.addView(divider, dividerParams);

        return bar;
    }

    private ImageButton createBackButton() {
        ImageButton button = new ImageButton(activity);
        button.setImageResource(com.ingeniousidea.space.R.drawable.ic_back_chevron);
        button.setScaleType(android.widget.ImageView.ScaleType.CENTER);
        button.setPadding(0, 0, 0, 0);
        button.setColorFilter(pageActionBarSpec.normalTextColor);
        button.setClickable(true);
        button.setFocusable(true);

        GradientDrawable background = new GradientDrawable();
        background.setColor(toolBackgroundColor);
        background.setCornerRadius(dp(pageActionBarSpec.controlRadius));
        background.setStroke(dp(1), toolBorderColor);
        button.setBackground(background);
        return button;
    }

    private void setSourceActionActive(boolean active) {
        sourceActionActive = active;
        if (sourceActionButton == null) return;
        sourceActionButton.clearColorFilter();
        sourceActionButton.setImageResource(active
                ? com.ingeniousidea.space.R.drawable.ic_source_active
                : com.ingeniousidea.space.R.drawable.ic_source_inactive);
        sourceActionButton.setContentDescription(UiLanguage.text(activity, active ? "toolResourceCaptureActive" : "toolGetPageResources"));
    }

    private ImageButton createToolbarIconButton(int drawableRes, Integer tintColor) {
        ImageButton button = new ImageButton(activity);
        button.setImageResource(drawableRes);
        button.setScaleType(android.widget.ImageView.ScaleType.CENTER_INSIDE);
        button.setPadding(dp(8), dp(6), dp(8), dp(6));
        if (tintColor != null) button.setColorFilter(tintColor);
        button.setClickable(true);
        button.setFocusable(true);

        GradientDrawable background = new GradientDrawable();
        background.setColor(toolBackgroundColor);
        background.setCornerRadius(dp(pageActionBarSpec.controlRadius));
        background.setStroke(dp(1), toolBorderColor);
        button.setBackground(background);
        return button;
    }

    private TextView createToolbarButton(String text, int textColor, boolean outlined) {
        TextView button = new TextView(activity);
        button.setText(text);
        button.setTextColor(textColor);
        button.setGravity(Gravity.CENTER);
        button.setClickable(true);
        button.setFocusable(true);

        GradientDrawable background = new GradientDrawable();
        background.setColor(toolBackgroundColor);
        background.setCornerRadius(dp(pageActionBarSpec.controlRadius));
        background.setStroke(dp(1), toolBorderColor);
        button.setBackground(background);
        return button;
    }

    private TextView createStatusBanner() {
        TextView status = new TextView(activity);
        status.setVisibility(View.GONE);
        status.setGravity(Gravity.CENTER_VERTICAL);
        status.setPadding(dp(14), 0, dp(14), 0);
        status.setTextColor(0xff202124);
        status.setTextSize(14);
        status.setElevation(dp(7));

        GradientDrawable bg = new GradientDrawable();
        bg.setColor(toolBackgroundColor);
        bg.setCornerRadius(dp(14));
        bg.setStroke(dp(1), toolBorderColor);
        status.setBackground(bg);
        return status;
    }

    private View createLoadStatePanel() {
        LinearLayout panel = new LinearLayout(activity);
        panel.setOrientation(LinearLayout.VERTICAL);
        panel.setGravity(Gravity.CENTER);
        panel.setPadding(dp(22), dp(20), dp(22), dp(20));
        panel.setElevation(dp(5));
        GradientDrawable bg = new GradientDrawable();
        bg.setColor(toolBackgroundColor);
        bg.setCornerRadius(dp(18));
        bg.setStroke(dp(1), toolBorderColor);
        panel.setBackground(bg);

        loadStateTitle = new TextView(activity);
        loadStateTitle.setTextSize(16);
        loadStateTitle.setGravity(Gravity.CENTER);
        loadStateTitle.setTextColor(0xff78b88c);
        panel.addView(loadStateTitle, new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT));

        loadSpinner = new ProgressBar(activity);
        LinearLayout.LayoutParams spinnerParams = new LinearLayout.LayoutParams(dp(34), dp(34));
        spinnerParams.topMargin = dp(14);
        panel.addView(loadSpinner, spinnerParams);

        loadStateCode = new TextView(activity);
        loadStateCode.setTextSize(13);
        loadStateCode.setGravity(Gravity.CENTER);
        loadStateCode.setTextColor(0xffb3261e);
        loadStateCode.setTypeface(android.graphics.Typeface.DEFAULT_BOLD);
        LinearLayout.LayoutParams codeParams = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        codeParams.topMargin = dp(10);
        panel.addView(loadStateCode, codeParams);
        return panel;
    }

    private void showLoadingState() {
        pageFailed = false;
        if (toolWebView != null) toolWebView.setVisibility(View.INVISIBLE);
        if (loadStatePanel != null) loadStatePanel.setVisibility(View.VISIBLE);
        if (loadStateTitle != null) {
            loadStateTitle.setText(UiLanguage.text(activity, "commonLoading"));
            loadStateTitle.setTextColor(0xff78b88c);
        }
        if (loadSpinner != null) loadSpinner.setVisibility(View.VISIBLE);
        if (loadStateCode != null) { loadStateCode.setText(""); loadStateCode.setVisibility(View.GONE); }
    }

    private void showLoadFailure(String code) {
        pageFailed = true;
        if (toolWebView != null) { toolWebView.stopLoading(); toolWebView.setVisibility(View.INVISIBLE); }
        if (loadStatePanel != null) loadStatePanel.setVisibility(View.VISIBLE);
        if (loadStateTitle != null) {
            loadStateTitle.setText(UiLanguage.text(activity, "commonLoadFailed"));
            loadStateTitle.setTextColor(0xffb3261e);
        }
        if (loadSpinner != null) loadSpinner.setVisibility(View.GONE);
        if (loadStateCode != null) {
            loadStateCode.setText(code == null || code.isEmpty() ? UiLanguage.text(activity, "commonErrorCodeFallback") : code.toUpperCase(Locale.US));
            loadStateCode.setVisibility(View.VISIBLE);
        }
    }

    private void showLoadedPage() {
        if (pageFailed) return;
        if (loadStatePanel != null) loadStatePanel.setVisibility(View.GONE);
        if (toolWebView != null) toolWebView.setVisibility(View.VISIBLE);
    }

    private void reloadCurrentPage() {
        if (toolWebView == null) return;
        observedAudioUrls.clear();
        setSourceActionActive(false);
        showLoadingState();
        toolWebView.reload();
    }

    private String readAssetText(String assetPath) throws java.io.IOException {
        try (java.io.InputStream input = activity.getAssets().open(assetPath);
             java.io.ByteArrayOutputStream out = new java.io.ByteArrayOutputStream()) {
            byte[] buffer = new byte[4096];
            int read;
            while ((read = input.read(buffer)) != -1) out.write(buffer, 0, read);
            return new String(out.toByteArray(), java.nio.charset.StandardCharsets.UTF_8);
        }
    }

    private String buildGetSourceModulesScript() throws java.io.IOException {
        StringBuilder script = new StringBuilder();
        script.append(readAssetText("get_source/get_source.js")).append('\n');
        script.append(readAssetText("get_source/get_text.js")).append('\n');
        script.append(readAssetText("get_source/get_audio.js")).append('\n');
        script.append(readAssetText("get_source/get_image.js")).append('\n');
        script.append(readAssetText("get_source/get_video.js")).append('\n');
        return script.toString();
    }

    private JSONObject loadGetSourceConfig() {
        try {
            return new JSONObject(readAssetText("get_source/config.json"));
        } catch (Exception ignored) {
            return new JSONObject();
        }
    }

    private String loadGlobalSetBodyColor() {
        try {
            JSONObject config = new JSONObject(RuntimeConfigStore.readEffective(activity));
            String raw = config.optString("global_set_body", "").trim();
            if (!raw.isEmpty()) return raw;
        } catch (Exception ignored) { }
        return cssColor(toolBackgroundColor);
    }

    private void runGetScript() {
        if (toolWebView == null) return;
        try {
            JSONObject sourceStrings = new JSONObject();
            sourceStrings.put("playAudio", UiLanguage.text(activity, "dictionaryPlayAudio"));
            sourceStrings.put("pauseAudio", UiLanguage.text(activity, "dictionaryPauseAudio"));
            sourceStrings.put("previewFailed", UiLanguage.text(activity, "dictionaryPreviewFailed"));
            sourceStrings.put("foundCandidates", UiLanguage.text(activity, "getSourceFoundCandidates"));
            sourceStrings.put("nonMatching", UiLanguage.text(activity, "getSourceNonMatching"));
            sourceStrings.put("noResources", UiLanguage.text(activity, "getSourceNoResources"));
            sourceStrings.put("noMatchingResources", UiLanguage.text(activity, "getSourceNoMatchingResources"));
            sourceStrings.put("getSourceTypeText", UiLanguage.text(activity, "getSourceTypeText"));
            sourceStrings.put("getSourceTypeAudio", UiLanguage.text(activity, "getSourceTypeAudio"));
            sourceStrings.put("getSourceTypeImage", UiLanguage.text(activity, "getSourceTypeImage"));
            sourceStrings.put("getSourceTypeVideo", UiLanguage.text(activity, "getSourceTypeVideo"));
            sourceStrings.put("getSourceRefresh", UiLanguage.text(activity, "getSourceRefresh", "Refresh"));

            JSONObject viewerStrings = new JSONObject();
            viewerStrings.put("switchBackground", UiLanguage.text(activity, "imageViewerSwitchBackground"));
            viewerStrings.put("close", UiLanguage.text(activity, "viewerCloseAccessibilityLabel"));

            JSONObject viewerConfig = new JSONObject(RuntimeConfigStore.readEffective(activity));

            JSONObject iconPaths = new JSONObject();
            iconPaths.put("text", readAssetText("shared/icons/sentences.svg"));
            iconPaths.put("audio", readAssetText("shared/icons/audio.svg"));
            iconPaths.put("image", readAssetText("shared/icons/image.svg"));
            iconPaths.put("video", readAssetText("shared/icons/video.svg"));

            String viewerHtml = readAssetText("app/media/image_viewer.html");
            String viewerCss = readAssetText("get_source/viewer.css");
            String viewerConfigurationJs = readAssetText("app/media/image_viewer/configuration.js");
            String viewerBackgroundControlJs = readAssetText("app/media/image_viewer/background_control.js");
            String viewerCloseControlJs = readAssetText("app/media/image_viewer/close_control.js");
            String viewerJs = readAssetText("app/media/image_viewer.js");
            String languageCatalogJs = readAssetText("shared/core/language_catalog.js");
            String languageJson = readAssetText(UiLanguage.assetPath(activity));
            String modules = buildGetSourceModulesScript();

            String script = "window.JET_NOTE_GET_SOURCE_SHOW_RESULTS=true;\n"
                    + "window.JET_NOTE_BROWSER_MODE=" + (browserMode ? "true" : "false") + ";\n"
                    + "window.JET_NOTE_UI_LANGUAGE=" + JSONObject.quote(pageLanguage) + ";\n"
                    + "window.JET_NOTE_SOURCE_STRINGS=" + sourceStrings.toString() + ";\n"
                    + "window.JET_NOTE_LANGUAGE_DATA=" + languageJson + ";\n"
                    + languageCatalogJs + "\n"
                    + "window.JET_NOTE_VIEWER_STRINGS=" + viewerStrings.toString() + ";\n"
                    + "window.JET_NOTE_VIEWER_CONFIG=" + viewerConfig.toString() + ";\n"
                    + "window.JET_NOTE_GET_SOURCE_CONFIG=" + loadGetSourceConfig().toString() + ";\n"
                    + "window.JET_NOTE_GET_SOURCE_EXTENSION_FILTER=" + getSourceExtensionFilterJson + ";\n"
                    + "window.JET_NOTE_GET_SOURCE_BODY_COLOR=" + JSONObject.quote(loadGlobalSetBodyColor()) + ";\n"
                    + "window.JET_NOTE_PLAY_ICON_SVG=" + JSONObject.quote(readAssetText("shared/icons/play.svg")) + ";\n"
                    + "window.JET_NOTE_PAUSE_ICON_SVG=" + JSONObject.quote(readAssetText("shared/icons/pause.svg")) + ";\n"
                    + "window.JET_NOTE_SOURCE_ICONS=" + iconPaths.toString() + ";\n"
                    + "window.JET_NOTE_NATIVE_AUDIO_URLS=" + new JSONArray(observedAudioUrls).toString() + ";\n"
                    + "window.JET_NOTE_VIEWER_HTML=" + JSONObject.quote(viewerHtml) + ";\n"
                    + "window.JET_NOTE_VIEWER_CSS=" + JSONObject.quote(viewerCss) + ";\n"
                    + modules
                    + "(window.JET_NOTE_NATIVE_AUDIO_URLS||[]).forEach(function(url){window.JetNoteGetSource&&window.JetNoteGetSource.addCandidate(url,'audio');});\n"
                    + "if(!document.getElementById('imageViewer')){const h=document.createElement('div');h.innerHTML=window.JET_NOTE_VIEWER_HTML||'';while(h.firstChild)document.body.appendChild(h.firstChild);const st=document.createElement('style');st.textContent=window.JET_NOTE_VIEWER_CSS||'';document.head.appendChild(st);}\n"
                    + "if(typeof window.openImageViewer!=='function'){ {" + viewerConfigurationJs + "\n" + viewerBackgroundControlJs + "\n" + viewerCloseControlJs + "\n" + viewerJs
                    + "\nwindow.openImageViewer=openImageViewer;window.openVideoViewer=openVideoViewer;window.closeImageViewer=closeImageViewer;} }\n"
                    + "window.JetNoteGetSource&&window.JetNoteGetSource.showResults();";
            toolWebView.evaluateJavascript(script, null);
        } catch (java.io.IOException | JSONException error) {
            showToolStatus(loadLanguageText("getSourceModuleLoadFailed", "getSourceModuleLoadFailed"), false);
        }
    }

    private void injectSourceObserver() {
        if (toolWebView == null) return;
        try {
            String script = "window.JET_NOTE_GET_SOURCE_SHOW_RESULTS=false;\n"
                    + "window.JET_NOTE_GET_SOURCE_CONFIG=" + loadGetSourceConfig().toString() + ";\n"
                    + "window.JET_NOTE_GET_SOURCE_EXTENSION_FILTER=" + getSourceExtensionFilterJson + ";\n"
                    + "window.JET_NOTE_GET_SOURCE_BODY_COLOR=" + JSONObject.quote(loadGlobalSetBodyColor()) + ";\n"
                    + "window.JET_NOTE_NATIVE_AUDIO_URLS=" + new JSONArray(observedAudioUrls).toString() + ";\n"
                    + buildGetSourceModulesScript();
            toolWebView.evaluateJavascript(script, null);
        } catch (java.io.IOException error) {
            showToolStatus(loadLanguageText("getSourceObserverLoadFailed", "getSourceObserverLoadFailed"), false);
        }
    }

    private String loadLanguageText(String key, String fallback) {
        return UiLanguage.text(activity, key, fallback);
    }

    private int parseColor(String value, int fallback) {
        if (value == null) return fallback;
        String normalized = value.trim();
        Matcher cssRgb = CSS_RGB_COLOR.matcher(normalized);
        if (cssRgb.matches()) {
            try {
                int red = Integer.parseInt(cssRgb.group(1));
                int green = Integer.parseInt(cssRgb.group(2));
                int blue = Integer.parseInt(cssRgb.group(3));
                if (red <= 255 && green <= 255 && blue <= 255) {
                    return Color.rgb(red, green, blue);
                }
            } catch (NumberFormatException ignored) { }
            return fallback;
        }
        try { return Color.parseColor(normalized); }
        catch (Exception ignored) { return fallback; }
    }

    private String cssColor(int color) {
        return String.format(Locale.US, "#%02X%02X%02X", Color.red(color), Color.green(color), Color.blue(color));
    }

    /** Keep native Tool 1 / Tool 2 surfaces visually attached to the editor that launched them. */
    private void injectToolBackground() {
        if (toolWebView == null) return;
        String color = cssColor(toolBackgroundColor);
        String script = "(() => {"
                + "let style=document.getElementById('jet-note-tool-background-style');"
                + "if(!style){style=document.createElement('style');style.id='jet-note-tool-background-style';document.documentElement.appendChild(style);}"
                + "style.textContent='html,body{background:" + color + " !important;}';"
                + "})();";
        toolWebView.evaluateJavascript(script, null);
    }

    private boolean tryFallback(WebView webView) {
        if (fallbackAttempted || fallbackPageUrl == null || fallbackPageUrl.isEmpty()) return false;
        fallbackAttempted = true;
        pageUrl = fallbackPageUrl;
        pageTitle = fallbackPageTitle == null || fallbackPageTitle.isEmpty() ? pageTitle : fallbackPageTitle;
        if (toolbarTitle != null) toolbarTitle.setText(pageTitle);
        showLoadingState();
        webView.stopLoading();
        webView.loadUrl(pageUrl);
        return true;
    }

    private void failCurrentPage(String code) {
        if (!browserMode) {
            activity.runOnUiThread(() -> mainWebView.evaluateJavascript(
                    "if(window.EditorController&&window.EditorController.resume){window.EditorController.resume();}", null));
        }
        showLoadFailure(code);
    }

    private void configure(WebView view) {
        WebSettings settings = view.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setMediaPlaybackRequiresUserGesture(true);
        settings.setSupportZoom(false);
        settings.setBuiltInZoomControls(false);
        settings.setDisplayZoomControls(false);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            settings.setForceDark(WebSettings.FORCE_DARK_OFF);
        }

        view.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onJsAlert(WebView webView, String url, String message, JsResult result) {
                showToolStatus(message == null ? UiLanguage.text(activity, "commonNotice") : message, false);
                result.confirm();
                return true;
            }
        });
        view.setWebViewClient(new WebViewClient() {
            @Override
            public void onLoadResource(WebView webView, String url) {
                rememberPossibleAudioUrl(url);
            }

            @Override
            public void onPageStarted(WebView webView, String url, android.graphics.Bitmap favicon) {
                showLoadingState();
            }

            @Override
            public void onPageFinished(WebView webView, String url) {
                injectToolBackground();
                showLoadedPage();
                injectSourceObserver();
            }

            @Override
            public void onReceivedError(WebView webView, WebResourceRequest request, android.webkit.WebResourceError error) {
                if (request != null && request.isForMainFrame()) {
                    int code = Build.VERSION.SDK_INT >= 23 ? error.getErrorCode() : -1;
                    if (!tryFallback(webView)) failCurrentPage("ERROR CODE: " + code);
                }
            }

            @SuppressWarnings("deprecation")
            @Override
            public void onReceivedError(WebView webView, int errorCode, String description, String failingUrl) {
                if (!tryFallback(webView)) failCurrentPage("ERROR CODE: " + errorCode);
            }

            @Override
            public void onReceivedHttpError(WebView webView, WebResourceRequest request, android.webkit.WebResourceResponse response) {
                if (request != null && request.isForMainFrame()) {
                    if (!tryFallback(webView)) failCurrentPage("HTTP ERROR: " + response.getStatusCode());
                }
            }

            @Override
            public void onReceivedSslError(WebView webView, SslErrorHandler handler, SslError error) {
                handler.cancel();
                if (!tryFallback(webView)) failCurrentPage("SSL ERROR: " + error.getPrimaryError());
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView webView, WebResourceRequest request) {
                Uri uri = request.getUrl();
                if (handleSourceStateScheme(uri)) return true;
                if (handleSaveScheme(uri)) return true;
                if (handleAddScheme(uri)) return true;
                if(mimeFromUrl(uri.toString()).startsWith("audio/")){addAudioSourceToPost(uri.toString(),null,null,mimeFromUrl(uri.toString()));return true;}
                return !"https".equalsIgnoreCase(uri.getScheme());
            }

            @SuppressWarnings("deprecation")
            @Override
            public boolean shouldOverrideUrlLoading(WebView webView, String url) {
                Uri uri = Uri.parse(url);
                if (handleSourceStateScheme(uri)) return true;
                if (handleSaveScheme(uri)) return true;
                if (handleAddScheme(uri)) return true;
                if(mimeFromUrl(uri.toString()).startsWith("audio/")){addAudioSourceToPost(uri.toString(),null,null,mimeFromUrl(uri.toString()));return true;}
                return !"https".equalsIgnoreCase(uri.getScheme());
            }
        });

        DownloadListener listener = (url, userAgent, contentDisposition, mimeType, contentLength) ->
                addAudioSourceToPost(url, userAgent, contentDisposition, mimeType);
        view.setDownloadListener(listener);
    }

    private boolean handleSourceStateScheme(Uri uri) {
        if (uri == null || !SOURCE_STATE_SCHEME.equalsIgnoreCase(uri.getScheme())) return false;
        String host = uri.getHost();
        setSourceActionActive(!"inactive".equalsIgnoreCase(host));
        return true;
    }

    private boolean handleSaveScheme(Uri uri) {
        if (uri == null || !SAVE_SCHEME.equalsIgnoreCase(uri.getScheme())) return false;
        String raw = uri.getQueryParameter("url");
        if (raw == null || !raw.startsWith("https://")) {
            MediaDownloadController.saveUrl(activity, null, null, null, null);
            return true;
        }
        String userAgent = toolWebView == null ? null : toolWebView.getSettings().getUserAgentString();
        String cookie = CookieManager.getInstance().getCookie(raw);
        String referer = toolWebView == null ? null : toolWebView.getUrl();
        MediaDownloadController.saveUrl(activity, raw, userAgent, cookie, referer);
        return true;
    }

    private boolean handleAddScheme(Uri uri) {
        if (uri == null || !ADD_SCHEME.equalsIgnoreCase(uri.getScheme())) return false;
        // Browser Mode is deliberately read-only with respect to the New Post
        // attachment flow. Consume the scheme so it cannot escape the WebView,
        // but do not create/import an attachment.
        if (browserMode) return true;
        String raw = uri.getQueryParameter("url");
        if (raw == null || raw.isEmpty()) {
            showToolStatus(UiLanguage.text(activity, "toolNoUsableAudioUrl"), false);
            return true;
        }
        addAudioSourceToPost(raw, null, null, mimeFromUrl(raw));
        return true;
    }

    private void rememberPossibleAudioUrl(String rawUrl) {
        if (rawUrl == null || !rawUrl.startsWith("https://")) return;
        String normalized = rawUrl.toLowerCase(Locale.ROOT);
        if (mimeFromUrl(normalized).startsWith("audio/")
                || normalized.contains("audio") || normalized.contains("sound")
                || normalized.contains("pronun") || normalized.contains("speech")
                || normalized.contains("voice") || normalized.contains("/media/")) {
            if (observedAudioUrls.size() < 80) observedAudioUrls.add(rawUrl);
        }
    }

    private void addAudioSourceToPost(String url, String userAgent, String disposition, String mime) {
        if (url == null || !url.startsWith("https://")) {
            showToolStatus(UiLanguage.text(activity, "toolUnsupportedAudioSourceUrl"), false);
            return;
        }

        final String resolvedMime = mime == null || mime.isEmpty() ? mimeFromUrl(url) : mime;
        final String guessedName = safeDownloadName(URLUtil.guessFileName(url, disposition, resolvedMime));
        final String requestUserAgent = (userAgent == null || userAgent.isEmpty())
                ? (toolWebView == null ? null : toolWebView.getSettings().getUserAgentString())
                : userAgent;
        final String requestCookie = CookieManager.getInstance().getCookie(url);
        final String requestReferer = toolWebView == null ? null : toolWebView.getUrl();
        showToolStatus(UiLanguage.text(activity, "toolAddingAudioToPost"), true);

        audioImportExecutor.execute(() -> {
            HttpURLConnection connection = null;
            try {
                connection = (HttpURLConnection) new URL(url).openConnection();
                connection.setInstanceFollowRedirects(true);
                connection.setConnectTimeout(15000);
                connection.setReadTimeout(30000);
                connection.setRequestProperty("Accept", "audio/*,*/*;q=0.8");

                if (requestUserAgent != null && !requestUserAgent.isEmpty()) {
                    connection.setRequestProperty("User-Agent", requestUserAgent);
                }
                if (requestCookie != null && !requestCookie.isEmpty()) {
                    connection.setRequestProperty("Cookie", requestCookie);
                }
                if (requestReferer != null && !requestReferer.isEmpty()) {
                    connection.setRequestProperty("Referer", requestReferer);
                }

                int code = connection.getResponseCode();
                if (code < 200 || code >= 300) throw new java.io.IOException("HTTP " + code);

                String responseMime = connection.getContentType();
                if (responseMime != null) {
                    int semicolon = responseMime.indexOf(';');
                    if (semicolon >= 0) responseMime = responseMime.substring(0, semicolon);
                    responseMime = responseMime.trim();
                }
                if (responseMime == null || responseMime.isEmpty()
                        || "application/octet-stream".equalsIgnoreCase(responseMime)) {
                    responseMime = resolvedMime;
                }
                if (responseMime == null || !responseMime.toLowerCase(Locale.ROOT).startsWith("audio/")) {
                    String fromUrl = mimeFromUrl(connection.getURL().toString());
                    if (fromUrl.startsWith("audio/")) responseMime = fromUrl;
                }
                if (responseMime == null || !responseMime.toLowerCase(Locale.ROOT).startsWith("audio/")) {
                    throw new java.io.IOException("Selected resource is not recognized as audio");
                }

                String responseDisposition = connection.getHeaderField("Content-Disposition");
                String finalName = safeDownloadName(URLUtil.guessFileName(
                        connection.getURL().toString(),
                        responseDisposition == null ? disposition : responseDisposition,
                        responseMime
                ));
                if (finalName == null || finalName.trim().isEmpty()) finalName = guessedName;

                JSONObject metadata;
                try (InputStream input = new BufferedInputStream(connection.getInputStream())) {
                    metadata = attachmentStore.importFromStream(
                            input, responseMime, finalName, "audio", 64L * 1024L * 1024L
                    );
                }

                final JSONObject addedMetadata = metadata;
                final String promptName = finalName;
                activity.runOnUiThread(() -> mainWebView.evaluateJavascript(
                        "(window.addToolAudioToPost ? window.addToolAudioToPost("
                                + addedMetadata.toString() + ") : 'missing-handler')",
                        result -> {
                            if ("\"added\"".equals(result) || "\"duplicate\"".equals(result)) {
                                showToolStatus(UiLanguage.format(activity, "toolAudioAddedToPost", "fileName", promptName), true);
                            } else {
                                String path = addedMetadata.optString("path", "");
                                if (!path.isEmpty()) attachmentStore.deleteArchivePath(path);
                                showToolStatus(UiLanguage.text(activity, "toolAudioAddFailed"), false);
                            }
                        }
                ));
            } catch (Exception error) {
                showToolStatus(
                        "Unable to add audio to post: "
                                + (error.getMessage() == null ? "download failed" : error.getMessage()),
                        false
                );
            } finally {
                if (connection != null) connection.disconnect();
            }
        });
    }

    private void showToolStatus(String text, boolean success) {
        activity.runOnUiThread(() -> Toast.makeText(activity, text, Toast.LENGTH_SHORT).show());
    }

    private static String mimeFromUrl(String url) {
        String lower = url == null ? "" : url.toLowerCase(Locale.ROOT);
        int query = lower.indexOf('?');
        if (query >= 0) lower = lower.substring(0, query);
        if (lower.endsWith(".mp3")) return "audio/mpeg";
        if (lower.endsWith(".wav")) return "audio/wav";
        if (lower.endsWith(".ogg")) return "audio/ogg";
        if (lower.endsWith(".m4a")) return "audio/mp4";
        return "application/octet-stream";
    }

    private static String safeDownloadName(String raw) {
        String name = raw == null ? "audio.mp3" : raw.trim();
        if (name.isEmpty()) name = "audio.mp3";
        name = name.replaceAll("[\\\\/:*?\"<>|\\p{Cntrl}]", "_");
        if (name.length() > 160) name = name.substring(name.length() - 160);
        return name;
    }

    private int dp(int value) {
        return Math.round(value * activity.getResources().getDisplayMetrics().density);
    }
}
