package com.rofe.point

import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.View
import android.view.WindowInsets
import android.view.WindowInsetsController
import android.view.WindowManager
import android.widget.Button
import android.widget.TextView
import androidx.activity.ComponentActivity
import androidx.activity.OnBackPressedCallback
import com.rofe.point.core.Connection
import com.rofe.point.core.HostStatus
import com.rofe.point.core.ShellController
import com.rofe.point.core.ShellState

class MainActivity : ComponentActivity() {
    private val main = Handler(Looper.getMainLooper())
    private lateinit var controller: ShellController
    private lateinit var network: NetworkMonitor
    private var lastLoggedState: ShellState? = null
    private val timeout = Runnable { controller.inspectionTimedOut() }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        setContentView(R.layout.activity_point)
        controller = ShellController((application as PointApplication).host, ::render)
        network = NetworkMonitor(this, controller::connectionChanged)
        findViewById<Button>(R.id.retry).setOnClickListener {
            network.stop()
            network.start()
            controller.refreshHost() // Inspection only. Never creates or resubmits a payment.
        }
        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() { /* Only inside our Activity; never intercept host payment UI. */ }
        })
        render(controller.state)
    }

    override fun onResume() {
        super.onResume()
        SafeDiagnostics.record(SafeDiagnostics.Event.FOREGROUND)
        controller.resume()
        network.start()
        immersive()
    }

    override fun onPause() {
        network.stop()
        main.removeCallbacks(timeout)
        controller.pause()
        SafeDiagnostics.record(SafeDiagnostics.Event.BACKGROUND)
        super.onPause()
    }

    override fun onDestroy() {
        network.stop()
        main.removeCallbacksAndMessages(null)
        super.onDestroy()
    }

    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        if (hasFocus) immersive()
    }

    private fun immersive() {
        window.insetsController?.apply {
            systemBarsBehavior = WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
            hide(WindowInsets.Type.systemBars())
        }
    }

    private fun render(state: ShellState) {
        if (!state.inspecting || !state.foreground) main.removeCallbacks(timeout)
        else if (lastLoggedState?.inspecting != true) main.postDelayed(timeout, 10_000)
        val offline = state.connection == Connection.OFFLINE
        findViewById<TextView>(R.id.status_title).setText(if (offline) R.string.offline_title else R.string.waiting_title)
        findViewById<TextView>(R.id.status_description).setText(if (offline) R.string.offline_description else R.string.waiting_description)
        findViewById<TextView>(R.id.network_status).setText(when (state.connection) {
            Connection.AVAILABLE -> R.string.network_available
            Connection.OFFLINE -> R.string.network_offline
            Connection.CHECKING -> R.string.network_checking
            Connection.UNKNOWN -> R.string.network_unknown
        })
        findViewById<TextView>(R.id.integration_status).setText(when {
            state.inspecting -> R.string.host_checking
            state.host == HostStatus.PROTOTYPE -> R.string.prototype_notice
            state.host == HostStatus.CLIENT_ID_REQUIRED -> R.string.client_id_required
            state.host == HostStatus.UNSUPPORTED_DEVICE -> R.string.unsupported_device
            state.host == HostStatus.UNAVAILABLE -> R.string.host_unavailable
            else -> R.string.homologation_required
        })
        val retry = findViewById<Button>(R.id.retry)
        retry.visibility = if (offline || state.connection == Connection.UNKNOWN || state.host == HostStatus.UNAVAILABLE) View.VISIBLE else View.GONE
        retry.isEnabled = !state.inspecting
        findViewById<View>(R.id.status_group).contentDescription = getString(if (offline) R.string.offline_title else R.string.waiting_title)
        if (state.foreground && state.host != lastLoggedState?.host && !state.inspecting) {
            SafeDiagnostics.record(if (state.host == HostStatus.UNAVAILABLE) SafeDiagnostics.Event.HOST_UNAVAILABLE else SafeDiagnostics.Event.HOST_REVIEW_REQUIRED)
        }
        if (offline && lastLoggedState?.connection != Connection.OFFLINE) SafeDiagnostics.record(SafeDiagnostics.Event.NETWORK_OFFLINE)
        lastLoggedState = state
    }
}
