package app.bunyan.residential;

import static org.junit.Assert.*;
import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.net.Uri;
import android.util.Base64;
import androidx.core.content.FileProvider;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import java.io.ByteArrayOutputStream;
import java.io.File;
import org.junit.Test;
import org.junit.runner.RunWith;

@RunWith(AndroidJUnit4.class)
public class AnnouncementFilesTest {
    @Test public void savesCompleteDecodablePngUsingContentResolver() throws Exception {
        Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        Bitmap original = Bitmap.createBitmap(24, 48, Bitmap.Config.ARGB_8888);
        original.eraseColor(0xff087f72);
        ByteArrayOutputStream encoded = new ByteArrayOutputStream();
        original.compress(Bitmap.CompressFormat.PNG, 100, encoded);
        File output = File.createTempFile("announcement-save-", ".png", context.getCacheDir());
        try {
            Uri uri = FileProvider.getUriForFile(context, context.getPackageName()+".fileprovider", output);
            AnnouncementFilesPlugin.writePng(context, uri, "data:image/png;base64,"+Base64.encodeToString(encoded.toByteArray(),Base64.NO_WRAP));
            assertEquals(encoded.size(), output.length());
            Bitmap saved = BitmapFactory.decodeFile(output.getPath());
            assertNotNull(saved); assertEquals(24,saved.getWidth()); assertEquals(48,saved.getHeight());
            assertEquals(0xff087f72,saved.getPixel(10,10)); saved.recycle();
        } finally { original.recycle(); output.delete(); }
    }
    @Test public void rejectsNonPngBeforeTouchingDestination() throws Exception {
        Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        File output = File.createTempFile("announcement-invalid-", ".png", context.getCacheDir());
        try {
            Uri uri = FileProvider.getUriForFile(context, context.getPackageName()+".fileprovider", output);
            try { AnnouncementFilesPlugin.writePng(context,uri,"data:image/png;base64,aGVsbG8="); fail("Invalid image accepted"); }
            catch (java.io.IOException expected) { assertEquals(0,output.length()); }
        } finally { output.delete(); }
    }
    @Test public void refusesTruncatedPngAndTruncatesAnExistingDestination() throws Exception {
        Context context=InstrumentationRegistry.getInstrumentation().getTargetContext();
        Bitmap bitmap=Bitmap.createBitmap(24,48,Bitmap.Config.ARGB_8888);
        ByteArrayOutputStream encoded=new ByteArrayOutputStream();bitmap.compress(Bitmap.CompressFormat.PNG,100,encoded);bitmap.recycle();
        byte[] bytes=encoded.toByteArray();File output=File.createTempFile("announcement-reused-", ".png",context.getCacheDir());
        try {
            try(java.io.FileOutputStream initial=new java.io.FileOutputStream(output)){initial.write(new byte[10000]);}
            Uri uri=FileProvider.getUriForFile(context,context.getPackageName()+".fileprovider",output);
            String partial="data:image/png;base64,"+Base64.encodeToString(java.util.Arrays.copyOf(bytes,bytes.length-12),Base64.NO_WRAP);
            try { AnnouncementFilesPlugin.writePng(context,uri,partial);fail("Truncated PNG accepted"); }catch(java.io.IOException expected){ assertEquals(10000,output.length()); }
            AnnouncementFilesPlugin.writePng(context,uri,"data:image/png;base64,"+Base64.encodeToString(bytes,Base64.NO_WRAP));
            assertEquals(bytes.length,output.length());assertNotNull(BitmapFactory.decodeFile(output.getPath()));
        }finally{output.delete();}
    }
    @Test public void savesAndReopensImageInAndroidDownloadsProvider() throws Exception {
        Context context=InstrumentationRegistry.getInstrumentation().getTargetContext();
        android.content.ContentValues values=new android.content.ContentValues();
        values.put(android.provider.MediaStore.MediaColumns.DISPLAY_NAME,"elomara-save-fixture.png");
        values.put(android.provider.MediaStore.MediaColumns.MIME_TYPE,"image/png");
        values.put(android.provider.MediaStore.MediaColumns.RELATIVE_PATH,android.os.Environment.DIRECTORY_DOWNLOADS);
        Uri uri=context.getContentResolver().insert(android.provider.MediaStore.Downloads.EXTERNAL_CONTENT_URI,values);
        assertNotNull(uri);
        Bitmap bitmap=Bitmap.createBitmap(100,200,Bitmap.Config.ARGB_8888);bitmap.eraseColor(0xff087f72);
        ByteArrayOutputStream encoded=new ByteArrayOutputStream();bitmap.compress(Bitmap.CompressFormat.PNG,100,encoded);bitmap.recycle();
        try {
            AnnouncementFilesPlugin.writePng(context,uri,"data:image/png;base64,"+Base64.encodeToString(encoded.toByteArray(),Base64.NO_WRAP));
            try(java.io.InputStream stream=context.getContentResolver().openInputStream(uri)){
                Bitmap saved=BitmapFactory.decodeStream(stream);assertNotNull(saved);assertEquals(100,saved.getWidth());assertEquals(200,saved.getHeight());saved.recycle();
            }
        }finally{context.getContentResolver().delete(uri,null,null);}
    }
}
