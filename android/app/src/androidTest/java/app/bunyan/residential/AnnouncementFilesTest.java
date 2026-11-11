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
}
