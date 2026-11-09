package app.bunyan.residential;

import android.app.AlertDialog;
import android.content.Context;
import android.content.SharedPreferences;
import android.view.View;
import android.webkit.WebView;
import com.getcapacitor.Bridge;
import com.getcapacitor.WebViewListener;
import java.io.InputStream;
import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import org.json.JSONObject;

/** Reconcile the packaged backend with old OTA/PWA navigation caches, without
 * deleting localStorage, IndexedDB, cookies, files or native session storage. */
final class NativeBackendBootstrap extends WebViewListener {
    private final MainActivity activity;
    private final String buildId;
    private final SharedPreferences preferences;
    private boolean verified;
    private boolean checking;
    private boolean cleaned;

    private NativeBackendBootstrap(MainActivity activity, String buildId) {
        this.activity = activity;
        this.buildId = buildId;
        preferences = activity.getSharedPreferences("elomara-native-backend", Context.MODE_PRIVATE);
    }

    static void attach(MainActivity activity, Bridge.Builder builder) {
        try (InputStream stream = activity.getAssets().open("public/elomara-runtime.json")) {
            ByteArrayOutputStream bytes = new ByteArrayOutputStream();
            byte[] buffer = new byte[2048];
            int count;
            while ((count = stream.read(buffer)) != -1) bytes.write(buffer, 0, count);
            JSONObject runtime = new JSONObject(new String(bytes.toByteArray(), StandardCharsets.UTF_8));
            if ("neon".equals(runtime.optString("backend"))) {
                builder.addWebViewListener(new NativeBackendBootstrap(activity, runtime.getString("buildId")));
            }
        } catch (Exception error) {
            // Older/default builds have no migration marker and retain their behavior.
        }
    }

    @Override
    public void onPageStarted(WebView view) {
        if (!verified) view.setVisibility(View.INVISIBLE);
    }

    @Override
    public void onPageLoaded(WebView view) {
        if (verified || checking) return;
        checking = true;
        view.evaluateJavascript("document.querySelector('meta[name=\"elomara-backend\"]')?.content || ''", value -> {
            boolean correctBackend = "\"neon\"".equals(value);
            boolean migrated = buildId.equals(preferences.getString("verifiedBuild", ""));
            if (correctBackend && (cleaned || migrated)) {
                verified = true;
                checking = false;
                preferences.edit().putString("verifiedBuild", buildId).apply();
                view.setVisibility(View.VISIBLE);
            } else if (cleaned) {
                retryDialog(view);
            } else {
                clearNavigationCaches(view);
            }
        });
    }

    private void clearNavigationCaches(WebView view) {
        // Unregister only same-origin service workers and delete their navigation
        // caches. Browser/application data is deliberately never cleared.
        view.evaluateJavascript("window.__elomaraCacheReset='pending';(async()=>{" +
            "if('serviceWorker' in navigator){const r=await navigator.serviceWorker.getRegistrations();await Promise.all(r.map(x=>x.unregister()));}" +
            "if('caches' in window){const k=await caches.keys();await Promise.all(k.map(x=>caches.delete(x)));}" +
            "window.__elomaraCacheReset='done';})().catch(()=>{window.__elomaraCacheReset='failed';});", ignored -> poll(view, 0));
    }

    private void poll(WebView view, int attempt) {
        view.evaluateJavascript("window.__elomaraCacheReset", value -> {
            if ("\"done\"".equals(value)) {
                cleaned = true;
                checking = false;
                view.clearCache(true); // HTTP cache only; preserves DOM/application storage.
                activity.getSharedPreferences(com.getcapacitor.plugin.WebView.WEBVIEW_PREFS_NAME, Context.MODE_PRIVATE)
                    .edit().remove(com.getcapacitor.plugin.WebView.CAP_SERVER_PATH).commit();
                activity.getBridge().setServerAssetPath("public");
            } else if ("\"failed\"".equals(value) || attempt >= 100) {
                retryDialog(view);
            } else {
                view.postDelayed(() -> poll(view, attempt + 1), 50);
            }
        });
    }

    private void retryDialog(WebView view) {
        new AlertDialog.Builder(activity).setMessage("تعذر فتح النسخة الجديدة. حاول مرة أخرى، بدون مسح بيانات التطبيق.")
            .setCancelable(false).setPositiveButton("إعادة المحاولة", (dialog, which) -> {
                cleaned = false;
                clearNavigationCaches(view);
            }).show();
    }
}
