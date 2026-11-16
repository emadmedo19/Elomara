package app.bunyan.residential;
import static org.junit.Assert.*;
import static androidx.test.espresso.intent.matcher.IntentMatchers.hasAction;
import android.app.Activity;import android.app.Instrumentation;import android.content.Intent;import android.graphics.Bitmap;import android.graphics.BitmapFactory;import android.net.Uri;import android.os.SystemClock;import android.util.Base64;import android.webkit.WebView;
import androidx.test.core.app.ActivityScenario;import androidx.test.espresso.intent.Intents;import androidx.test.ext.junit.runners.AndroidJUnit4;import androidx.test.platform.app.InstrumentationRegistry;
import java.io.ByteArrayOutputStream;import java.util.concurrent.CountDownLatch;import java.util.concurrent.TimeUnit;import java.util.concurrent.atomic.AtomicReference;import org.json.JSONObject;import org.junit.Test;import org.junit.runner.RunWith;
@RunWith(AndroidJUnit4.class)
public class PaymentReceiptShareTest {
 private String evaluate(WebView view,String script)throws Exception{CountDownLatch done=new CountDownLatch(1);AtomicReference<String> value=new AtomicReference<>();InstrumentationRegistry.getInstrumentation().runOnMainSync(()->view.evaluateJavascript(script,r->{value.set(r);done.countDown();}));assertTrue(done.await(10,TimeUnit.SECONDS));return value.get();}
 @Test public void sharesAnOpenablePrivatePngThroughTheWebViewBridge()throws Exception{
  Bitmap image=Bitmap.createBitmap(100,100,Bitmap.Config.ARGB_8888);image.eraseColor(0xff008577);ByteArrayOutputStream bytes=new ByteArrayOutputStream();image.compress(Bitmap.CompressFormat.PNG,100,bytes);String payload=Base64.encodeToString(bytes.toByteArray(),Base64.NO_WRAP);
  Intents.init();try{Intents.intending(hasAction(Intent.ACTION_CHOOSER)).respondWith(new Instrumentation.ActivityResult(Activity.RESULT_CANCELED,null));
   try(ActivityScenario<MainActivity> scenario=ActivityScenario.launch(MainActivity.class)){AtomicReference<WebView> ref=new AtomicReference<>();scenario.onActivity(a->ref.set(a.getBridge().getWebView()));WebView view=ref.get();long deadline=SystemClock.uptimeMillis()+30000;while(!"true".equals(evaluate(view,"Boolean(window.Capacitor?.nativePromise)"))&&SystemClock.uptimeMillis()<deadline)SystemClock.sleep(200);
    evaluate(view,"window.__receiptError=null;window.__receiptDone=false;(async()=>{try{await Capacitor.nativePromise('AnnouncementFiles','beginPngTransfer',{chunks:1});await Capacitor.nativePromise('AnnouncementFiles','appendPngChunk',{index:0,chunk:"+JSONObject.quote(payload)+"});await Capacitor.nativePromise('AnnouncementFiles','finishPngShare',{fileName:'elomara-receipt-test.png',whatsapp:true});window.__receiptDone=true;}catch(e){window.__receiptError=String(e)}})();true;");
    deadline=SystemClock.uptimeMillis()+30000;while(!"true".equals(evaluate(view,"Boolean(window.__receiptDone||window.__receiptError)"))&&SystemClock.uptimeMillis()<deadline)SystemClock.sleep(200);
    assertEquals("null",evaluate(view,"window.__receiptError"));assertEquals("true",evaluate(view,"window.__receiptDone"));
    Intent chooser=null;for(Intent intent:Intents.getIntents())if(Intent.ACTION_CHOOSER.equals(intent.getAction()))chooser=intent;assertNotNull(chooser);
    Intent send=chooser.getParcelableExtra(Intent.EXTRA_INTENT);assertNotNull(send);assertEquals(Intent.ACTION_SEND,send.getAction());assertEquals("image/png",send.getType());assertTrue((send.getFlags()&Intent.FLAG_GRANT_READ_URI_PERMISSION)!=0);
    Uri uri=send.getParcelableExtra(Intent.EXTRA_STREAM);assertNotNull(uri);assertEquals("content",uri.getScheme());try(java.io.InputStream in=InstrumentationRegistry.getInstrumentation().getTargetContext().getContentResolver().openInputStream(uri)){assertNotNull(BitmapFactory.decodeStream(in));}
   }
  }finally{Intents.release();image.recycle();}
 }
}
