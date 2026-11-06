package com.rofe.point

import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.os.Looper
import androidx.test.core.app.ApplicationProvider
import com.rofe.point.core.Connection
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.Shadows.shadowOf
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class NetworkMonitorTest {
    @Test fun connectionLossAndRecoveryUpdateWithoutActivityRestart() {
        val context = ApplicationProvider.getApplicationContext<PointApplication>()
        val manager = context.getSystemService(ConnectivityManager::class.java)
        val shadow = shadowOf(manager)
        val states = mutableListOf<Connection>()
        val monitor = NetworkMonitor(context) { states += it }
        monitor.start()
        monitor.start()
        assertEquals(1, shadow.networkCallbacks.size)
        val callback = shadow.networkCallbacks.single()
        val network = manager.activeNetwork!!
        val capabilities = NetworkCapabilities()
        shadowOf(capabilities).addCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED)
        shadow.setNetworkCapabilities(network, capabilities)
        callback.onCapabilitiesChanged(network, capabilities)
        shadowOf(Looper.getMainLooper()).idle()
        assertEquals(Connection.AVAILABLE, states.last())
        shadowOf(capabilities).removeCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED)
        callback.onCapabilitiesChanged(network, capabilities)
        shadowOf(Looper.getMainLooper()).idle()
        assertEquals(Connection.OFFLINE, states.last())
        monitor.stop()
        assertTrue(shadow.networkCallbacks.isEmpty())
        val count = states.size
        callback.onLost(network)
        shadowOf(Looper.getMainLooper()).idle()
        assertEquals(count, states.size)
    }
}
