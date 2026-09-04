import os
import sys
import shutil
import subprocess

PROJECT_DIR = r"C:\Users\Sriman\.gemini\antigravity\scratch\pro-downloader"
BUILD_DIR = os.path.join(PROJECT_DIR, "android_build")
DIST_DIR = os.path.join(PROJECT_DIR, "dist")

JAVA_HOME = r"C:\Users\Sriman\AppData\Local\Java\jdk-17.0.12+7"
ANDROID_SDK = r"C:\Users\Sriman\AppData\Local\Android\Sdk"
BUILD_TOOLS = os.path.join(ANDROID_SDK, "build-tools", "36.0.0")
ANDROID_JAR = os.path.join(ANDROID_SDK, "platforms", "android-36", "android.jar")

JAVAC = os.path.join(JAVA_HOME, "bin", "javac.exe")
KEYTOOL = os.path.join(JAVA_HOME, "bin", "keytool.exe")
AAPT = os.path.join(BUILD_TOOLS, "aapt.exe")
D8 = os.path.join(BUILD_TOOLS, "d8.bat")
ZIPALIGN = os.path.join(BUILD_TOOLS, "zipalign.exe")
APKSIGNER = os.path.join(BUILD_TOOLS, "apksigner.bat")

os.environ["JAVA_HOME"] = JAVA_HOME
os.environ["PATH"] = os.path.join(JAVA_HOME, "bin") + os.pathsep + os.environ.get("PATH", "")

def run(cmd, cwd=None):
    print(f">> Running: {cmd if isinstance(cmd, str) else ' '.join(cmd)}")
    res = subprocess.run(cmd, cwd=cwd, shell=isinstance(cmd, str), capture_output=True, text=True)
    if res.returncode != 0:
        print(f"STDOUT:\n{res.stdout}")
        print(f"STDERR:\n{res.stderr}")
        raise RuntimeError(f"Command failed with code {res.returncode}")
    if res.stdout:
        print(res.stdout.strip())
    return res.stdout

def setup_project():
    if os.path.exists(BUILD_DIR):
        shutil.rmtree(BUILD_DIR)
    
    os.makedirs(os.path.join(BUILD_DIR, "src", "com", "eggdl", "downloader"), exist_ok=True)
    os.makedirs(os.path.join(BUILD_DIR, "res", "values"), exist_ok=True)
    os.makedirs(os.path.join(BUILD_DIR, "res", "mipmap-hdpi"), exist_ok=True)
    os.makedirs(os.path.join(BUILD_DIR, "res", "mipmap-xhdpi"), exist_ok=True)
    os.makedirs(os.path.join(BUILD_DIR, "res", "mipmap-xxhdpi"), exist_ok=True)
    os.makedirs(os.path.join(BUILD_DIR, "gen"), exist_ok=True)
    os.makedirs(os.path.join(BUILD_DIR, "bin", "classes"), exist_ok=True)
    os.makedirs(os.path.join(BUILD_DIR, "bin", "dex"), exist_ok=True)
    os.makedirs(DIST_DIR, exist_ok=True)

    # 1. Strings
    with open(os.path.join(BUILD_DIR, "res", "values", "strings.xml"), "w", encoding="utf-8") as f:
        f.write('''<?xml version="1.0" encoding="utf-8"?>
<resources>
    <string name="app_name">EggDL</string>
</resources>
''')

    # 2. Colors
    with open(os.path.join(BUILD_DIR, "res", "values", "colors.xml"), "w", encoding="utf-8") as f:
        f.write('''<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="primary">#46F0D2</color>
    <color name="primary_dark">#131321</color>
    <color name="surface">#1B1B2C</color>
    <color name="accent">#46F0D2</color>
</resources>
''')

    # 3. Styles
    with open(os.path.join(BUILD_DIR, "res", "values", "styles.xml"), "w", encoding="utf-8") as f:
        f.write('''<?xml version="1.0" encoding="utf-8"?>
<resources>
    <style name="AppTheme" parent="android:Theme.Material.NoActionBar">
        <item name="android:colorPrimary">@color/primary</item>
        <item name="android:colorPrimaryDark">@color/primary_dark</item>
        <item name="android:colorAccent">@color/accent</item>
        <item name="android:windowBackground">@color/primary_dark</item>
        <item name="android:navigationBarColor">@color/surface</item>
        <item name="android:statusBarColor">@color/primary_dark</item>
    </style>
</resources>
''')

    # 4. Copy Icons
    icon_src = os.path.join(PROJECT_DIR, "frontend", "images", "egg-icon.png")
    if os.path.exists(icon_src):
        for density in ["mipmap-hdpi", "mipmap-xhdpi", "mipmap-xxhdpi"]:
            shutil.copy2(icon_src, os.path.join(BUILD_DIR, "res", density, "ic_launcher.png"))

    # 5. AndroidManifest.xml
    with open(os.path.join(BUILD_DIR, "AndroidManifest.xml"), "w", encoding="utf-8") as f:
        f.write('''<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android"
    package="com.eggdl.downloader"
    android:versionCode="217"
    android:versionName="2.1.7">

    <uses-permission android:name="android.permission.INTERNET" />
    <uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />
    <uses-permission android:name="android.permission.WRITE_EXTERNAL_STORAGE" />
    <uses-permission android:name="android.permission.READ_EXTERNAL_STORAGE" />
    <uses-permission android:name="android.permission.DOWNLOAD_WITHOUT_NOTIFICATION" />
    <uses-permission android:name="android.permission.POST_NOTIFICATIONS" />

    <application
        android:label="@string/app_name"
        android:icon="@mipmap/ic_launcher"
        android:roundIcon="@mipmap/ic_launcher"
        android:theme="@style/AppTheme"
        android:usesCleartextTraffic="true"
        android:hardwareAccelerated="true"
        android:allowBackup="true"
        android:requestLegacyExternalStorage="true">
        
        <activity
            android:name=".MainActivity"
            android:exported="true"
            android:configChanges="orientation|screenSize|screenLayout|keyboardHidden"
            android:windowSoftInputMode="adjustResize"
            android:label="@string/app_name">
            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LAUNCHER" />
            </intent-filter>
            
            <intent-filter>
                <action android:name="android.intent.action.SEND" />
                <category android:name="android.intent.category.DEFAULT" />
                <data android:mimeType="text/plain" />
            </intent-filter>
        </activity>
    </application>
</manifest>
''')

    # 6. MainActivity.java
    with open(os.path.join(BUILD_DIR, "src", "com", "eggdl", "downloader", "MainActivity.java"), "w", encoding="utf-8") as f:
        f.write('''package com.eggdl.downloader;

import android.app.Activity;
import android.app.DownloadManager;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.view.View;
import android.view.Window;
import android.view.WindowManager;
import android.webkit.CookieManager;
import android.webkit.DownloadListener;
import android.webkit.URLUtil;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

public class MainActivity extends Activity {

    private WebView mWebView;
    private static final String APP_URL = "https://eggdl.onrender.com";

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        Window window = getWindow();
        window.addFlags(WindowManager.LayoutParams.FLAG_DRAWS_SYSTEM_BAR_BACKGROUNDS);
        window.setStatusBarColor(0xFF131321);
        window.setNavigationBarColor(0xFF1B1B2C);

        mWebView = new WebView(this);
        mWebView.setBackgroundColor(0xFF131321);
        setContentView(mWebView);

        configureWebView();
        handleIncomingIntent(getIntent());
    }

    private void configureWebView() {
        WebSettings settings = mWebView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setAllowFileAccess(true);
        settings.setUseWideViewPort(true);
        settings.setLoadWithOverviewMode(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setUserAgentString(settings.getUserAgentString() + " EggDL-Android/2.1.7");

        CookieManager.getInstance().setAcceptCookie(true);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            CookieManager.getInstance().setAcceptThirdPartyCookies(mWebView, true);
        }

        mWebView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                if (url.startsWith("http://") || url.startsWith("https://")) {
                    return false;
                }
                try {
                    Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
                    startActivity(intent);
                    return true;
                } catch (Exception e) {
                    return true;
                }
            }
        });

        mWebView.setWebChromeClient(new WebChromeClient());

        // Native Android DownloadManager Integration
        mWebView.setDownloadListener(new DownloadListener() {
            @Override
            public void onDownloadStart(String url, String userAgent, String contentDisposition, String mimeType, long contentLength) {
                try {
                    DownloadManager.Request request = new DownloadManager.Request(Uri.parse(url));
                    request.setMimeType(mimeType);
                    String cookies = CookieManager.getInstance().getCookie(url);
                    request.addRequestHeader("cookie", cookies);
                    request.addRequestHeader("User-Agent", userAgent);
                    request.setDescription("Downloading file via EggDL...");
                    String filename = URLUtil.guessFileName(url, contentDisposition, mimeType);
                    request.setTitle(filename);
                    request.allowScanningByMediaScanner();
                    request.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
                    request.setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, "EggDL/" + filename);

                    DownloadManager dm = (DownloadManager) getSystemService(Context.DOWNLOAD_SERVICE);
                    dm.enqueue(request);
                    Toast.makeText(MainActivity.this, "Downloading to Downloads/EggDL: " + filename, Toast.LENGTH_SHORT).show();
                } catch (Exception e) {
                    Toast.makeText(MainActivity.this, "Download error: " + e.getMessage(), Toast.LENGTH_LONG).show();
                }
            }
        });

        mWebView.loadUrl(APP_URL);
    }

    private void handleIncomingIntent(Intent intent) {
        if (intent != null && Intent.ACTION_SEND.equals(intent.getAction()) && "text/plain".equals(intent.getType())) {
            String sharedText = intent.getStringExtra(Intent.EXTRA_TEXT);
            if (sharedText != null && !sharedText.trim().isEmpty()) {
                final String textToPaste = sharedText.trim().replace("'", "\\\\'");
                mWebView.postDelayed(new Runnable() {
                    @Override
                    public void run() {
                        mWebView.evaluateJavascript(
                            "var input = document.getElementById('url-input'); if(input){ input.value = '" + textToPaste + "'; var btn = document.getElementById('inspect-btn'); if(btn){ btn.click(); } }",
                            null
                        );
                    }
                }, 1200);
            }
        }
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        handleIncomingIntent(intent);
    }

    @Override
    public void onBackPressed() {
        if (mWebView.canGoBack()) {
            mWebView.goBack();
        } else {
            super.onBackPressed();
        }
    }
}
''')

def build_apk():
    print("=== Step 1: Generating R.java ===")
    run([
        AAPT, "package", "-f", "-m",
        "-J", os.path.join(BUILD_DIR, "gen"),
        "-M", os.path.join(BUILD_DIR, "AndroidManifest.xml"),
        "-S", os.path.join(BUILD_DIR, "res"),
        "-I", ANDROID_JAR
    ], cwd=BUILD_DIR)

    print("=== Step 2: Compiling Java Sources ===")
    r_java = os.path.join(BUILD_DIR, "gen", "com", "eggdl", "downloader", "R.java")
    main_java = os.path.join(BUILD_DIR, "src", "com", "eggdl", "downloader", "MainActivity.java")
    run([
        JAVAC, "-d", os.path.join(BUILD_DIR, "bin", "classes"),
        "-cp", ANDROID_JAR,
        "-source", "1.8", "-target", "1.8",
        r_java, main_java
    ], cwd=BUILD_DIR)

    print("=== Step 3: Converting to DEX via D8 ===")
    classes = [
        os.path.join(BUILD_DIR, "bin", "classes", "com", "eggdl", "downloader", f)
        for f in os.listdir(os.path.join(BUILD_DIR, "bin", "classes", "com", "eggdl", "downloader"))
        if f.endswith(".class")
    ]
    run([
        D8, "--output", os.path.join(BUILD_DIR, "bin", "dex"),
        "--lib", ANDROID_JAR
    ] + classes, cwd=BUILD_DIR)

    print("=== Step 4: Creating Unaligned APK ===")
    unaligned_apk = os.path.join(BUILD_DIR, "bin", "app.unaligned.apk")
    run([
        AAPT, "package", "-f",
        "-M", os.path.join(BUILD_DIR, "AndroidManifest.xml"),
        "-S", os.path.join(BUILD_DIR, "res"),
        "-I", ANDROID_JAR,
        "-F", unaligned_apk
    ], cwd=BUILD_DIR)

    print("=== Step 5: Adding classes.dex into APK ===")
    shutil.copy2(os.path.join(BUILD_DIR, "bin", "dex", "classes.dex"), os.path.join(BUILD_DIR, "classes.dex"))
    run([
        AAPT, "add", unaligned_apk, "classes.dex"
    ], cwd=BUILD_DIR)

    print("=== Step 6: Zipaligning APK ===")
    aligned_apk = os.path.join(DIST_DIR, "EggDL.apk")
    if os.path.exists(aligned_apk):
        os.remove(aligned_apk)
    run([
        ZIPALIGN, "-f", "-p", "4",
        unaligned_apk, aligned_apk
    ], cwd=BUILD_DIR)

    print("=== Step 7: Signing APK with Keystore ===")
    keystore_path = os.path.join(PROJECT_DIR, "eggdl-release.keystore")
    if not os.path.exists(keystore_path):
        print("Generating release keystore...")
        run([
            KEYTOOL, "-genkey", "-v",
            "-keystore", keystore_path,
            "-alias", "eggdl",
            "-keyalg", "RSA",
            "-keysize", "2048",
            "-validity", "10000",
            "-storepass", "eggdl2026",
            "-keypass", "eggdl2026",
            "-dname", "CN=EggDL, OU=Dev, O=EggDL, L=Global, S=Global, C=US"
        ])
    
    run([
        APKSIGNER, "sign",
        "--ks", keystore_path,
        "--ks-pass", "pass:eggdl2026",
        "--key-pass", "pass:eggdl2026",
        "--ks-key-alias", "eggdl",
        "--out", aligned_apk,
        aligned_apk
    ])

    print("=== Step 8: Verifying APK Signature ===")
    run([
        APKSIGNER, "verify", "--verbose", aligned_apk
    ])

    size_mb = os.path.getsize(aligned_apk) / (1024 * 1024)
    print(f"\n SUCCESS! Created signed Android APK:")
    print(f"Path: {aligned_apk}")
    print(f"Size: {size_mb:.2f} MB")

if __name__ == "__main__":
    setup_project()
    build_apk()
