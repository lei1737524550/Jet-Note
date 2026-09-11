package com.ingeniousidea.space;

import android.app.Activity;
import android.app.DownloadManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.SharedPreferences;
import android.content.res.ColorStateList;
import android.database.Cursor;
import android.graphics.Color;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.net.http.SslError;
import android.os.Build;
import android.os.Environment;
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
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.ImageButton;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.TextView;
import android.widget.Toast;

import java.util.HashMap;
import java.io.File;
import java.util.LinkedHashSet;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

import org.json.JSONArray;
import org.json.JSONObject;

/** Hosts Jet Note web tools in an isolated WebView with audio discovery and downloads. */
final class DictionaryController {
    private static final String DOWNLOAD_SCHEME = "jetnote-download";
    private static final int TOOLBAR_HEIGHT_DP = 50;
    private static final String CACHE_PREFERENCES = "jet_note_web_cache";
    private static final String CACHE_CLEAR_ON_CLOSE = "clear_on_tool_close";
    private static final String CACHE_LIMIT_MB = "limit_mb";
    private static final int DEFAULT_CACHE_LIMIT_MB = 50;

    /*
     * Keeps the original resource-discovery logic, but routes result taps back to native code.
     * This avoids WebView's unreliable built-in media "Download" action and gives Jet Note
     * explicit start/completion feedback through Android DownloadManager.
     */
    private final Activity activity;
    private final AudioSaveController audioSaver;
    private final FrameLayout root;
    private final SharedPreferences cachePreferences;
    private final Map<Long, String> activeDownloads = new HashMap<>();
    private final Set<String> observedAudioUrls = new LinkedHashSet<>();
    private final BroadcastReceiver downloadReceiver = new BroadcastReceiver() {
        @Override
        public void onReceive(Context context, Intent intent) {
            if (!DownloadManager.ACTION_DOWNLOAD_COMPLETE.equals(intent.getAction())) return;
            long id = intent.getLongExtra(DownloadManager.EXTRA_DOWNLOAD_ID, -1L);
            String fileName = activeDownloads.remove(id);
            if (fileName == null) return;
            reportDownloadResult(id, fileName);
        }
    };

    private FrameLayout overlay;
    private WebView dictionaryWebView;
    private View toolbar;
    private TextView downloadStatus;
    private View loadStatePanel;
    private TextView loadStateTitle;
    private TextView loadStateCode;
    private ProgressBar loadSpinner;
    private boolean pageFailed;
    private boolean receiverRegistered;
    private String pageUrl="https://www.merriam-webster.com/";
    private String pageTitle="Dictionary";
    private String pageLanguage="zh";
    private final Runnable hideStatusRunnable = () -> {
        if (downloadStatus != null) downloadStatus.setVisibility(View.GONE);
    };

    DictionaryController(Activity activity, FrameLayout root) {
        this.activity = activity;
        this.audioSaver=new AudioSaveController(activity);
        this.root = root;
        this.cachePreferences = activity.getSharedPreferences(CACHE_PREFERENCES, Context.MODE_PRIVATE);
    }

    void open(String url, String title, String language) {
        activity.runOnUiThread(() -> {
            if (overlay != null && url.equals(pageUrl)) return;
            if (overlay != null) close();
            pageUrl = url;
            pageTitle = title;
            pageLanguage = "en".equalsIgnoreCase(language) ? "en" : "zh";
            observedAudioUrls.clear();
            openOnUiThread();
        });
    }

    private void openOnUiThread() {
        if (overlay != null) return;

        overlay = new FrameLayout(activity);
        overlay.setBackgroundColor(Color.WHITE);
        root.addView(overlay, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));

        dictionaryWebView = new WebView(activity);
        dictionaryWebView.setBackgroundColor(Color.WHITE);
        configure(dictionaryWebView);
        FrameLayout.LayoutParams webParams = new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT);
        webParams.topMargin = dp(TOOLBAR_HEIGHT_DP);
        overlay.addView(dictionaryWebView, webParams);

        toolbar = createToolbar();
        FrameLayout.LayoutParams toolbarParams = new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, dp(TOOLBAR_HEIGHT_DP), Gravity.TOP);
        overlay.addView(toolbar, toolbarParams);

        downloadStatus = createStatusBanner();
        FrameLayout.LayoutParams statusParams = new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT, dp(42), Gravity.BOTTOM | Gravity.CENTER_HORIZONTAL);
        statusParams.leftMargin = dp(16);
        statusParams.rightMargin = dp(16);
        statusParams.bottomMargin = dp(16);
        overlay.addView(downloadStatus, statusParams);

        loadStatePanel = createLoadStatePanel();
        FrameLayout.LayoutParams stateParams = new FrameLayout.LayoutParams(
                dp(250), ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.CENTER);
        stateParams.topMargin = dp(TOOLBAR_HEIGHT_DP / 2);
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

                FrameLayout.LayoutParams wp = (FrameLayout.LayoutParams) dictionaryWebView.getLayoutParams();
                wp.topMargin = top + dp(TOOLBAR_HEIGHT_DP);
                wp.leftMargin = left;
                wp.rightMargin = right;
                dictionaryWebView.setLayoutParams(wp);

                FrameLayout.LayoutParams sp = (FrameLayout.LayoutParams) downloadStatus.getLayoutParams();
                sp.bottomMargin = bottom + dp(16);
                sp.leftMargin = left + dp(16);
                sp.rightMargin = right + dp(16);
                downloadStatus.setLayoutParams(sp);
                return insets;
            });
            overlay.requestApplyInsets();
        }

        dictionaryWebView.loadUrl(pageUrl);
    }

    boolean isOpen() {
        return overlay != null;
    }

    void handleBack() {
        if (dictionaryWebView != null && dictionaryWebView.canGoBack()) dictionaryWebView.goBack();
        else close();
    }

    void close() {
        if (overlay == null) return;
        applyCachePolicyOnToolClose();
        root.removeView(overlay);
        if (downloadStatus != null) downloadStatus.removeCallbacks(hideStatusRunnable);
        if (dictionaryWebView != null) {
            dictionaryWebView.stopLoading();
            dictionaryWebView.setDownloadListener(null);
            dictionaryWebView.setWebChromeClient(null);
            dictionaryWebView.setWebViewClient(null);
            dictionaryWebView.destroy();
        }
        dictionaryWebView = null;
        toolbar = null;
        downloadStatus = null;
        overlay = null;
        loadStatePanel=null;
        loadStateTitle=null;
        loadStateCode=null;
        loadSpinner=null;
        observedAudioUrls.clear();
    }

    /** Returns only disposable WebView cache usage; Jet Note media stays in files/jetnote-media. */
    String getWebCacheSettings() {
        try {
            JSONObject result = new JSONObject();
            result.put("bytes", webCacheBytes());
            result.put("clearOnClose", cachePreferences.getBoolean(CACHE_CLEAR_ON_CLOSE, false));
            result.put("limitMb", cachePreferences.getInt(CACHE_LIMIT_MB, DEFAULT_CACHE_LIMIT_MB));
            return result.toString();
        } catch (Exception ignored) {
            return "{\"bytes\":0,\"clearOnClose\":false,\"limitMb\":50}";
        }
    }

    void setWebCacheClosePolicy(boolean clearOnClose) {
        cachePreferences.edit().putBoolean(CACHE_CLEAR_ON_CLOSE, clearOnClose).apply();
    }

    void setWebCacheLimitMb(int limitMb) {
        int safeLimit = limitMb == 200 ? 200 : DEFAULT_CACHE_LIMIT_MB;
        cachePreferences.edit().putInt(CACHE_LIMIT_MB, safeLimit).apply();
    }

    /** Clears HTTP/WebView cache only. Cookies, posts, attachments and local backup data are retained. */
    void clearWebCache() {
        activity.runOnUiThread(this::clearWebCacheOnUiThread);
    }

    /** Runs the selected capacity rule immediately and returns whether clearing was requested. */
    boolean manageWebCacheNow() {
        long limitBytes = (long) cachePreferences.getInt(CACHE_LIMIT_MB, DEFAULT_CACHE_LIMIT_MB)
                * 1024L * 1024L;
        if (webCacheBytes() < limitBytes) return false;
        clearWebCache();
        return true;
    }

    private void applyCachePolicyOnToolClose() {
        if (cachePreferences.getBoolean(CACHE_CLEAR_ON_CLOSE, false)) {
            clearWebCacheOnUiThread();
            return;
        }
        manageWebCacheNow();
    }

    private void clearWebCacheOnUiThread() {
        WebView target = dictionaryWebView;
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

    boolean handles(int code){return audioSaver.handles(code);}
    void onActivityResult(int code,int result,Intent data){audioSaver.onActivityResult(code,result,data);}
    void pause(){if(dictionaryWebView!=null)dictionaryWebView.onPause();}
    void resume(){if(dictionaryWebView!=null)dictionaryWebView.onResume();}
    void destroy() {
        audioSaver.destroy();
        close();
        unregisterDownloadReceiver();
        activeDownloads.clear();
    }

    private View createToolbar() {
        FrameLayout bar = new FrameLayout(activity);
        bar.setPadding(dp(8), dp(5), dp(8), dp(5));
        bar.setBackgroundColor(0xfff8f9fa);
        bar.setElevation(dp(3));

        ImageButton back = createBackButton();
        back.setContentDescription("en".equals(pageLanguage) ? "Back" : "返回");
        back.setOnClickListener(v -> {
            if (dictionaryWebView != null && dictionaryWebView.canGoBack()) dictionaryWebView.goBack();
            else close();
        });
        TextView title = new TextView(activity);
        title.setText(pageTitle);
        title.setTextColor(0xff202124);
        title.setTextSize(16);
        title.setGravity(Gravity.CENTER);
        // Keep the title at the true toolbar center, regardless of the side button widths.
        FrameLayout.LayoutParams titleParams = new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, dp(36), Gravity.CENTER);
        bar.addView(title, titleParams);

        FrameLayout.LayoutParams backParams = new FrameLayout.LayoutParams(
                dp(40), dp(36), Gravity.START | Gravity.CENTER_VERTICAL);
        bar.addView(back, backParams);

        TextView get = createToolbarButton("en".equals(pageLanguage) ? "Get Audio" : "获取音频", 0xff168a45, true);
        get.setTextSize(14);
        get.setContentDescription("en".equals(pageLanguage) ? "Get page audio" : "获取页面音频");
        get.setOnClickListener(v -> runGetScript());
        // Long press is a compact refresh shortcut; it no longer creates an in-page button.
        get.setOnLongClickListener(v -> { reloadCurrentPage(); return true; });
        FrameLayout.LayoutParams getParams = new FrameLayout.LayoutParams(
                dp(88), dp(36), Gravity.END | Gravity.CENTER_VERTICAL);
        bar.addView(get, getParams);

        return bar;
    }

    private ImageButton createBackButton() {
        ImageButton button = new ImageButton(activity);
        button.setImageResource(com.ingeniousidea.space.R.drawable.ic_back_chevron);
        button.setScaleType(android.widget.ImageView.ScaleType.CENTER);
        button.setPadding(0, 0, 0, 0);
        button.setColorFilter(0xff222222);
        button.setClickable(true);
        button.setFocusable(true);

        GradientDrawable background = new GradientDrawable();
        background.setColor(Color.WHITE);
        background.setCornerRadius(dp(12));
        background.setStroke(dp(1), 0xffd6d8dc);
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
        background.setColor(Color.WHITE);
        background.setCornerRadius(dp(12));
        if (outlined) background.setStroke(dp(1), 0xffc8cbd0);
        else background.setStroke(dp(1), 0xffd6d8dc);
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
        bg.setColor(0xfff8f9fa);
        bg.setCornerRadius(dp(14));
        bg.setStroke(dp(1), 0xffd7d9dd);
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
        bg.setColor(0xfffbfdfb);
        bg.setCornerRadius(dp(18));
        bg.setStroke(dp(1), 0xffd7e1d8);
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
        if (dictionaryWebView != null) dictionaryWebView.setVisibility(View.INVISIBLE);
        if (loadStatePanel != null) loadStatePanel.setVisibility(View.VISIBLE);
        if (loadStateTitle != null) {
            loadStateTitle.setText("en".equals(pageLanguage) ? "Loading…" : "正在加载中");
            loadStateTitle.setTextColor(0xff78b88c);
        }
        if (loadSpinner != null) loadSpinner.setVisibility(View.VISIBLE);
        if (loadStateCode != null) { loadStateCode.setText(""); loadStateCode.setVisibility(View.GONE); }
    }

    private void showLoadFailure(String code) {
        pageFailed = true;
        if (dictionaryWebView != null) { dictionaryWebView.stopLoading(); dictionaryWebView.setVisibility(View.INVISIBLE); }
        if (loadStatePanel != null) loadStatePanel.setVisibility(View.VISIBLE);
        if (loadStateTitle != null) {
            loadStateTitle.setText("en".equals(pageLanguage) ? "Load failed" : "加载失败");
            loadStateTitle.setTextColor(0xffb3261e);
        }
        if (loadSpinner != null) loadSpinner.setVisibility(View.GONE);
        if (loadStateCode != null) {
            loadStateCode.setText(code == null || code.isEmpty() ? "ERROR" : code.toUpperCase(Locale.US));
            loadStateCode.setVisibility(View.VISIBLE);
        }
    }

    private void showLoadedPage() {
        if (pageFailed) return;
        if (loadStatePanel != null) loadStatePanel.setVisibility(View.GONE);
        if (dictionaryWebView != null) dictionaryWebView.setVisibility(View.VISIBLE);
    }

    private void reloadCurrentPage() {
        if (dictionaryWebView == null) return;
        observedAudioUrls.clear();
        showLoadingState();
        dictionaryWebView.reload();
    }

    private void runGetScript() {
        if (dictionaryWebView == null) return;
        try(java.io.InputStream input=activity.getAssets().open("js/dictionary-get.js");java.io.ByteArrayOutputStream out=new java.io.ByteArrayOutputStream()){
            byte[] buffer=new byte[4096];int n;while((n=input.read(buffer))!=-1)out.write(buffer,0,n);
            String script = "window.JET_NOTE_UI_LANGUAGE='" + pageLanguage + "';\n"
                    + "window.JET_NOTE_NATIVE_AUDIO_URLS=" + new JSONArray(observedAudioUrls).toString() + ";\n"
                    + new String(out.toByteArray(),java.nio.charset.StandardCharsets.UTF_8);
            dictionaryWebView.evaluateJavascript(script,null);
        }catch(java.io.IOException e){showDownloadStatus("无法加载 Get 脚本",false);}
    }

    private void injectAudioObserver() {
        if (dictionaryWebView == null) return;
        String script = "(() => {"
                + "if (window.__jetNoteAudioObserverInstalled) return;"
                + "window.__jetNoteAudioObserverInstalled = true;"
                + "const audio = new Set(Array.isArray(window.JET_NOTE_CAPTURED_AUDIO_URLS) ? window.JET_NOTE_CAPTURED_AUDIO_URLS : []);"
                + "const candidates = new Set(Array.isArray(window.JET_NOTE_CAPTURED_CANDIDATE_URLS) ? window.JET_NOTE_CAPTURED_CANDIDATE_URLS : []);"
                + "const audioHint = /(?:\\.(?:mp3|m4a|aac|wav|ogg|opus|flac)(?:[?#]|$)|audio|sound|pronun|speech|voice|tts|\\/media\\/)/i;"
                + "const normalize = value => { try { const url = new URL(String(value || ''), location.href); return url.protocol === 'https:' ? url.href : null; } catch (_) { return null; } };"
                + "const persist = () => { window.JET_NOTE_CAPTURED_AUDIO_URLS = [...audio]; window.JET_NOTE_CAPTURED_CANDIDATE_URLS = [...candidates]; };"
                + "const addCandidate = value => { const url = normalize(value); if (url && audioHint.test(url)) { candidates.add(url); persist(); } };"
                + "const media = event => { const node = event.target; if (!node || (node.tagName !== 'AUDIO' && node.tagName !== 'VIDEO')) return; const url = normalize(node.currentSrc || node.src); if (url) { audio.add(url); candidates.add(url); persist(); } };"
                + "document.addEventListener('loadstart', media, true); document.addEventListener('play', media, true);"
                + "const oldFetch = window.fetch; if (oldFetch) window.fetch = function(input, init) { addCandidate(input && (input.url || input)); return oldFetch.call(this, input, init); };"
                + "const oldOpen = XMLHttpRequest.prototype.open; XMLHttpRequest.prototype.open = function(method, url) { addCandidate(url); return oldOpen.apply(this, arguments); };"
                + "try { new PerformanceObserver(list => list.getEntries().forEach(entry => addCandidate(entry.name))).observe({type:'resource', buffered:true}); } catch (_) {}"
                + "})();";
        dictionaryWebView.evaluateJavascript(script, null);
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
                showDownloadStatus(message == null ? "提示" : message, false);
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
                showLoadedPage();
                injectAudioObserver();
            }

            @Override
            public void onReceivedError(WebView webView, WebResourceRequest request, android.webkit.WebResourceError error) {
                if (request != null && request.isForMainFrame()) {
                    int code = Build.VERSION.SDK_INT >= 23 ? error.getErrorCode() : -1;
                    showLoadFailure("ERROR CODE: " + code);
                }
            }

            @SuppressWarnings("deprecation")
            @Override
            public void onReceivedError(WebView webView, int errorCode, String description, String failingUrl) {
                showLoadFailure("ERROR CODE: " + errorCode);
            }

            @Override
            public void onReceivedHttpError(WebView webView, WebResourceRequest request, android.webkit.WebResourceResponse response) {
                if (request != null && request.isForMainFrame()) {
                    showLoadFailure("HTTP ERROR: " + response.getStatusCode());
                }
            }

            @Override
            public void onReceivedSslError(WebView webView, SslErrorHandler handler, SslError error) {
                showLoadFailure("SSL ERROR: " + error.getPrimaryError());
                handler.cancel();
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView webView, WebResourceRequest request) {
                Uri uri = request.getUrl();
                if (handleDownloadScheme(uri)) return true;
                if(mimeFromUrl(uri.toString()).startsWith("audio/")){offerDownload(uri.toString(),null,null,mimeFromUrl(uri.toString()));return true;}
                return !"https".equalsIgnoreCase(uri.getScheme());
            }

            @SuppressWarnings("deprecation")
            @Override
            public boolean shouldOverrideUrlLoading(WebView webView, String url) {
                Uri uri = Uri.parse(url);
                if (handleDownloadScheme(uri)) return true;
                if(mimeFromUrl(uri.toString()).startsWith("audio/")){offerDownload(uri.toString(),null,null,mimeFromUrl(uri.toString()));return true;}
                return !"https".equalsIgnoreCase(uri.getScheme());
            }
        });

        DownloadListener listener = (url, userAgent, contentDisposition, mimeType, contentLength) ->
                offerDownload(url, userAgent, contentDisposition, mimeType);
        view.setDownloadListener(listener);
    }

    private boolean handleDownloadScheme(Uri uri) {
        if (uri == null || !DOWNLOAD_SCHEME.equalsIgnoreCase(uri.getScheme())) return false;
        String raw = uri.getQueryParameter("url");
        if (raw == null || raw.isEmpty()) {
            showDownloadStatus("没有找到可下载的音频地址", false);
            return true;
        }
        offerDownload(raw, null, null, mimeFromUrl(raw));
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

    private void offerDownload(String url,String userAgent,String disposition,String mime) {
        if(url==null||!url.startsWith("https://")){showDownloadStatus("不支持的音频地址",false);return;}
        final String resolved=mime==null||mime.isEmpty()?mimeFromUrl(url):mime;
        final String name=safeDownloadName(URLUtil.guessFileName(url,disposition,resolved));
        new android.app.AlertDialog.Builder(activity).setTitle("保存音频")
            .setItems(new String[]{"下载到 Downloads（系统通知）","另存为…（选择位置）"},(dialog,which)->{
                if(which==0)startDownload(url,userAgent,disposition,resolved);
                else audioSaver.choose(url,dictionaryWebView,name,resolved);
            }).setNegativeButton("取消",null).show();
    }

    private void startDownload(String url, String userAgent, String contentDisposition, String mimeType) {
        Uri uri;
        try {
            uri = Uri.parse(url);
        } catch (RuntimeException e) {
            showDownloadStatus("下载失败：音频地址无效", false);
            return;
        }
        String scheme = uri.getScheme();
        if (!"https".equalsIgnoreCase(scheme)) {
            showDownloadStatus("下载失败：不支持的地址", false);
            return;
        }

        String resolvedMime = mimeType;
        if (resolvedMime == null || resolvedMime.trim().isEmpty() || "application/octet-stream".equals(resolvedMime)) {
            resolvedMime = mimeFromUrl(url);
        }
        String fileName = safeDownloadName(URLUtil.guessFileName(url, contentDisposition, resolvedMime));

        try {
            DownloadManager.Request request = new DownloadManager.Request(uri);
            request.setTitle(fileName);
            request.setDescription("Jet Note " + pageTitle + " 音频");
            request.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
            request.setAllowedOverMetered(true);
            request.setAllowedOverRoaming(true);
            if (resolvedMime != null) request.setMimeType(resolvedMime);

            String ua = userAgent;
            if ((ua == null || ua.isEmpty()) && dictionaryWebView != null) {
                ua = dictionaryWebView.getSettings().getUserAgentString();
            }
            if (ua != null && !ua.isEmpty()) request.addRequestHeader("User-Agent", ua);

            String cookie = CookieManager.getInstance().getCookie(url);
            if (cookie != null && !cookie.isEmpty()) request.addRequestHeader("Cookie", cookie);
            if (dictionaryWebView != null && dictionaryWebView.getUrl() != null) {
                request.addRequestHeader("Referer", dictionaryWebView.getUrl());
            }

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                request.setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, fileName);
            } else {
                request.setDestinationInExternalFilesDir(activity, Environment.DIRECTORY_DOWNLOADS, fileName);
            }

            DownloadManager manager = (DownloadManager) activity.getSystemService(Context.DOWNLOAD_SERVICE);
            if (manager == null) throw new IllegalStateException("DownloadManager unavailable");
            ensureDownloadReceiver();
            long id = manager.enqueue(request);
            activeDownloads.put(id, fileName);
            showDownloadStatus("开始下载：" + fileName, true);
        } catch (RuntimeException e) {
            showDownloadStatus("下载失败：" + fileName, false);
        }
    }

    private void reportDownloadResult(long id, String fileName) {
        DownloadManager manager = (DownloadManager) activity.getSystemService(Context.DOWNLOAD_SERVICE);
        if (manager == null) {
            showDownloadStatus("下载状态未知：" + fileName, false);
            return;
        }

        int status = -1;
        try (Cursor cursor = manager.query(new DownloadManager.Query().setFilterById(id))) {
            if (cursor != null && cursor.moveToFirst()) {
                int index = cursor.getColumnIndex(DownloadManager.COLUMN_STATUS);
                if (index >= 0) status = cursor.getInt(index);
            }
        } catch (RuntimeException ignored) { }

        if (status == DownloadManager.STATUS_SUCCESSFUL) {
            showDownloadStatus("下载完成：" + fileName, true);
        } else {
            showDownloadStatus("下载失败：" + fileName, false);
        }
    }

    private void ensureDownloadReceiver() {
        if (receiverRegistered) return;
        IntentFilter filter = new IntentFilter(DownloadManager.ACTION_DOWNLOAD_COMPLETE);
        if (Build.VERSION.SDK_INT >= 33) {
            activity.registerReceiver(downloadReceiver, filter, Context.RECEIVER_EXPORTED);
        } else {
            activity.registerReceiver(downloadReceiver, filter);
        }
        receiverRegistered = true;
    }

    private void unregisterDownloadReceiver() {
        if (!receiverRegistered) return;
        try {
            activity.unregisterReceiver(downloadReceiver);
        } catch (RuntimeException ignored) { }
        receiverRegistered = false;
    }

    private void showDownloadStatus(String text, boolean success) {
        activity.runOnUiThread(() -> {
            Toast.makeText(activity, text, Toast.LENGTH_SHORT).show();
            if (downloadStatus == null) return;
            downloadStatus.removeCallbacks(hideStatusRunnable);
            downloadStatus.setText(text);
            downloadStatus.setTextColor(success ? 0xff146c3a : 0xffa32929);
            downloadStatus.setVisibility(View.VISIBLE);
            downloadStatus.postDelayed(hideStatusRunnable, success ? 4500L : 6000L);
        });
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
