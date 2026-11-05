package com.rofe.kiosk

import android.Manifest
import android.net.Uri
import android.view.WindowManager
import android.webkit.PermissionRequest
import androidx.test.core.app.ActivityScenario
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.Shadows.shadowOf
import org.robolectric.annotation.Config

@RunWith(AndroidJUnit4::class)
@Config(sdk = [34])
class BaristaActivityTest {
    private class CameraRequest(private val originUrl: String, private val wanted: Array<String>) : PermissionRequest() {
        var granted: Array<String>? = null
        var denied = false
        override fun getOrigin() = Uri.parse(originUrl)
        override fun getResources() = wanted
        override fun grant(resources: Array<String>) { granted = resources }
        override fun deny() { denied = true }
    }
    @Test fun independentIdentityAndDedicatedRoute() {
        assertEquals("com.rofe.barista.debug", BuildConfig.APPLICATION_ID)
        assertTrue(BuildConfig.BARISTA_MODE)
        assertFalse(BuildConfig.AUTO_START_DEFAULT)
        ActivityScenario.launch(MainActivity::class.java).use { scenario -> scenario.onActivity { activity ->
            assertTrue(activity.window.attributes.flags and WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON != 0)
            val view = activity.webViewForTest()!!
            assertEquals("/barista", Uri.parse(shadowOf(view).lastLoadedUrl).path)
            assertTrue(view.settings.userAgentString.contains("ROFEBarista/"))
        } }
    }
    @Test fun cameraNeverGrantsMicrophoneOrForeignOrigin() {
        ActivityScenario.launch(MainActivity::class.java).use { scenario -> scenario.onActivity { activity ->
            val client = activity.webViewForTest()!!.webChromeClient!!
            val foreign = CameraRequest("https://evil.example", arrayOf(RESOURCE_VIDEO_CAPTURE))
            client.onPermissionRequest(foreign); assertTrue(foreign.denied); assertNull(foreign.granted)
            val mixed = CameraRequest(BuildConfig.KIOSK_URL.substringBefore("/barista"), arrayOf(RESOURCE_VIDEO_CAPTURE, RESOURCE_AUDIO_CAPTURE))
            client.onPermissionRequest(mixed); assertTrue(mixed.denied); assertNull(mixed.granted)
        } }
    }
    @Test fun cameraRequiresRuntimePermissionAndCurrentBaristaPage() {
        val application = ApplicationProvider.getApplicationContext<android.app.Application>()
        shadowOf(application).grantPermissions(Manifest.permission.CAMERA)
        ActivityScenario.launch(MainActivity::class.java).use { scenario -> scenario.onActivity { activity ->
            val view = activity.webViewForTest()!!
            val request = CameraRequest(BuildConfig.KIOSK_URL.substringBefore("/barista"), arrayOf(RESOURCE_VIDEO_CAPTURE))
            view.webChromeClient!!.onPermissionRequest(request)
            assertArrayEquals(arrayOf(RESOURCE_VIDEO_CAPTURE), request.granted)
            assertFalse(request.denied)
        } }
    }
    companion object {
        const val RESOURCE_VIDEO_CAPTURE = PermissionRequest.RESOURCE_VIDEO_CAPTURE
        const val RESOURCE_AUDIO_CAPTURE = PermissionRequest.RESOURCE_AUDIO_CAPTURE
    }
}
