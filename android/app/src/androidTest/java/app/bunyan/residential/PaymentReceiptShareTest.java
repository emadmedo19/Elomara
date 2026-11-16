package app.bunyan.residential;
import static org.junit.Assert.*;
import static androidx.test.espresso.intent.matcher.IntentMatchers.hasAction;
import android.app.Activity;import android.app.Instrumentation;import android.content.Intent;import android.graphics.Bitmap;import android.graphics.BitmapFactory;import android.net.Uri;import android.os.SystemClock;import android.util.Base64;import android.webkit.WebView;
import androidx.test.core.app.ActivityScenario;import androidx.test.espresso.intent.Intents;import androidx.test.ext.junit.runners.AndroidJUnit4;import androidx.test.platform.app.InstrumentationRegistry;
import android.view.View;import java.util.Random;import java.util.concurrent.atomic.AtomicBoolean;
import java.io.ByteArrayOutputStream;import java.util.concurrent.CountDownLatch;import java.util.concurrent.TimeUnit;import java.util.concurrent.atomic.AtomicReference;import org.json.JSONObject;import org.junit.Test;import org.junit.runner.RunWith;
@RunWith(AndroidJUnit4.class)
public class PaymentReceiptShareTest {
 private String evaluate(WebView view,String script)throws Exception{CountDownLatch done=new CountDownLatch(1);AtomicReference<String> value=new AtomicReference<>();InstrumentationRegistry.getInstrumentation().runOnMainSync(()->view.evaluateJavascript(script,r->{value.set(r);done.countDown();}));assertTrue(done.await(10,TimeUnit.SECONDS));return value.get();}
 @Test public void sharesAnOpenablePrivatePngThroughTheWebViewBridge()throws Exception{
  Bitmap image=Bitmap.createBitmap(320,480,Bitmap.Config.ARGB_8888);Random random=new Random(73);for(int y=0;y<480;y++)for(int x=0;x<320;x++)image.setPixel(x,y,0xff000000|random.nextInt(0x1000000));ByteArrayOutputStream bytes=new ByteArrayOutputStream();image.compress(Bitmap.CompressFormat.PNG,100,bytes);String payload=Base64.encodeToString(bytes.toByteArray(),Base64.NO_WRAP);
  Intents.init();try{Intents.intending(hasAction(Intent.ACTION_CHOOSER)).respondWith(new Instrumentation.ActivityResult(Activity.RESULT_CANCELED,null));
   try(ActivityScenario<MainActivity> scenario=ActivityScenario.launch(MainActivity.class)){AtomicReference<WebView> ref=new AtomicReference<>();scenario.onActivity(a->ref.set(a.getBridge().getWebView()));WebView view=ref.get();long deadline=SystemClock.uptimeMillis()+90000;
    while(SystemClock.uptimeMillis()<deadline){AtomicBoolean visible=new AtomicBoolean();InstrumentationRegistry.getInstrumentation().runOnMainSync(()->visible.set(view.getVisibility()==View.VISIBLE));if(visible.get()&&"true".equals(evaluate(view,"document.readyState==='complete'&&Boolean(window.Capacitor?.nativePromise)")))break;SystemClock.sleep(200);}
    assertTrue("Receipt fixture must exercise multi-chunk transfers",payload.length()>12288);
    evaluate(view,"window.__receiptPayload='';true;");for(int offset=0;offset<payload.length();offset+=32768){assertEquals("true",evaluate(view,"window.__receiptPayload+="+JSONObject.quote(payload.substring(offset,Math.min(offset+32768,payload.length())))+";true;"));}
    assertEquals(String.valueOf(payload.length()),evaluate(view,"window.__receiptPayload.length"));
    evaluate(view,"window.__receiptError=null;window.__receiptDone=false;(async()=>{try{const data=window.__receiptPayload;const size=12288;const chunks=Math.ceil(data.length/size);await Capacitor.nativePromise('AnnouncementFiles','beginPngTransfer',{chunks});for(let i=0;i<chunks;i++)await Capacitor.nativePromise('AnnouncementFiles','appendPngChunk',{index:i,chunk:data.slice(i*size,(i+1)*size)});await Capacitor.nativePromise('AnnouncementFiles','finishPngShare',{fileName:'elomara-receipt-test.png',whatsapp:true});window.__receiptDone=true;}catch(e){window.__receiptError=String(e?.message||e)+' '+JSON.stringify(e?.data||{})}})();true;");
    deadline=SystemClock.uptimeMillis()+90000;while(!"true".equals(evaluate(view,"Boolean(window.__receiptDone||window.__receiptError)"))&&SystemClock.uptimeMillis()<deadline)SystemClock.sleep(200);
    assertEquals("null",evaluate(view,"window.__receiptError"));assertEquals("true",evaluate(view,"window.__receiptDone"));
    Intent chooser=null;for(Intent intent:Intents.getIntents())if(Intent.ACTION_CHOOSER.equals(intent.getAction()))chooser=intent;assertNotNull(chooser);
    Intent send=chooser.getParcelableExtra(Intent.EXTRA_INTENT);assertNotNull(send);assertEquals(Intent.ACTION_SEND,send.getAction());assertEquals("image/png",send.getType());assertTrue((send.getFlags()&Intent.FLAG_GRANT_READ_URI_PERMISSION)!=0);
    Uri uri=send.getParcelableExtra(Intent.EXTRA_STREAM);assertNotNull(uri);assertEquals("content",uri.getScheme());try(java.io.InputStream in=InstrumentationRegistry.getInstrumentation().getTargetContext().getContentResolver().openInputStream(uri)){Bitmap decoded=BitmapFactory.decodeStream(in);assertNotNull(decoded);assertEquals(320,decoded.getWidth());assertEquals(480,decoded.getHeight());assertEquals(image.getPixel(2,2),decoded.getPixel(2,2));decoded.recycle();}
   }
  }finally{Intents.release();image.recycle();}
 }
}
