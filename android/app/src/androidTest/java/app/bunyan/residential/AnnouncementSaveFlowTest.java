package app.bunyan.residential;

import static org.junit.Assert.*;
import static androidx.test.espresso.intent.matcher.IntentMatchers.hasAction;
import android.app.Activity;
import android.app.Instrumentation;
import android.content.Context;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.net.Uri;
import android.os.SystemClock;
import android.util.Base64;
import android.util.Log;
import android.webkit.WebView;
import androidx.core.content.FileProvider;
import androidx.test.core.app.ActivityScenario;
import androidx.test.espresso.intent.Intents;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.util.Random;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import org.json.JSONObject;
import org.junit.Test;
import org.junit.runner.RunWith;

@RunWith(AndroidJUnit4.class)
public class AnnouncementSaveFlowTest {
    private String evaluate(WebView view,String script) throws Exception {
        CountDownLatch done=new CountDownLatch(1); AtomicReference<String> value=new AtomicReference<>();
        InstrumentationRegistry.getInstrumentation().runOnMainSync(()->view.evaluateJavascript(script,r->{value.set(r);done.countDown();}));
        assertTrue("JavaScript callback timed out",done.await(10,TimeUnit.SECONDS)); return value.get();
    }
    private void waitFor(WebView view,String stage,String expression) throws Exception {
        // Large PNG bridge transfers and document-provider writes can exceed 20 seconds on CI emulators.
        Log.i("AnnouncementSaveTest","Waiting for stage: "+stage);
        long end=SystemClock.uptimeMillis()+90000;
        while(SystemClock.uptimeMillis()<end){
            if("true".equals(evaluate(view,expression))) { Log.i("AnnouncementSaveTest","Completed stage: "+stage); return; }
            String error=evaluate(view,"Boolean(window.__saveError)");
            if("true".equals(error)) fail("Native save failed at "+stage+": "+evaluate(view,"window.__saveError"));
            SystemClock.sleep(250);
        }
        String diagnostics=evaluate(view,"JSON.stringify({href:location.href,bridge:Boolean(window.Capacitor?.nativePromise),result:window.__saveResult||null,error:window.__saveError||null,ready:document.readyState})");
        Log.e("AnnouncementSaveTest","Save timeout at "+stage+": "+diagnostics);
        fail("Save did not finish at "+stage+" within 90 seconds: "+diagnostics);
    }
    @Test public void fullWebViewBridgeAndDocumentResultSaveLargeOpenablePng() throws Exception {
        Context context=InstrumentationRegistry.getInstrumentation().getTargetContext();
        Bitmap original=Bitmap.createBitmap(720,1280,Bitmap.Config.ARGB_8888);
        Random random=new Random(42);int[] row=new int[720];
        for(int y=0;y<1280;y++){for(int x=0;x<720;x++)row[x]=0xff000000|random.nextInt(0x1000000);original.setPixels(row,0,720,0,y,720,1);}
        ByteArrayOutputStream encoded=new ByteArrayOutputStream();original.compress(Bitmap.CompressFormat.PNG,100,encoded);
        assertTrue("Fixture must exceed small bridge messages",encoded.size()>1000000);
        File output=File.createTempFile("announcement-full-flow-", ".png",context.getCacheDir());
        Uri uri=FileProvider.getUriForFile(context,context.getPackageName()+".fileprovider",output);
        Intents.init();
        try {
            Intents.intending(hasAction(Intent.ACTION_CREATE_DOCUMENT)).respondWith(new Instrumentation.ActivityResult(Activity.RESULT_OK,new Intent().setData(uri)));
            try(ActivityScenario<MainActivity> scenario=ActivityScenario.launch(MainActivity.class)){
                AtomicReference<WebView> ref=new AtomicReference<>();scenario.onActivity(a->ref.set(a.getBridge().getWebView()));WebView view=ref.get();
                waitFor(view,"bridge ready","Boolean(window.Capacitor && window.Capacitor.nativePromise)");
                // Match the production saveAnnouncementImage flow: large base64 payloads must
                // cross the WebView bridge in small chunks, never one multi-MB JS evaluation.
                String payload=Base64.encodeToString(encoded.toByteArray(),Base64.NO_WRAP);
                int chunkLength=12288;
                int chunks=(payload.length()+chunkLength-1)/chunkLength;
                JSONObject begin=new JSONObject().put("chunks",chunks);
                evaluate(view,"window.__saveResult=null;window.__saveError=null;window.__transferDone=false;window.Capacitor.nativePromise('AnnouncementFiles','beginPngTransfer',"+begin+").then(()=>window.__transferDone=true).catch(e=>window.__saveError=e.message);true;");
                waitFor(view,"begin transfer","Boolean(window.__transferDone)");
                for(int index=0;index<chunks;index++){
                    String chunk=payload.substring(index*chunkLength,Math.min((index+1)*chunkLength,payload.length()));
                    JSONObject part=new JSONObject().put("index",index).put("chunk",chunk);
                    evaluate(view,"window.__transferDone=false;window.Capacitor.nativePromise('AnnouncementFiles','appendPngChunk',"+part+").then(()=>window.__transferDone=true).catch(e=>window.__saveError=e.message);true;");
                    waitFor(view,"chunk "+index+"/"+chunks,"Boolean(window.__transferDone)");
                }
                JSONObject finish=new JSONObject().put("fileName","announcement-flow.png");
                evaluate(view,"window.Capacitor.nativePromise('AnnouncementFiles','finishPngTransfer',"+finish+").then(r=>window.__saveResult=r).catch(e=>window.__saveError=e.message);true;");
                waitFor(view,"document picker and save callback","Boolean(window.__saveResult?.saved)");
                Intents.intended(hasAction(Intent.ACTION_CREATE_DOCUMENT));
                assertEquals(encoded.size(),output.length());Bitmap saved=BitmapFactory.decodeFile(output.getPath());assertNotNull(saved);
                assertEquals(original.getWidth(),saved.getWidth());assertEquals(original.getHeight(),saved.getHeight());assertEquals(original.getPixel(111,222),saved.getPixel(111,222));saved.recycle();
            }
        } finally { Intents.release();original.recycle();output.delete(); }
    }
}
