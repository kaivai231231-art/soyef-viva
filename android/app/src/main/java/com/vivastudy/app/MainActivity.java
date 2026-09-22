package com.vivastudy.app;

import android.annotation.SuppressLint;
import android.graphics.Color;
import android.net.ConnectivityManager;
import android.net.Network;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.webkit.MimeTypeMap;
import android.webkit.WebChromeClient;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import android.content.Intent;
import android.net.Uri;

import androidx.activity.OnBackPressedCallback;
import androidx.appcompat.app.AppCompatActivity;
import androidx.webkit.WebViewAssetLoader;

import org.json.JSONObject;

import java.io.BufferedInputStream;
import java.io.BufferedOutputStream;
import java.io.ByteArrayInputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import android.util.Base64;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

public class MainActivity extends AppCompatActivity {
    private static final String APP_PATH = "/app/";
    // Change this once to the real live website domain before the first APK build.
    // The deployed site must expose /app-update/version.json and /app-update/web.zip.
    private static final String UPDATE_BASE_URL = "https://myviva.netlify.app/app-update/";
    private static final String UPDATE_VERSION_URL = UPDATE_BASE_URL + "version.json";
    private static final String UPDATE_ZIP_URL = UPDATE_BASE_URL + "web.zip";
    private static final String CURRENT_VERSION = "1.0.0";

    private WebView webView;
    private File currentDir;
    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    private static final int REQUEST_IMPORT_FILE = 4101;
    private static final int REQUEST_EXPORT_FILE = 4102;
    private ValueCallback<Uri[]> filePathCallback;
    private String pendingExportBase64;
    private String pendingExportName;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().setStatusBarColor(Color.rgb(31, 81, 76));
        getWindow().setNavigationBarColor(Color.rgb(246, 242, 233));

        currentDir = new File(getFilesDir(), "web-current");

        webView = new WebView(this);
        setContentView(webView);

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setBuiltInZoomControls(false);
        settings.setDisplayZoomControls(false);
        settings.setMediaPlaybackRequiresUserGesture(true);
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);

        WebViewAssetLoader assetLoader = new WebViewAssetLoader.Builder()
                .addPathHandler("/app/", new LocalWebPathHandler(""))
                .addPathHandler("/assets/", new LocalWebPathHandler("assets/"))
                .build();

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                return assetLoader.shouldInterceptRequest(request.getUrl());
            }
        });
        webView.addJavascriptInterface(new AndroidBridge(), "Android");
        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (filePathCallback != null) filePathCallback.onReceiveValue(null);
                filePathCallback = callback;
                try {
                    // পুরনো কোডে setType("application/json") ব্যবহার করায় Android-এর
                    // ফাইল পিকার অনেক সময় নিজেদের এক্সপোর্ট করা .json ব্যাকআপ ফাইলটাকেই
                    // দেখাত না — কারণ Google Drive/Files-এ সেভ হওয়া ফাইলের প্রকৃত MIME
                    // type প্রায়ই application/json না হয়ে text/plain বা
                    // application/octet-stream হয়ে যায়। তাই এখানে সব ফাইল টাইপ
                    // (*/*) দেখানো হচ্ছে এবং EXTRA_MIME_TYPES দিয়ে .json-সংশ্লিষ্ট
                    // MIME গুলোকে শুধু "প্রাধান্য" হিসেবে জানানো হচ্ছে, বাধ্যতামূলক ফিল্টার হিসেবে নয়।
                    Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
                    intent.addCategory(Intent.CATEGORY_OPENABLE);
                    intent.setType("*/*");
                    intent.putExtra(Intent.EXTRA_MIME_TYPES, new String[]{
                            "application/json", "text/plain", "text/json", "application/octet-stream"
                    });
                    intent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, false);
                    startActivityForResult(intent, REQUEST_IMPORT_FILE);
                    return true;
                } catch (Exception e) {
                    filePathCallback = null;
                    callback.onReceiveValue(null);
                    return false;
                }
            }
        });
        webView.setBackgroundColor(Color.rgb(246, 242, 233));
        webView.loadUrl("https://appassets.androidplatform.net/app/index.html");

        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override public void handleOnBackPressed() {
                if (webView.canGoBack()) webView.goBack();
                else finish();
            }
        });

        // Always open immediately from the local bundle/current cache. Network update runs in background.
        updateFromInternetIfAvailable();
    }

    private void updateFromInternetIfAvailable() {
        new Thread(() -> {
            if (UPDATE_BASE_URL.contains("YOUR-VIVA-STUDY-DOMAIN")) return;
            try {
                String remoteVersion = fetchText(UPDATE_VERSION_URL);
                JSONObject json = new JSONObject(remoteVersion);
                String version = json.optString("version", "");
                String zipUrl = json.optString("zipUrl", UPDATE_ZIP_URL);
                if (version.isEmpty() || !isNewer(version, getInstalledVersion())) return;

                File tempZip = new File(getCacheDir(), "web-update.zip");
                download(zipUrl, tempZip);
                File staging = new File(getFilesDir(), "web-staging");
                deleteRecursively(staging);
                unzipSafely(tempZip, staging);

                if (!new File(staging, "index.html").isFile()) throw new IOException("Update bundle has no index.html");

                File old = new File(getFilesDir(), "web-old");
                deleteRecursively(old);
                if (currentDir.exists() && !currentDir.renameTo(old)) throw new IOException("Could not stage current version");
                if (!staging.renameTo(currentDir)) {
                    if (old.exists()) old.renameTo(currentDir);
                    throw new IOException("Could not install update");
                }
                deleteRecursively(old);
                writeInstalledVersion(version);

                mainHandler.post(() -> {
                    Toast.makeText(this, "Viva Study আপডেট হয়েছে — নতুন version চালু হচ্ছে", Toast.LENGTH_LONG).show();
                    webView.clearCache(false);
                    webView.reload();
                });
            } catch (Exception ignored) {
                // Offline or failed update: keep the currently installed/bundled version.
            }
        }).start();
    }

    private String getInstalledVersion() {
        File f = new File(getFilesDir(), "web-version.txt");
        if (!f.isFile()) return CURRENT_VERSION;
        try (FileInputStream in = new FileInputStream(f)) {
            byte[] b = new byte[(int) f.length()];
            int n = in.read(b);
            return new String(b, 0, Math.max(n, 0), StandardCharsets.UTF_8).trim();
        } catch (Exception e) { return CURRENT_VERSION; }
    }

    private void writeInstalledVersion(String version) throws IOException {
        try (FileOutputStream out = new FileOutputStream(new File(getFilesDir(), "web-version.txt"))) {
            out.write(version.getBytes(StandardCharsets.UTF_8));
        }
    }

    private boolean isNewer(String remote, String local) {
        String[] a = remote.replaceAll("[^0-9.]", "").split("\\.");
        String[] b = local.replaceAll("[^0-9.]", "").split("\\.");
        int n = Math.max(a.length, b.length);
        for (int i = 0; i < n; i++) {
            int x = i < a.length && !a[i].isEmpty() ? Integer.parseInt(a[i]) : 0;
            int y = i < b.length && !b[i].isEmpty() ? Integer.parseInt(b[i]) : 0;
            if (x != y) return x > y;
        }
        return false;
    }

    private String fetchText(String urlString) throws IOException {
        HttpURLConnection c = (HttpURLConnection) new URL(urlString).openConnection();
        c.setConnectTimeout(6000);
        c.setReadTimeout(8000);
        c.setRequestMethod("GET");
        if (c.getResponseCode() < 200 || c.getResponseCode() >= 300) throw new IOException("HTTP " + c.getResponseCode());
        try (InputStream in = new BufferedInputStream(c.getInputStream())) {
            java.io.ByteArrayOutputStream out = new java.io.ByteArrayOutputStream();
            byte[] buffer = new byte[4096];
            int n;
            while ((n = in.read(buffer)) != -1) out.write(buffer, 0, n);
            return out.toString("UTF-8");
        } finally { c.disconnect(); }
    }

    private void download(String urlString, File target) throws IOException {
        HttpURLConnection c = (HttpURLConnection) new URL(urlString).openConnection();
        c.setConnectTimeout(10000);
        c.setReadTimeout(30000);
        c.setRequestMethod("GET");
        if (c.getResponseCode() < 200 || c.getResponseCode() >= 300) throw new IOException("HTTP " + c.getResponseCode());
        try (InputStream in = new BufferedInputStream(c.getInputStream()); FileOutputStream out = new FileOutputStream(target)) {
            byte[] buffer = new byte[8192]; int n;
            while ((n = in.read(buffer)) != -1) out.write(buffer, 0, n);
        } finally { c.disconnect(); }
    }

    private void unzipSafely(File zipFile, File destination) throws IOException {
        if (!destination.mkdirs() && !destination.isDirectory()) throw new IOException("Cannot create staging directory");
        String root = destination.getCanonicalPath() + File.separator;
        try (ZipInputStream zis = new ZipInputStream(new BufferedInputStream(new FileInputStream(zipFile)))) {
            ZipEntry entry;
            byte[] buffer = new byte[8192];
            while ((entry = zis.getNextEntry()) != null) {
                File out = new File(destination, entry.getName());
                if (!out.getCanonicalPath().startsWith(root)) throw new IOException("Unsafe zip entry");
                if (entry.isDirectory()) { out.mkdirs(); continue; }
                File parent = out.getParentFile(); if (parent != null) parent.mkdirs();
                try (BufferedOutputStream bos = new BufferedOutputStream(new FileOutputStream(out))) {
                    int n; while ((n = zis.read(buffer)) != -1) bos.write(buffer, 0, n);
                }
            }
        }
    }

    private void deleteRecursively(File file) {
        if (!file.exists()) return;
        if (file.isDirectory()) {
            File[] children = file.listFiles();
            if (children != null) for (File child : children) deleteRecursively(child);
        }
        file.delete();
    }

    private class LocalWebPathHandler implements WebViewAssetLoader.PathHandler {
        // The folder (relative to www/) that this handler's mount point corresponds to.
        // e.g. "/app/" -> "" (www/ itself), "/assets/" -> "assets/" (www/assets/)
        private final String mountPrefix;

        LocalWebPathHandler(String mountPrefix) {
            this.mountPrefix = mountPrefix;
        }

        @Override
        public WebResourceResponse handle(String path) {
            // WebViewAssetLoader already strips the registered mount prefix (/app/ or /assets/)
            // before calling this method, so `path` here is relative to that mount point.
            // e.g. request .../app/index.html    -> path == "index.html"      -> www/index.html
            // e.g. request .../assets/foo.js      -> path == "foo.js"          -> www/assets/foo.js
            try {
                String relative = mountPrefix + path;
                File base = currentDir.exists() ? currentDir : null;
                if (base != null) {
                    File f = new File(base, relative);
                    if (f.getCanonicalPath().startsWith(base.getCanonicalPath() + File.separator) && f.isFile()) {
                        return responseFor(f);
                    }
                }
                // First-run fallback to the APK's bundled assets.
                String assetPath = "www/" + relative;
                InputStream in = getAssets().open(assetPath);
                String mime = MimeTypeMap.getSingleton().getMimeTypeFromExtension(
                        MimeTypeMap.getFileExtensionFromUrl(path));
                if (mime == null) mime = "application/octet-stream";
                return new WebResourceResponse(mime, "UTF-8", in);
            } catch (Exception e) {
                return null;
            }
        }

        private WebResourceResponse responseFor(File f) throws IOException {
            String ext = MimeTypeMap.getFileExtensionFromUrl(f.getName());
            String mime = MimeTypeMap.getSingleton().getMimeTypeFromExtension(ext);
            if (mime == null) {
                if (f.getName().endsWith(".js")) mime = "text/javascript";
                else if (f.getName().endsWith(".css")) mime = "text/css";
                else if (f.getName().endsWith(".svg")) mime = "image/svg+xml";
                else mime = "application/octet-stream";
            }
            return new WebResourceResponse(mime, "UTF-8", new FileInputStream(f));
        }
    }

    private class AndroidBridge {
        @JavascriptInterface
        public void saveBackup(String base64, String filename) {
            pendingExportBase64 = base64;
            pendingExportName = (filename == null || filename.trim().isEmpty())
                    ? "viva-study-backup.json" : filename;
            mainHandler.post(() -> {
                try {
                    Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
                    intent.addCategory(Intent.CATEGORY_OPENABLE);
                    intent.setType("application/json");
                    intent.putExtra(Intent.EXTRA_TITLE, pendingExportName);
                    startActivityForResult(intent, REQUEST_EXPORT_FILE);
                } catch (Exception e) {
                    Toast.makeText(MainActivity.this, "ব্যাকআপ ফাইল তৈরি করা যায়নি", Toast.LENGTH_SHORT).show();
                }
            });
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == REQUEST_IMPORT_FILE) {
            if (filePathCallback == null) return;
            Uri[] results = null;
            if (resultCode == RESULT_OK && data != null) {
                Uri uri = data.getData();
                if (uri != null) results = new Uri[]{uri};
            }
            filePathCallback.onReceiveValue(results);
            filePathCallback = null;
            return;
        }
        if (requestCode == REQUEST_EXPORT_FILE) {
            if (resultCode == RESULT_OK && data != null && data.getData() != null && pendingExportBase64 != null) {
                try {
                    byte[] bytes = Base64.decode(pendingExportBase64, Base64.DEFAULT);
                    Uri uri = data.getData();
                    try (java.io.OutputStream out = getContentResolver().openOutputStream(uri)) {
                        if (out == null) throw new IOException("No output stream");
                        out.write(bytes);
                        out.flush();
                    }
                    Toast.makeText(this, "ব্যাকআপ ফাইল সেভ হয়েছে", Toast.LENGTH_SHORT).show();
                } catch (Exception e) {
                    Toast.makeText(this, "ব্যাকআপ সেভ করা যায়নি", Toast.LENGTH_SHORT).show();
                }
            }
            pendingExportBase64 = null;
            pendingExportName = null;
        }
    }

    @Override
    protected void onDestroy() {
        if (webView != null) {
            webView.loadUrl("about:blank");
            webView.destroy();
        }
        super.onDestroy();
    }
}
