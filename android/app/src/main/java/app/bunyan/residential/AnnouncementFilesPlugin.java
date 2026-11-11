package app.bunyan.residential;

import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.util.Base64;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.IOException;
import java.io.OutputStream;
import java.io.InputStream;
import java.security.MessageDigest;
import java.util.Arrays;
import java.util.zip.CRC32;
import java.nio.charset.StandardCharsets;
import android.graphics.BitmapFactory;

@CapacitorPlugin(name = "AnnouncementFiles")
public class AnnouncementFilesPlugin extends Plugin {
    private static final String PREFIX = "data:image/png;base64,";
    private static final int MAX_DATA_URL_LENGTH = 24000000;

    @PluginMethod
    public void savePng(PluginCall call) {
        String data = call.getString("dataUrl");
        if (data == null || !data.startsWith(PREFIX) || data.length() > MAX_DATA_URL_LENGTH) {
            call.reject("صورة الإعلان غير صالحة للحفظ.");
            return;
        }
        try { decodePng(data); }
        catch (IOException error) { call.reject("ملف الصورة غير مكتمل. ولّد الإعلان مرة أخرى قبل الحفظ."); return; }
        String name = call.getString("fileName", "elomara-announcement.png");
        if (!name.matches("[A-Za-z0-9_-]+\\.png")) name = "elomara-announcement.png";
        Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType("image/png");
        intent.putExtra(Intent.EXTRA_TITLE, name);
        try { startActivityForResult(call, intent, "saveResult"); }
        catch (Exception error) { call.reject("تعذر فتح مكان حفظ الصورة."); }
    }

    @ActivityCallback
    private void saveResult(PluginCall call, ActivityResult result) {
        if (call == null) return;
        Uri uri = result.getData() == null ? null : result.getData().getData();
        if (result.getResultCode() != Activity.RESULT_OK || uri == null) {
            JSObject response = new JSObject(); response.put("saved", false); call.resolve(response);
            return;
        }
        getBridge().execute(() -> {
            try {
                writePng(getContext(), uri, call.getString("dataUrl"));
                JSObject response = new JSObject(); response.put("saved", true); call.resolve(response);
            } catch (Exception error) { call.reject("تعذر حفظ الصورة. تأكد من المساحة المتاحة واختر مكانًا آخر."); }
        });
    }

    static void writePng(Context context, Uri uri, String dataUrl) throws IOException {
        if (dataUrl == null || !dataUrl.startsWith(PREFIX) || dataUrl.length() > MAX_DATA_URL_LENGTH
            || !"content".equals(uri.getScheme())) throw new IOException("Invalid image destination or data");
        byte[] bytes = decodePng(dataUrl);
        // Explicit truncation matters when a document provider reuses an existing file.
        try (OutputStream stream = context.getContentResolver().openOutputStream(uri, "wt")) {
            if (stream == null) throw new IOException("Destination unavailable");
            stream.write(bytes); stream.flush();
        }
        try (InputStream saved = context.getContentResolver().openInputStream(uri)) {
            if (saved == null) throw new IOException("Saved image unavailable");
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] buffer = new byte[16384]; int count; long length = 0;
            while ((count = saved.read(buffer)) != -1) { digest.update(buffer,0,count); length += count; }
            if (length != bytes.length || !Arrays.equals(digest.digest(), MessageDigest.getInstance("SHA-256").digest(bytes))) {
                throw new IOException("Saved image differs from original");
            }
        } catch (java.security.NoSuchAlgorithmException error) { throw new IOException("Image verification unavailable",error); }
    }

    private static byte[] decodePng(String dataUrl) throws IOException {
        if (dataUrl == null || !dataUrl.startsWith(PREFIX) || dataUrl.length() > MAX_DATA_URL_LENGTH) throw new IOException("Invalid image data");
        byte[] bytes;
        try { bytes = Base64.decode(dataUrl.substring(PREFIX.length()), Base64.DEFAULT); }
        catch (IllegalArgumentException error) { throw new IOException("Invalid PNG encoding", error); }
        byte[] signature = {(byte) 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a};
        if (bytes.length <= signature.length) throw new IOException("Empty PNG");
        for (int i = 0; i < signature.length; i++) if (bytes[i] != signature[i]) throw new IOException("Not a PNG");
        validatePng(bytes);
        return bytes;
    }

    private static long unsignedInt(byte[] bytes, int at) {
        return ((bytes[at]&255L)<<24)|((bytes[at+1]&255L)<<16)|((bytes[at+2]&255L)<<8)|(bytes[at+3]&255L);
    }
    private static void validatePng(byte[] bytes) throws IOException {
        int at=8; boolean hasData=false, complete=false;
        while (at <= bytes.length-12) {
            long length=unsignedInt(bytes,at);
            if (length > bytes.length-at-12) throw new IOException("Truncated PNG chunk");
            int size=(int)length;
            String type=new String(bytes,at+4,4,StandardCharsets.US_ASCII);
            if (at==8 && (!"IHDR".equals(type) || size!=13)) throw new IOException("Invalid PNG header");
            CRC32 crc=new CRC32(); crc.update(bytes,at+4,size+4);
            if (crc.getValue()!=unsignedInt(bytes,at+8+size)) throw new IOException("Corrupt PNG checksum");
            if ("IDAT".equals(type)) hasData=true;
            at+=size+12;
            if ("IEND".equals(type)) { complete=size==0 && at==bytes.length && hasData; break; }
        }
        if (!complete) throw new IOException("Incomplete PNG image");
        BitmapFactory.Options options=new BitmapFactory.Options(); options.inJustDecodeBounds=true;
        BitmapFactory.decodeByteArray(bytes,0,bytes.length,options);
        if (options.outWidth<=0 || options.outHeight<=0) throw new IOException("Unreadable PNG image");
    }
}
