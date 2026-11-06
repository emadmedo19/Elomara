package com.getcapacitor.myapp;

import static org.junit.Assert.*;

import android.content.Context;
import android.content.Intent;
import android.app.Activity;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import org.junit.Test;
import org.junit.runner.RunWith;

/**
 * Instrumented test, which will execute on an Android device.
 *
 * @see <a href="http://d.android.com/tools/testing">Testing documentation</a>
 */
@RunWith(AndroidJUnit4.class)
public class ExampleInstrumentedTest {

    @Test
    public void useAppContext() throws Exception {
        // Context of the app under test.
        Context appContext = InstrumentationRegistry.getInstrumentation().getTargetContext();

        assertEquals("app.bunyan.residential", appContext.getPackageName());
    }

    @Test
    public void firebaseMessagingIsConfiguredBeforeLogin() throws Exception {
        // The same default app lookup used by PushNotifications.register().
        // Without packaged Google Services resources this throws IllegalStateException.
        // Firebase comes from the notification plugin's runtime dependencies.
        // Reflection exercises those packaged classes without adding a second SDK dependency.
        Class<?> firebaseApp = Class.forName("com.google.firebase.FirebaseApp");
        Object app = firebaseApp.getMethod("getInstance").invoke(null);
        Object options = firebaseApp.getMethod("getOptions").invoke(app);
        assertEquals("1:966528651343:android:399c95698ecff92a88da3a", options.getClass().getMethod("getApplicationId").invoke(options));
        assertEquals("elfotoh", options.getClass().getMethod("getProjectId").invoke(options));
        assertNotNull(Class.forName("com.google.firebase.messaging.FirebaseMessaging").getMethod("getInstance").invoke(null));
    }

    @Test
    public void mainActivityLaunches() {
        Context appContext = InstrumentationRegistry.getInstrumentation().getTargetContext();
        Intent launch = appContext.getPackageManager().getLaunchIntentForPackage(appContext.getPackageName());
        assertNotNull(launch);
        launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        Activity activity = InstrumentationRegistry.getInstrumentation().startActivitySync(launch);
        assertNotNull(activity);
        InstrumentationRegistry.getInstrumentation().waitForIdleSync();
        assertFalse(activity.isFinishing());
    }
}
