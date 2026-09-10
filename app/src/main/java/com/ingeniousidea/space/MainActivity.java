package com.ingeniousidea.space;

import android.app.Activity;
import android.content.Intent;
import android.graphics.Color;
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
import java.util.HashMap;
import java.util.Map;

public class MainActivity extends Activity {
    private static final String LOCAL_PAGE = "file:///android_asset/index.html";

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

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        root = new FrameLayout(this);
        webView = new WebView(this);
        webView.setBackgroundColor(Color.rgb(240, 255, 230));
        root.addView(webView, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        setContentView(root);

        attachmentStore = new AttachmentStore(this);
        mediaWriter=new MediaWriteController(this,attachmentStore);
        imagePicker = new ImagePickerController(this);
        edgeToEdge = new EdgeToEdgeController(this, webView);
        edgeToEdge.install();
        dictionaryController = new DictionaryController(this, root);
        attachmentPicker = new AttachmentPickerController(this, webView, attachmentStore);
        archiveController = new JetNoteArchiveController(this, webView, attachmentStore);
        pendingLaunchImport = getViewIntentUri(getIntent());

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
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            settings.setForceDark(WebSettings.FORCE_DARK_OFF);
        }

        webView.addJavascriptInterface(
                new NativeBridge(dictionaryController, attachmentPicker, attachmentStore, archiveController,mediaWriter,()->runOnUiThread(()->{frontendIsReady=true;dispatchPendingImport();})),
                "JetNoteNative");

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public void onPageFinished(WebView view, String url) {
                edgeToEdge.dispatchInsets();

            }

            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                String range=null;for(Map.Entry<String,String> h:request.getRequestHeaders().entrySet())if("Range".equalsIgnoreCase(h.getKey()))range=h.getValue();
                return mediaResponse(request.getUrl(), range);
            }

            @SuppressWarnings("deprecation")
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, String url) {
                return mediaResponse(Uri.parse(url), null);
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                if (LOCAL_PAGE.equals(uri.toString())) return false;
                openExternal(uri);
                return true;
            }

            @SuppressWarnings("deprecation")
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                Uri uri = Uri.parse(url);
                if (LOCAL_PAGE.equals(uri.toString())) return false;
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

    private WebResourceResponse mediaResponse(Uri uri, String rangeHeader) {
        if (!isJetNoteLocalUrl(uri)) return null;
        String path = uri.getPath();
        if (path == null || !path.matches("/media/[A-Za-z0-9_.-]+")) return missingMedia();
        String fileName = uri.getLastPathSegment();
        if (!AttachmentStore.isSafeFileName(fileName)) return missingMedia();
        try {
            File file = attachmentStore.fileForWeb(fileName);
            String mime = attachmentStore.mimeForFileName(fileName);
            long size = file.length();

            long[] range = parseRange(rangeHeader, size);
            if (range != null) {
                long start = range[0];
                long end = range[1];
                long length = end - start + 1;
                FileInputStream in = new FileInputStream(file);
                long skipped = 0;
                while (skipped < start) {
                    long step = in.skip(start - skipped);
                    if (step <= 0) break;
                    skipped += step;
                }
                if (skipped != start) {
                    in.close();
                    return null;
                }
                Map<String, String> headers = new HashMap<>();
                headers.put("Access-Control-Allow-Origin", "*");
                headers.put("Accept-Ranges", "bytes");
                headers.put("Content-Range", "bytes " + start + "-" + end + "/" + size);
                headers.put("Content-Length", String.valueOf(length));
                return new WebResourceResponse(mime, null, 206, "Partial Content", headers,
                        new LimitedInputStream(in, length));
            }

            Map<String, String> headers = new HashMap<>();
            headers.put("Access-Control-Allow-Origin", "*");
                headers.put("Accept-Ranges", "bytes");
            headers.put("Content-Length", String.valueOf(size));
            return new WebResourceResponse(mime, null, 200, "OK", headers, new FileInputStream(file));
        } catch (IOException ignored) {
            return missingMedia();
        }
    }
    private WebResourceResponse missingMedia(){return new WebResourceResponse("text/plain","UTF-8",404,"Not Found",new HashMap<>(),new java.io.ByteArrayInputStream(new byte[0]));}

    private static long[] parseRange(String header, long size) {
        if (header == null || !header.startsWith("bytes=") || size <= 0) return null;
        try {
            String raw = header.substring(6).trim();
            if (raw.contains(",")) return null;
            int dash = raw.indexOf('-');
            if (dash < 0) return null;
            String startRaw = raw.substring(0, dash).trim();
            String endRaw = raw.substring(dash + 1).trim();
            long start;
            long end;
            if (startRaw.isEmpty()) {
                long suffix = Long.parseLong(endRaw);
                if (suffix <= 0) return null;
                start = Math.max(0, size - suffix);
                end = size - 1;
            } else {
                start = Long.parseLong(startRaw);
                end = endRaw.isEmpty() ? size - 1 : Long.parseLong(endRaw);
            }
            if (start < 0 || start >= size || end < start) return null;
            end = Math.min(end, size - 1);
            return new long[]{start, end};
        } catch (RuntimeException ignored) {
            return null;
        }
    }

    private static boolean isJetNoteLocalUrl(Uri uri) {
        return uri != null
                && "https".equalsIgnoreCase(uri.getScheme())
                && "jetnote.local".equalsIgnoreCase(uri.getHost());
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
            } else android.widget.Toast.makeText(this,"请先完成当前编辑或导入，再打开备份",android.widget.Toast.LENGTH_LONG).show();
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
    @Override protected void onResume(){super.onResume();if(webView!=null)webView.onResume();if(dictionaryController!=null)dictionaryController.resume();}

    @Override
    protected void onDestroy() {
        frontendIsReady=false;
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
