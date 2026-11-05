package com.rofe.kiosk

import android.content.pm.ActivityInfo
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import androidx.lifecycle.Lifecycle
import androidx.test.core.app.ActivityScenario
import androidx.test.espresso.Espresso.pressBackUnconditionally
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import androidx.test.uiautomator.UiDevice
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertSame
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith

/** Runs on a device or emulator: ./gradlew :app:connectedDebugAndroidTest */
@RunWith(AndroidJUnit4::class)
class KioskInstrumentedTest {

    @Test fun startsImmersiveWithAWebView() {
        ActivityScenario.launch(MainActivity::class.java).use { scenario ->
            InstrumentationRegistry.getInstrumentation().waitForIdleSync()
            scenario.onActivity { activity ->
                assertNotNull(activity.webViewForTest())
                val insets = ViewCompat.getRootWindowInsets(activity.window.decorView)
                assertNotNull(insets)
                assertFalse("system bars hidden", insets!!.isVisible(WindowInsetsCompat.Type.navigationBars()))
            }
        }
    }

    @Test fun backDoesNotLeave() {
        ActivityScenario.launch(MainActivity::class.java).use { scenario ->
            repeat(3) { pressBackUnconditionally() }
            InstrumentationRegistry.getInstrumentation().waitForIdleSync()
            assertEquals(Lifecycle.State.RESUMED, scenario.state)
        }
    }

    @Test fun rotationKeepsTheSameActivityAndWebView() {
        val device = UiDevice.getInstance(InstrumentationRegistry.getInstrumentation())
        ActivityScenario.launch(MainActivity::class.java).use { scenario ->
            var activity: MainActivity? = null
            var webView: android.webkit.WebView? = null
            scenario.onActivity { activity = it; webView = it.webViewForTest() }
            device.setOrientationLeft()
            device.waitForIdle()
            device.setOrientationNatural()
            device.waitForIdle()
            scenario.onActivity {
                assertSame(activity, it)
                assertSame(webView, it.webViewForTest())
            }
            device.unfreezeRotation()
        }
    }

    @Test fun reloadAndErrorStatesStayBranded() {
        ActivityScenario.launch(MainActivity::class.java).use { scenario ->
            scenario.onActivity { activity ->
                activity.simulateMainFrameErrorForTest(offline = true)
                assertTrue(activity.overlayVisibleForTest())
                activity.restartWebView()
                assertNotNull(activity.webViewForTest())
            }
        }
    }

    @Test fun adminRequestShowsADialogAndNotTheLauncher() {
        ActivityScenario.launch(MainActivity::class.java).use { scenario ->
            scenario.onActivity { it.requestAdminForTest() }
            InstrumentationRegistry.getInstrumentation().waitForIdleSync()
            assertEquals(Lifecycle.State.RESUMED, scenario.state)
            scenario.onActivity { assertTrue(it.requestedOrientation == ActivityInfo.SCREEN_ORIENTATION_FULL_USER || it.requestedOrientation == ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED) }
        }
    }
}
