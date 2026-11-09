package com.getcapacitor.myapp;

import static org.junit.Assert.*;

import android.content.Context;
import android.os.SystemClock;
import android.webkit.ServiceWorkerClient;
import android.webkit.ServiceWorkerController;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebView;
import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import app.bunyan.residential.MainActivity;
import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeWebViewClient;
import java.io.ByteArrayInputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.Collections;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.Assume;
import org.junit.Test;
import org.junit.runner.RunWith;

@RunWith(AndroidJUnit4.class)
public class NeonCacheUpgradeTest {
    private static final String WORKER = "/__legacy_upgrade_fixture__.js";
    private static final String SCRIPT = "self.addEventListener('install',e=>e.waitUntil(self.skipWaiting()));" +
        "self.addEventListener('activate',e=>e.waitUntil(self.clients.claim()));" +
        "self.addEventListener('fetch',e=>{if(e.request.mode==='navigate'){e.respondWith(Promise.resolve(new Response(" +
        "'<html><body>legacy-supabase-upgrade-fixture</body></html>',{headers:{'Content-Type':'text/html'}})));}});";

    private static WebResourceResponse fixture(WebResourceRequest request) {
        if (!WORKER.equals(request.getUrl().getPath())) return null;
        return new WebResourceResponse("application/javascript", "UTF-8", 200, "OK",
            Collections.singletonMap("Service-Worker-Allowed", "/"),
            new ByteArrayInputStream(SCRIPT.getBytes(StandardCharsets.UTF_8)));
    }

    private static String evaluate(WebView view, String javascript) throws Exception {
        CountDownLatch finished = new CountDownLatch(1);
        AtomicReference<String> value = new AtomicReference<>();
        InstrumentationRegistry.getInstrumentation().runOnMainSync(() -> view.evaluateJavascript(javascript, result -> {
            value.set(result); finished.countDown();
        }));
        assertTrue("JavaScript did not complete", finished.await(5, TimeUnit.SECONDS));
        return value.get();
    }

    private static void waitFor(WebView view, String condition) throws Exception {
        long end = SystemClock.elapsedRealtime() + 20000;
        while (SystemClock.elapsedRealtime() < end) {
            if ("true".equals(evaluate(view, condition))) return;
            SystemClock.sleep(100);
        }
        fail("WebView condition not met: " + condition);
    }

    @Test
    public void oldServiceWorkerCannotKeepSupabaseAfterNeonRestart() throws Exception {
        Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        try (InputStream runtime = context.getAssets().open("public/elomara-runtime.json")) {
            byte[] buffer = new byte[1024];
            int count = runtime.read(buffer);
            Assume.assumeTrue(new String(buffer, 0, count, StandardCharsets.UTF_8).contains("\"backend\":\"neon\""));
        }
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            AtomicReference<Bridge> bridgeRef = new AtomicReference<>();
            scenario.onActivity(activity -> bridgeRef.set(activity.getBridge()));
            WebView view = bridgeRef.get().getWebView();
            waitFor(view, "document.querySelector('meta[name=elomara-backend]')?.content==='neon' && !!document.querySelector('.fotouh-login')");
            scenario.onActivity(activity -> {
                Bridge bridge = activity.getBridge();
                bridge.setWebViewClient(new BridgeWebViewClient(bridge) {
                    @Override public WebResourceResponse shouldInterceptRequest(WebView webView, WebResourceRequest request) {
                        WebResourceResponse response = fixture(request);
                        return response != null ? response : super.shouldInterceptRequest(webView, request);
                    }
                });
                ServiceWorkerController.getInstance().setServiceWorkerClient(new ServiceWorkerClient() {
                    @Override public WebResourceResponse shouldInterceptRequest(WebResourceRequest request) {
                        WebResourceResponse response = fixture(request);
                        return response != null ? response : bridge.getLocalServer().shouldInterceptRequest(request);
                    }
                });
            });
            evaluate(view, "window.__fixtureReady=false;(async()=>{" +
                "localStorage.setItem('elomara-upgrade-local-probe','preserved');" +
                "await new Promise((resolve,reject)=>{const r=indexedDB.open('elomara-upgrade-probe',1);" +
                "r.onupgradeneeded=()=>r.result.createObjectStore('data');r.onsuccess=()=>{const db=r.result;" +
                "const tx=db.transaction('data','readwrite');tx.objectStore('data').put('preserved','probe');" +
                "tx.oncomplete=()=>{db.close();resolve();};};r.onerror=reject;});" +
                "await caches.open('legacy-navigation-fixture');" +
                "await navigator.serviceWorker.register('" + WORKER + "',{scope:'/'});" +
                "await navigator.serviceWorker.ready;window.__fixtureReady=true;})()");
            waitFor(view, "window.__fixtureReady===true && navigator.serviceWorker.controller!==null");
            InstrumentationRegistry.getInstrumentation().runOnMainSync(view::reload);
            // Reproduce the reported symptom before recreating the upgraded activity.
            waitFor(view, "document.body?.textContent.includes('legacy-supabase-upgrade-fixture')===true");
            scenario.recreate();
            scenario.onActivity(activity -> bridgeRef.set(activity.getBridge()));
            view = bridgeRef.get().getWebView();
            waitFor(view, "document.querySelector('meta[name=elomara-backend]')?.content==='neon' && !!document.querySelector('.fotouh-login')");
            assertEquals("\"neon\"", evaluate(view, "document.querySelector('meta[name=elomara-backend]').content"));
            assertEquals("\"preserved\"", evaluate(view, "localStorage.getItem('elomara-upgrade-local-probe')"));
            evaluate(view, "window.__storedProbe=null;const req=indexedDB.open('elomara-upgrade-probe',1);" +
                "req.onsuccess=()=>{const db=req.result;const read=db.transaction('data').objectStore('data').get('probe');" +
                "read.onsuccess=()=>{window.__storedProbe=read.result;db.close();};};" +
                "window.__workerCount=-1;navigator.serviceWorker.getRegistrations().then(r=>window.__workerCount=r.length);");
            waitFor(view, "window.__storedProbe==='preserved' && window.__workerCount===0");
            evaluate(view, "localStorage.removeItem('elomara-upgrade-local-probe');indexedDB.deleteDatabase('elomara-upgrade-probe')");
            // Exercise the actual recovery form, intercepting email requests so
            // this regression test never sends an email or consumes a rate limit.
            evaluate(view, "window.__recoveryUrl='';const originalFetch=window.fetch.bind(window);window.fetch=(input,init)=>{" +
                "const u=String(input);if(u.includes('/recover')||u.includes('/email-otp/send-verification-otp')){" +
                "window.__recoveryUrl=u;window.__recoveryBody=JSON.parse(init.body);return Promise.resolve(new Response('{}',{status:200,headers:{'Content-Type':'application/json'}}));}" +
                "return originalFetch(input,init);};Array.from(document.querySelectorAll('button')).find(b=>b.textContent.includes('نسيت كلمة المرور')).click();");
            waitFor(view, "document.getElementById('auth-form')?.textContent.includes('إرسال رابط الاستعادة')===true");
            evaluate(view, "const email=document.querySelector('input[type=email]');" +
                "Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(email,'migration-fixture@example.invalid');" +
                "email.dispatchEvent(new Event('input',{bubbles:true}));");
            evaluate(view, "document.getElementById('auth-form').requestSubmit()");
            waitFor(view, "window.__recoveryUrl.includes('.neonauth.') && window.__recoveryUrl.endsWith('/email-otp/send-verification-otp')");
            assertEquals("\"forget-password\"", evaluate(view, "window.__recoveryBody.type"));
            assertEquals("\"migration-fixture@example.invalid\"", evaluate(view, "window.__recoveryBody.email"));
            waitFor(view, "document.body.textContent.includes('رمز التأكيد المرسل لبريدك')");
        }
    }
}
