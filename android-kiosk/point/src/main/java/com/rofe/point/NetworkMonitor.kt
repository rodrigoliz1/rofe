package com.rofe.point

import android.content.Context
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.os.Handler
import android.os.Looper
import com.rofe.point.core.Connection

/** Observes Android's validated network. This is not a Mercado Pago reachability or payment test. */
internal class NetworkMonitor(context: Context, private val changed: (Connection) -> Unit) {
    private val manager = context.getSystemService(ConnectivityManager::class.java)
    private val main = Handler(Looper.getMainLooper())
    private var active = false
    private var registered = false
    private val callback = object : ConnectivityManager.NetworkCallback() {
        override fun onAvailable(network: Network) = scheduleRefresh()
        override fun onLost(network: Network) = scheduleRefresh()
        override fun onCapabilitiesChanged(network: Network, capabilities: NetworkCapabilities) = scheduleRefresh()
        override fun onUnavailable() = scheduleRefresh()
    }

    fun start() {
        if (active) return
        active = true
        try {
            manager.registerDefaultNetworkCallback(callback)
            registered = true
            refresh()
        } catch (_: Exception) {
            changed(Connection.UNKNOWN)
        }
    }

    fun stop() {
        active = false
        main.removeCallbacksAndMessages(null)
        if (registered) {
            try { manager.unregisterNetworkCallback(callback) } catch (_: Exception) { /* No user data in logs. */ }
            registered = false
        }
    }

    private fun scheduleRefresh() { main.post { if (active) refresh() } }

    private fun refresh() {
        val result = try {
            val capabilities = manager.getNetworkCapabilities(manager.activeNetwork)
            when {
                capabilities == null -> Connection.OFFLINE
                capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED) -> Connection.AVAILABLE
                else -> Connection.OFFLINE
            }
        } catch (_: Exception) { Connection.UNKNOWN }
        changed(result)
    }
}
