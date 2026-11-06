package com.rofe.point

import android.content.Intent
import android.content.pm.ApplicationInfo
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.view.View
import android.view.WindowManager
import android.widget.TextView
import androidx.test.core.app.ApplicationProvider
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.Robolectric
import org.robolectric.RobolectricTestRunner
import org.robolectric.Shadows.shadowOf
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class MainActivityTest {
    @Test fun nativeWaitingScreenContainsNoAdministrativeOrPaymentActions() {
        Robolectric.buildActivity(MainActivity::class.java).setup().use { owner ->
            val activity = owner.get()
            assertEquals("ROFÉ", activity.findViewById<View>(R.id.point_root).findBrand())
            assertTrue(activity.window.attributes.flags and WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON != 0)
            assertNull(shadowOf(activity).nextStartedActivity)
            assertEquals(1, buttonCount(activity.findViewById(R.id.point_root))) // Safe read-only retry, no hidden admin.
        }
    }

    @Test fun offlineScreenRecoversAutomaticallyFromValidatedAndroidNetwork() {
        Robolectric.buildActivity(MainActivity::class.java).setup().use { owner ->
            val activity = owner.get()
            val manager = activity.getSystemService(ConnectivityManager::class.java)
            val network = manager.activeNetwork!!
            val capabilities = NetworkCapabilities()
            shadowOf(capabilities).addCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED)
            shadowOf(manager).setNetworkCapabilities(network, capabilities)
            // A lifecycle resume obtains the current network even if events were missed while suspended.
            owner.pause().resume()
            assertEquals(activity.getString(R.string.waiting_title), activity.findViewById<TextView>(R.id.status_title).text)
            assertEquals(activity.getString(R.string.network_available), activity.findViewById<TextView>(R.id.network_status).text)
        }
    }

    @Test fun recreationAndBackNeverStartSettingsHostOrNewPayments() {
        Robolectric.buildActivity(MainActivity::class.java).setup().use { owner ->
            owner.recreate()
            val activity = owner.get()
            activity.onBackPressedDispatcher.onBackPressed()
            activity.onWindowFocusChanged(true)
            assertFalse(activity.isFinishing)
            assertNull(shadowOf(activity).nextStartedActivity)
            assertNotNull(activity.findViewById<View>(R.id.status_title))
        }
    }

    @Test fun incomingUntrustedExtrasNeverBecomePaymentOrAdminCommands() {
        val intent = Intent(ApplicationProvider.getApplicationContext(), MainActivity::class.java)
            .putExtra("admin", true).putExtra("amount", "100").putExtra("callback", "https://untrusted.example")
        Robolectric.buildActivity(MainActivity::class.java, intent).setup().use { owner ->
            assertNull(shadowOf(owner.get()).nextStartedActivity)
        }
    }

    @Test fun mergedManifestHasNoHardwareOrAdministrativePrivileges() {
        val app = ApplicationProvider.getApplicationContext<PointApplication>()
        val info = app.packageManager.getPackageInfo(app.packageName, android.content.pm.PackageManager.GET_PERMISSIONS)
        val allowed = setOf("android.permission.ACCESS_NETWORK_STATE", "android.permission.INTERNET", "${app.packageName}.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION")
        assertTrue(info.requestedPermissions.orEmpty().toSet().subtract(allowed).isEmpty())
        assertEquals(0, app.applicationInfo.flags and ApplicationInfo.FLAG_ALLOW_BACKUP)
        assertEquals(0, app.applicationInfo.flags and ApplicationInfo.FLAG_USES_CLEARTEXT_TRAFFIC)
        val homes = app.packageManager.queryIntentActivities(Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_HOME), 0)
        assertEquals(BuildConfig.FLAVOR == "mainapp", homes.any { it.activityInfo.packageName == app.packageName })
    }

    private fun View.findBrand(): String? {
        if (this is TextView && text.toString() == "ROFÉ") return text.toString()
        if (this is android.view.ViewGroup) for (i in 0 until childCount) getChildAt(i).findBrand()?.let { return it }
        return null
    }
    private fun buttonCount(view: View): Int = (if (view is android.widget.Button) 1 else 0) +
        (if (view is android.view.ViewGroup) (0 until view.childCount).sumOf { buttonCount(view.getChildAt(it)) } else 0)
}
