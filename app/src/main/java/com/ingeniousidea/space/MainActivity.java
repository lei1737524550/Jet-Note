package com.ingeniousidea.space;

import android.app.Activity;
import android.content.Intent;
import android.graphics.Color;
import android.graphics.Bitmap;
import android.media.MediaMetadataRetriever;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.ViewGroup;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;

import java.io.File;
import java.io.FileInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.URLConnection;
import java.util.HashMap;
import java.util.Map;

public class MainActivity extends Activity {
    private static final String APP_HOST = "appassets.androidplatform.net";
    private static final String LEGACY_HOST = "jetnote.local";
    private static final String LOCAL_PAGE = "https://" + APP_HOST + "/assets/index.html";

    private FrameLayout root;
    private WebView webView;
    private ImagePickerController imagePicker;
    private AttachmentPickerController attachmentPicker;
    private AttachmentStore attachmentStore;
    private JetNoteArchiveController archiveController;
    private DictionaryController dictionaryController;
    private EdgeToEdgeController edgeToEdge;
    private Uri pendingLaunchImport;
    private boolean frontendIsReady;
    private MediaWriteController mediaWriter;
    private NativeVideoPlayer nativeVideoPlayer;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        root = new FrameLayout(this);
        webView = new WebView(this);
        webView.setVerticalScrollBarEnabled(false);
        webView.setHorizontalScrollBarEnabled(false);
        webView.setLayerType(android.view.View.LAYER_TYPE_HARDWARE, null);
        webView.setBackgroundColor(Color.rgb(255, 255, 255));
        root.addView(webView, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        setContentView(root);

        attachmentStore = new AttachmentStore(this);
        mediaWriter=new MediaWriteController(this,attachmentStore);
        imagePicker = new ImagePickerController(this);
        edgeToEdge = new EdgeToEdgeController(this, webView);
        edgeToEdge.install();
        dictionaryController = new DictionaryController(this, root, webView, attachmentStore);
        attachmentPicker = new AttachmentPickerController(this, webView, attachmentStore);
        archiveController = new JetNoteArchiveController(this, webView, attachmentStore);
        nativeVideoPlayer = new NativeVideoPlayer(this, root, attachmentStore);
        pendingLaunchImport = getViewIntentUri(getIntent());

        // Use one HTTPS origin for the packaged app and local media.  Assets are
        // served directly from AssetManager so the project stays dependency-free;
        // media uses the byte-range handler below for reliable HTML5 video seek.

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setAllowFileAccess(true);
        settings.setAllowContentAccess(true);
        settings.setAllowFileAccessFromFileURLs(false);
        settings.setAllowUniversalAccessFromFileURLs(false);
        settings.setSupportZoom(false);
        settings.setBuiltInZoomControls(false);
        settings.setDisplayZoomControls(false);
        // Local post videos should start reliably after a Jet Note user action.
        settings.setMediaPlaybackRequiresUserGesture(false);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            settings.setForceDark(WebSettings.FORCE_DARK_OFF);
        }

        webView.addJavascriptInterface(
                new NativeBridge(this, webView, dictionaryController, attachmentPicker, attachmentStore, archiveController,mediaWriter,nativeVideoPlayer,()->runOnUiThread(()->{frontendIsReady=true;dispatchPendingImport();})),
                "JetNoteNative");

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public void onPageFinished(WebView view, String url) {
                edgeToEdge.dispatchInsets();

            }

            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                String range = null;
                for (Map.Entry<String, String> h : request.getRequestHeaders().entrySet()) {
                    if ("Range".equalsIgnoreCase(h.getKey())) {
                        range = h.getValue();
                        break;
                    }
                }
                WebResourceResponse thumb = videoThumbnailResponse(request.getUrl());
                if (thumb != null) return thumb;
                WebResourceResponse media = mediaResponse(request.getUrl(), range, request.getMethod());
                if (media != null) return media;
                return assetResponse(request.getUrl());
            }

            @SuppressWarnings("deprecation")
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, String url) {
                Uri uri = Uri.parse(url);
                WebResourceResponse thumb = videoThumbnailResponse(uri);
                if (thumb != null) return thumb;
                WebResourceResponse media = mediaResponse(uri, null, "GET");
                if (media != null) return media;
                return assetResponse(uri);
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                if (isAppAssetUrl(uri)) return false;
                openExternal(uri);
                return true;
            }

            @SuppressWarnings("deprecation")
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                Uri uri = Uri.parse(url);
                if (isAppAssetUrl(uri)) return false;
                openExternal(uri);
                return true;
            }
        });

        // Avatar and post attachment inputs use the platform picker.
        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onJsAlert(WebView view, String url, String message, android.webkit.JsResult result) {
                view.evaluateJavascript("window.JetNoteNotice&&window.alert(" + org.json.JSONObject.quote(message) + ");", null);
                result.confirm();
                return true;
            }
            @Override
            public boolean onShowFileChooser(
                    WebView webView,
                    ValueCallback<Uri[]> callback,
                    FileChooserParams fileChooserParams
            ) {
                imagePicker.choose(callback, fileChooserParams != null
                        && fileChooserParams.getMode() == FileChooserParams.MODE_OPEN_MULTIPLE,
                        fileChooserParams==null?new String[]{"image/*"}:fileChooserParams.getAcceptTypes());
                return true;
            }
        });

        webView.loadUrl(LOCAL_PAGE);
    }

    private WebResourceResponse assetResponse(Uri uri) {
        if (uri == null || !"https".equalsIgnoreCase(uri.getScheme())
                || !APP_HOST.equalsIgnoreCase(uri.getHost())) return null;
        String path = uri.getPath();
        if (path == null || !path.startsWith("/assets/")) return null;

        String assetPath = path.substring("/assets/".length());
        if (assetPath.isEmpty()) assetPath = "index.html";
        // Reject traversal and malformed paths before touching AssetManager.
        if (assetPath.startsWith("/") || assetPath.contains("../") || assetPath.contains("\\")) {
            return missingMedia();
        }
        try {
            InputStream in = getAssets().open(assetPath);
            String mime = URLConnection.guessContentTypeFromName(assetPath);
            if (mime == null) {
                if (assetPath.endsWith(".js")) mime = "application/javascript";
                else if (assetPath.endsWith(".css")) mime = "text/css";
                else if (assetPath.endsWith(".json")) mime = "application/json";
                else if (assetPath.endsWith(".svg")) mime = "image/svg+xml";
                else mime = "application/octet-stream";
            }
            String encoding = (mime.startsWith("text/") || mime.contains("javascript") || mime.contains("json") || mime.contains("svg"))
                    ? "UTF-8" : null;
            Map<String, String> headers = new HashMap<>();
            headers.put("Cache-Control", "no-cache");
            headers.put("X-Content-Type-Options", "nosniff");
            return new WebResourceResponse(mime, encoding, 200, "OK", headers, in);
        } catch (IOException ignored) {
            return missingMedia();
        }
    }

    private WebResourceResponse videoThumbnailResponse(Uri uri) {
        if (uri == null || !"https".equalsIgnoreCase(uri.getScheme()) || !APP_HOST.equalsIgnoreCase(uri.getHost())) return null;
        String path = uri.getPath();
        if (path == null || !path.matches("/video-thumb/[A-Za-z0-9_.-]+\\.jpg")) return null;
        String requested = uri.getLastPathSegment();
        if (requested == null || !requested.endsWith(".jpg")) return null;
        String fileName = requested.substring(0, requested.length() - 4);
        if (!AttachmentStore.isSafeFileName(fileName)) return missingMedia();
        File source;
        try { source = attachmentStore.fileForWeb(fileName); } catch (IOException e) { return missingMedia(); }
        File cacheDir = new File(getCacheDir(), "jetnote-video-thumbs");
        if (!cacheDir.exists()) cacheDir.mkdirs();
        String cacheName = "user-" + fileName + ".jpg";
        File cached = new File(cacheDir, cacheName);
        try {
            if (!cached.isFile() || cached.lastModified() < source.lastModified()) {
                MediaMetadataRetriever retriever = new MediaMetadataRetriever();
                Bitmap frame = null;
                try {
                    retriever.setDataSource(source.getAbsolutePath());
                    frame = retriever.getFrameAtTime(0, MediaMetadataRetriever.OPTION_CLOSEST_SYNC);
                    if (frame == null) frame = retriever.getFrameAtTime(-1);
                    if (frame == null) return missingMedia();
                    try (java.io.FileOutputStream out = new java.io.FileOutputStream(cached)) {
                        frame.compress(Bitmap.CompressFormat.JPEG, 82, out);
                    }
                } finally {
                    if (frame != null) frame.recycle();
                    try { retriever.release(); } catch (Exception ignored) { }
                }
            }
            Map<String,String> headers = new HashMap<>();
            headers.put("Cache-Control", "private, max-age=86400");
            return new WebResourceResponse("image/jpeg", null, 200, "OK", headers, new FileInputStream(cached));
        } catch (Exception e) {
            return missingMedia();
        }
    }

    private WebResourceResponse mediaResponse(Uri uri, String rangeHeader, String method) {
        if (!isJetNoteLocalUrl(uri)) return null;
        String path = uri.getPath();

        if (path == null || !path.matches("/media/[A-Za-z0-9_.-]+")) return null;
        String fileName = uri.getLastPathSegment();
        if (!AttachmentStore.isSafeFileName(fileName)) return missingMedia();
        try {
            File file = attachmentStore.fileForWeb(fileName);
            String mime = attachmentStore.mimeForFileName(fileName);
            long size = file.length();
            Map<String, String> baseHeaders = mediaHeaders(mime);
            baseHeaders.put("Accept-Ranges", "bytes");

            if ("OPTIONS".equalsIgnoreCase(method)) {
                return new WebResourceResponse(mime, null, 204, "No Content", baseHeaders,
                        new java.io.ByteArrayInputStream(new byte[0]));
            }

            RangeResult parsedRange = parseRange(rangeHeader, size);
            if (parsedRange.requested && !parsedRange.valid) {
                baseHeaders.put("Content-Range", "bytes */" + size);
                baseHeaders.put("Content-Length", "0");
                return new WebResourceResponse(mime, null, 416, "Range Not Satisfiable", baseHeaders,
                        new java.io.ByteArrayInputStream(new byte[0]));
            }

            if (parsedRange.valid) {
                long start = parsedRange.start;
                long end = parsedRange.end;
                long length = end - start + 1;
                Map<String, String> headers = new HashMap<>(baseHeaders);
                headers.put("Content-Range", "bytes " + start + "-" + end + "/" + size);
                headers.put("Content-Length", String.valueOf(length));

                if ("HEAD".equalsIgnoreCase(method)) {
                    return new WebResourceResponse(mime, null, 206, "Partial Content", headers,
                            new java.io.ByteArrayInputStream(new byte[0]));
                }

                FileInputStream in = new FileInputStream(file);
                long skipped = 0;
                while (skipped < start) {
                    long step = in.skip(start - skipped);
                    if (step <= 0) {
                        int one = in.read();
                        if (one == -1) break;
                        step = 1;
                    }
                    skipped += step;
                }
                if (skipped != start) {
                    in.close();
                    return missingMedia();
                }
                return new WebResourceResponse(mime, null, 206, "Partial Content", headers,
                        new LimitedInputStream(in, length));
            }

            baseHeaders.put("Content-Length", String.valueOf(size));
            if ("HEAD".equalsIgnoreCase(method)) {
                return new WebResourceResponse(mime, null, 200, "OK", baseHeaders,
                        new java.io.ByteArrayInputStream(new byte[0]));
            }
            return new WebResourceResponse(mime, null, 200, "OK", baseHeaders, new FileInputStream(file));
        } catch (IOException ignored) {
            return missingMedia();
        }
    }

    private WebResourceResponse missingMedia(){return new WebResourceResponse("text/plain","UTF-8",404,"Not Found",new HashMap<>(),new java.io.ByteArrayInputStream(new byte[0]));}

    private static final class RangeResult {
        final boolean requested;
        final boolean valid;
        final long start;
        final long end;

        RangeResult(boolean requested, boolean valid, long start, long end) {
            this.requested = requested;
            this.valid = valid;
            this.start = start;
            this.end = end;
        }
    }

    private static RangeResult parseRange(String header, long size) {
        if (header == null || header.trim().isEmpty()) {
            return new RangeResult(false, false, 0, 0);
        }
        if (size <= 0 || !header.regionMatches(true, 0, "bytes=", 0, 6)) {
            return new RangeResult(true, false, 0, 0);
        }
        try {
            String raw = header.substring(6).trim();
            if (raw.isEmpty() || raw.contains(",")) return new RangeResult(true, false, 0, 0);
            int dash = raw.indexOf('-');
            if (dash < 0) return new RangeResult(true, false, 0, 0);
            String startRaw = raw.substring(0, dash).trim();
            String endRaw = raw.substring(dash + 1).trim();
            long start;
            long end;
            if (startRaw.isEmpty()) {
                if (endRaw.isEmpty()) return new RangeResult(true, false, 0, 0);
                long suffix = Long.parseLong(endRaw);
                if (suffix <= 0) return new RangeResult(true, false, 0, 0);
                start = Math.max(0, size - suffix);
                end = size - 1;
            } else {
                start = Long.parseLong(startRaw);
                end = endRaw.isEmpty() ? size - 1 : Long.parseLong(endRaw);
            }
            if (start < 0 || start >= size || end < start) return new RangeResult(true, false, 0, 0);
            end = Math.min(end, size - 1);
            return new RangeResult(true, true, start, end);
        } catch (RuntimeException ignored) {
            return new RangeResult(true, false, 0, 0);
        }
    }

    private static Map<String, String> mediaHeaders(String mime) {
        Map<String, String> headers = new HashMap<>();
        headers.put("Access-Control-Allow-Origin", "*");
        headers.put("Access-Control-Allow-Headers", "Range, Content-Type");
        headers.put("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
        headers.put("Cache-Control", "no-store");
        headers.put("Content-Type", mime == null ? "application/octet-stream" : mime);
        headers.put("X-Content-Type-Options", "nosniff");
        return headers;
    }

    private static boolean isJetNoteLocalUrl(Uri uri) {
        if (uri == null || !"https".equalsIgnoreCase(uri.getScheme())) return false;
        String host = uri.getHost();
        return APP_HOST.equalsIgnoreCase(host) || LEGACY_HOST.equalsIgnoreCase(host);
    }

    private static boolean isAppAssetUrl(Uri uri) {
        return uri != null
                && "https".equalsIgnoreCase(uri.getScheme())
                && APP_HOST.equalsIgnoreCase(uri.getHost());
    }

    private void openExternal(Uri uri) {
        if (uri == null || !("https".equalsIgnoreCase(uri.getScheme())||"http".equalsIgnoreCase(uri.getScheme()))) return;
        try {
            startActivity(new Intent(Intent.ACTION_VIEW, uri));
        } catch (RuntimeException ignored) { }
    }

    private static final class LimitedInputStream extends InputStream {
        private final InputStream delegate;
        private long remaining;

        LimitedInputStream(InputStream delegate, long remaining) {
            this.delegate = delegate;
            this.remaining = remaining;
        }

        @Override
        public int read() throws IOException {
            if (remaining <= 0) return -1;
            int value = delegate.read();
            if (value != -1) remaining--;
            return value;
        }

        @Override
        public int read(byte[] b, int off, int len) throws IOException {
            if (remaining <= 0) return -1;
            int read = delegate.read(b, off, (int) Math.min(len, remaining));
            if (read > 0) remaining -= read;
            return read;
        }

        @Override
        public void close() throws IOException {
            delegate.close();
        }
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        Uri uri = getViewIntentUri(intent);
        if (uri != null && archiveController != null && webView != null) {
            pendingLaunchImport=uri;dispatchPendingImport();
        }
    }

    private void dispatchPendingImport() {
        if(!frontendIsReady||pendingLaunchImport==null)return;
        Uri uri=pendingLaunchImport;pendingLaunchImport=null;
        webView.evaluateJavascript("entriesReady&&!entriesBusy&&!pendingArchive&&!document.querySelector('#postComposeScreen.open')",value->{
            if("true".equals(value)){
                webView.evaluateJavascript("entriesBusy=true;archiveStatus(t('validating'));",null);
                archiveController.importFromUri(uri,"merge");
            } else android.widget.Toast.makeText(this,"Finish the current edit or import before opening a backup.",android.widget.Toast.LENGTH_LONG).show();
        });
    }

    private static Uri getViewIntentUri(Intent intent) {
        if (intent == null || !Intent.ACTION_VIEW.equals(intent.getAction())) return null;
        Uri uri=intent.getData();
        return uri!=null&&("content".equals(uri.getScheme())||"file".equals(uri.getScheme()))?uri:null;
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if(dictionaryController!=null&&dictionaryController.handles(requestCode)){dictionaryController.onActivityResult(requestCode,resultCode,data);return;}
        if (attachmentPicker != null && attachmentPicker.handles(requestCode)) {
            attachmentPicker.onActivityResult(requestCode, resultCode, data);
            return;
        }
        if (archiveController != null && archiveController.handles(requestCode)) {
            archiveController.onActivityResult(requestCode, resultCode, data);
            return;
        }
        if (imagePicker != null) imagePicker.onActivityResult(requestCode, resultCode, data);
    }

    @Override
    public void onBackPressed() {
        if (nativeVideoPlayer != null && nativeVideoPlayer.isOpen()) {
            nativeVideoPlayer.close();
            return;
        }
        if (dictionaryController != null && dictionaryController.isOpen()) {
            dictionaryController.handleBack();
            return;
        }

        if (webView == null) {
            super.onBackPressed();
            return;
        }

        webView.evaluateJavascript(
                "(typeof returnToStandardHome === 'function') ? returnToStandardHome() : false",
                value -> {
                    if (!"true".equals(value)) MainActivity.super.onBackPressed();
                }
        );
    }

    @Override protected void onPause(){if(dictionaryController!=null)dictionaryController.pause();if(webView!=null)webView.onPause();super.onPause();}
    @Override
    protected void onResume() {
        super.onResume();
        if (edgeToEdge != null) edgeToEdge.hideStatusBar();
        if (webView != null) {
            webView.onResume();
            webView.post(() -> webView.evaluateJavascript(
                    "window.dispatchEvent(new Event('jetnote:app-resume'));", null));
        }
        if (dictionaryController != null) dictionaryController.resume();
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        // Returning from a picker/dialog may restore the system status bar.
        // Re-apply Jet Note's status-bar-only immersive mode when the app
        // regains focus; the bottom navigation bar is deliberately untouched.
        if (hasFocus && edgeToEdge != null) edgeToEdge.hideStatusBar();
    }

    @Override
    protected void onDestroy() {
        frontendIsReady=false;
        if (nativeVideoPlayer != null) nativeVideoPlayer.close();
        if(mediaWriter!=null)mediaWriter.destroy();
        if (dictionaryController != null) dictionaryController.destroy();
        if (attachmentPicker != null) attachmentPicker.destroy();
        if (archiveController != null) archiveController.destroy();
        if (imagePicker != null) imagePicker.destroy();
        if (webView != null) {
            webView.removeJavascriptInterface("JetNoteNative");
            webView.setOnApplyWindowInsetsListener(null);
            webView.setWebChromeClient(null);
            webView.setWebViewClient(null);
            webView.stopLoading();
            webView.destroy();
            webView = null;
        }
        super.onDestroy();
    }
}
