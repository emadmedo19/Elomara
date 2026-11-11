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
        byte[] bytes;
        try { bytes = Base64.decode(dataUrl.substring(PREFIX.length()), Base64.DEFAULT); }
        catch (IllegalArgumentException error) { throw new IOException("Invalid PNG encoding", error); }
        byte[] signature = {(byte) 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a};
        if (bytes.length <= signature.length) throw new IOException("Empty PNG");
        for (int i = 0; i < signature.length; i++) if (bytes[i] != signature[i]) throw new IOException("Not a PNG");
        try (OutputStream stream = context.getContentResolver().openOutputStream(uri, "w")) {
            if (stream == null) throw new IOException("Destination unavailable");
            stream.write(bytes); stream.flush();
        }
    }
}
