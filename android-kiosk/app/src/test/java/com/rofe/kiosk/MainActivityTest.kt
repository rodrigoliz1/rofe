package com.rofe.kiosk

import android.content.ComponentName
import android.content.pm.ActivityInfo
import android.net.Uri
import android.view.View
import android.view.WindowManager
import android.webkit.WebResourceRequest
import androidx.test.core.app.ActivityScenario
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.Shadows.shadowOf
import org.robolectric.annotation.Config
import org.robolectric.shadows.ShadowDialog

@RunWith(AndroidJUnit4::class)
@Config(sdk = [34])
class MainActivityTest {

    private fun launch(block: (MainActivity) -> Unit) {
        ActivityScenario.launch(MainActivity::class.java).use { scenario -> scenario.onActivity(block) }
    }

    @Test fun startsTheConfiguredKioskUrlWithScreenOn() = launch { activity ->
        assertTrue(activity.window.attributes.flags and WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON != 0)
        val webView = activity.webViewForTest()!!
        val url = shadowOf(webView).lastLoadedUrl
        assertTrue("loads $url", url.startsWith(BuildConfig.KIOSK_URL))
        assertTrue(url.contains("idle=${BuildConfig.IDLE_SECONDS}"))
        // Branded loading overlay instead of a white page.
        assertTrue(activity.overlayVisibleForTest())
    }

    @Test fun webViewIsLockedDown() = launch { activity ->
        val settings = activity.webViewForTest()!!.settings
        assertTrue(settings.javaScriptEnabled)
        assertTrue(settings.domStorageEnabled)
        assertFalse(settings.supportZoom())
        assertFalse(settings.builtInZoomControls)
        assertFalse(settings.displayZoomControls)
        assertFalse(settings.allowFileAccess)
        assertFalse(settings.allowContentAccess)
        assertFalse(settings.javaScriptCanOpenWindowsAutomatically)
        assertTrue(settings.userAgentString.contains("ROFEKiosk/"))
    }

    @Test fun backNeverClosesTheApp() = launch { activity ->
        activity.onBackPressedDispatcher.onBackPressed()
        assertFalse(activity.isFinishing)
        activity.simulateReadyForTest()
        repeat(3) { activity.onBackPressedDispatcher.onBackPressed() }
        assertFalse(activity.isFinishing)
    }

    @Test fun rotationAndKeyboardNeverRecreateTheWebView() {
        val context = ApplicationProvider.getApplicationContext<android.content.Context>()
        val info = context.packageManager.getActivityInfo(ComponentName(context, MainActivity::class.java), 0)
        for (flag in listOf(ActivityInfo.CONFIG_ORIENTATION, ActivityInfo.CONFIG_SCREEN_SIZE, ActivityInfo.CONFIG_SMALLEST_SCREEN_SIZE, ActivityInfo.CONFIG_KEYBOARD_HIDDEN, ActivityInfo.CONFIG_SCREEN_LAYOUT)) {
            assertTrue("configChanges incluye $flag", info.configChanges and flag != 0)
        }
        assertEquals(ActivityInfo.SCREEN_ORIENTATION_FULL_USER, info.screenOrientation)
    }

    @Test fun networkErrorShowsRetryAndRecovers() = launch { activity ->
        activity.simulateMainFrameErrorForTest(offline = true)
        assertTrue(activity.overlayVisibleForTest())
        assertEquals(View.INVISIBLE, activity.webViewForTest()!!.visibility)
        assertEquals(View.VISIBLE, activity.findViewById<View>(R.id.overlay_retry).visibility)
        activity.findViewById<View>(R.id.overlay_retry).performClick()
        activity.simulateReadyForTest()
        assertFalse(activity.overlayVisibleForTest())
        assertEquals(View.VISIBLE, activity.webViewForTest()!!.visibility)
    }

    @Test fun readyMessageOnlyFromTheRofeOrigin() = launch { activity ->
        val origin = Uri.parse(BuildConfig.KIOSK_URL).let { "${it.scheme}://${it.authority}" }
        activity.handleWebMessageForTest("""{"type":"ready","webVersion":"1.0.0+test"}""", "https://evil.example")
        assertTrue(activity.overlayVisibleForTest())
        activity.handleWebMessageForTest("""{"type":"ready","webVersion":"1.0.0+test"}""", origin)
        assertFalse(activity.overlayVisibleForTest())
        assertEquals("1.0.0+test", activity.webVersion)
    }

    @Test fun externalNavigationIsBlocked() = launch { activity ->
        val webView = activity.webViewForTest()!!
        val client = shadowOf(webView).webViewClient
        assertTrue(client.shouldOverrideUrlLoading(webView, request("https://evil.example/")))
        assertTrue(client.shouldOverrideUrlLoading(webView, request("intent://scan/#Intent;end")))
        assertFalse(client.shouldOverrideUrlLoading(webView, request(BuildConfig.KIOSK_URL)))
        assertEquals(403, client.shouldInterceptRequest(webView, request("https://tracker.example/p.gif", mainFrame = false))!!.statusCode)
    }

    @Test fun longPressOpensThePinSetupWhenNoPinExists() = launch { activity ->
        activity.requestAdminForTest()
        val dialog = ShadowDialog.getLatestDialog()
        assertNotNull(dialog)
        assertTrue(dialog.isShowing)
    }

    private fun request(url: String, mainFrame: Boolean = true) = object : WebResourceRequest {
        override fun getUrl(): Uri = Uri.parse(url)
        override fun isForMainFrame() = mainFrame
        override fun isRedirect() = false
        override fun hasGesture() = true
        override fun getMethod() = "GET"
        override fun getRequestHeaders(): Map<String, String> = emptyMap()
    }
}
