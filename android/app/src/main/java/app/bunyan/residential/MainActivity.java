package app.bunyan.residential;

import android.content.Intent;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    protected void load() {
        registerPlugin(AnnouncementFilesPlugin.class);
        registerPlugin(PlayBillingPlugin.class);
        NativeBackendBootstrap.attach(this, bridgeBuilder);
        super.load();
    }

    @Override
    protected void onNewIntent(Intent intent) {
        // Keep the latest OAuth deep-link intent available to Capacitor plugins.
        setIntent(intent);
        super.onNewIntent(intent);
    }
}
