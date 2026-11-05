package com.rofe.kiosk.admin

import android.app.ActivityManager
import android.content.ComponentName
import android.content.Intent
import android.content.pm.PackageManager
import android.content.res.Configuration
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import android.text.InputFilter
import android.text.InputType
import android.util.TypedValue
import android.view.Gravity
import android.view.Window
import android.view.WindowManager
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.webkit.WebViewCompat
import com.rofe.kiosk.BuildConfig
import com.rofe.kiosk.KioskLog
import com.rofe.kiosk.KioskPrefs
import com.rofe.kiosk.R
import com.rofe.kiosk.core.AdminLockout
import com.rofe.kiosk.core.KioskConfig
import com.rofe.kiosk.core.PinHasher
import java.text.DateFormat
import java.util.Date
import java.util.concurrent.Executors

/**
 * Hidden administration: hold the ROFÉ logo for 5 seconds → PIN → this menu.
 * There is no visible exit button anywhere in the customer UI.
 */
class AdminMenu(
    private val activity: AppCompatActivity,
    private val prefs: KioskPrefs,
    private val lockTask: LockTaskController,
    private val host: Host,
) {
    interface Host {
        val webVersion: String?
        val lastLoadedAt: Long
        val kioskConfig: KioskConfig?
        val configurationError: String?
        val isPageReady: Boolean
        fun reloadKiosk()
        fun restartWebView()
        fun resetCustomerSession()
        fun openStaffAccess()
        fun clearCache()
        fun clearLocalData()
        fun onKioskModeChanged()
        fun onUrlChanged()
        fun leaveLockTaskForSettings()
        fun onAdminDialogShown(window: Window)
    }

    private val lockout = AdminLockout(prefs) { System.currentTimeMillis() }
    // PBKDF2 takes a moment on a modest tablet: never on the UI thread.
    private val executor = Executors.newSingleThreadExecutor()
    private val main = Handler(Looper.getMainLooper())
    private var current: AlertDialog? = null

    fun isTemporaryExit() = prefs.temporaryExitUntil > System.currentTimeMillis()

    fun requestAccess() {
        if (current?.isShowing == true) return
        val hash = prefs.pinHash
        if (hash == null) showCreatePin(firstTime = true) else showPinPrompt(hash)
    }

    // ------------------------------------------------------------------ PIN

    private fun showPinPrompt(hash: String) {
        val locked = lockout.remainingMs()
        if (locked > 0) {
            show(builder().setTitle(R.string.admin_pin_title).setMessage(activity.getString(R.string.admin_locked, seconds(locked))).setPositiveButton(R.string.admin_ok, null).create())
            return
        }
        val input = pinField(R.string.admin_pin_hint)
        val dialog = builder()
            .setTitle(R.string.admin_pin_title)
            .setView(padded(input))
            .setPositiveButton(R.string.admin_enter, null)
            .setNegativeButton(R.string.admin_cancel, null)
            .create()
        dialog.setOnShowListener {
            val enter = dialog.getButton(AlertDialog.BUTTON_POSITIVE)
            enter.setOnClickListener {
                val pin = input.text.toString()
                input.text.clear()
                if (pin.isEmpty()) return@setOnClickListener
                enter.isEnabled = false
                executor.execute {
                    val valid = PinHasher.verify(pin, hash)
                    main.post {
                        enter.isEnabled = true
                        if (valid) {
                            lockout.recordSuccess()
                            dialog.dismiss()
                            showMenu()
                        } else {
                            val lockedFor = lockout.recordFailure()
                            KioskLog.w("PIN administrativo incorrecto")
                            if (lockedFor > 0) {
                                dialog.dismiss()
                                Toast.makeText(activity, activity.getString(R.string.admin_locked, seconds(lockedFor)), Toast.LENGTH_LONG).show()
                            } else {
                                input.error = activity.getString(R.string.admin_pin_wrong)
                            }
                        }
                    }
                }
            }
        }
        show(dialog, keyboard = true)
    }

    /**
     * First run (no PIN provisioned at build time) or "Cambiar PIN". The first-run prompt is
     * meant to be completed by the person installing the tablet, before it faces customers.
     */
    private fun showCreatePin(firstTime: Boolean) {
        val first = pinField(R.string.admin_new_pin_hint)
        val second = pinField(R.string.admin_repeat_pin_hint)
        val layout = LinearLayout(activity).apply {
            orientation = LinearLayout.VERTICAL
            addView(TextView(activity).apply { setText(if (firstTime) R.string.admin_create_pin_intro else R.string.admin_change_pin_intro); setPadding(0, 0, 0, dp(12)) })
            addView(first)
            addView(second)
        }
        val dialog = builder()
            .setTitle(if (firstTime) R.string.admin_create_pin_title else R.string.admin_change_pin)
            .setView(padded(layout))
            .setPositiveButton(R.string.admin_save, null)
            .setNegativeButton(R.string.admin_cancel, null)
            .create()
        dialog.setOnShowListener {
            val save = dialog.getButton(AlertDialog.BUTTON_POSITIVE)
            save.setOnClickListener {
                val pin = first.text.toString()
                when {
                    !PinHasher.isValidPin(pin) -> first.error = activity.getString(R.string.admin_pin_rules)
                    pin != second.text.toString() -> second.error = activity.getString(R.string.admin_pin_mismatch)
                    else -> {
                        save.isEnabled = false
                        executor.execute {
                            val encoded = PinHasher.encode(pin)
                            main.post {
                                prefs.savePinHash(encoded)
                                lockout.recordSuccess()
                                dialog.dismiss()
                                Toast.makeText(activity, R.string.admin_pin_saved, Toast.LENGTH_SHORT).show()
                                if (firstTime) showMenu()
                            }
                        }
                    }
                }
            }
        }
        show(dialog, keyboard = true)
    }

    // ------------------------------------------------------------------ menu

    private fun showMenu() {
        val list = LinearLayout(activity).apply { orientation = LinearLayout.VERTICAL }
        list.addView(TextView(activity).apply {
            text = statusText()
            setTextIsSelectable(false)
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 14f)
            setLineSpacing(0f, 1.25f)
            setPadding(0, 0, 0, dp(16))
        })
        lateinit var dialog: AlertDialog
        fun action(label: String, run: () -> Unit) = list.addView(Button(activity).apply {
            text = label
            isAllCaps = false
            minHeight = dp(52)
            gravity = Gravity.START or Gravity.CENTER_VERTICAL
            setOnClickListener { dialog.dismiss(); run() }
        })

        val temporary = isTemporaryExit()
        action(activity.getString(R.string.admin_back_to_kiosk)) {
            if (temporary) { prefs.temporaryExitUntil = 0; host.onKioskModeChanged() }
        }
        action(activity.getString(R.string.admin_reload)) { host.reloadKiosk() }
        action(activity.getString(R.string.admin_new_customer)) { host.resetCustomerSession() }
        action(activity.getString(R.string.admin_staff_access)) { host.openStaffAccess() }
        action(activity.getString(R.string.admin_wifi)) {
            openSettings(if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) Settings.Panel.ACTION_WIFI else Settings.ACTION_WIFI_SETTINGS)
        }
        if (!temporary) {
            action(activity.getString(R.string.admin_temporary_exit)) {
                prefs.temporaryExitUntil = System.currentTimeMillis() + TEMPORARY_EXIT_MS
                host.onKioskModeChanged()
                main.postDelayed({ host.onKioskModeChanged() }, TEMPORARY_EXIT_MS + 1_000)
                Toast.makeText(activity, R.string.admin_temporary_exit_done, Toast.LENGTH_LONG).show()
            }
        }
        action(activity.getString(if (prefs.kioskModeEnabled) R.string.admin_kiosk_on else R.string.admin_kiosk_off)) {
            prefs.kioskModeEnabled = !prefs.kioskModeEnabled
            host.onKioskModeChanged()
        }
        action(activity.getString(if (prefs.autostart) R.string.admin_autostart_on else R.string.admin_autostart_off)) { prefs.autostart = !prefs.autostart }
        action(activity.getString(if (prefs.haptics) R.string.admin_haptics_on else R.string.admin_haptics_off)) {
            prefs.haptics = !prefs.haptics
            host.reloadKiosk()
        }
        if (!lockTask.isDeviceOwner) {
            action(activity.getString(R.string.admin_set_home)) {
                activity.packageManager.setComponentEnabledSetting(
                    ComponentName(activity.packageName, "com.rofe.kiosk.HomeAlias"),
                    PackageManager.COMPONENT_ENABLED_STATE_ENABLED,
                    PackageManager.DONT_KILL_APP,
                )
                openSettings(Settings.ACTION_HOME_SETTINGS)
            }
        }
        action(activity.getString(R.string.admin_battery)) { openSettings(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS) }
        action(activity.getString(R.string.admin_android_settings)) { openSettings(Settings.ACTION_SETTINGS) }
        action(activity.getString(R.string.admin_restart_webview)) { host.restartWebView() }
        action(activity.getString(R.string.admin_clear_cache)) { host.clearCache() }
        action(activity.getString(R.string.admin_clear_data)) {
            confirm(R.string.admin_clear_data, R.string.admin_clear_data_warning) { host.clearLocalData() }
        }
        action(activity.getString(R.string.admin_change_pin)) { showCreatePin(firstTime = false) }
        if (BuildConfig.DEBUG) {
            action(activity.getString(R.string.admin_debug_url)) { showDebugUrl() }
        }
        if (lockTask.isDeviceOwner) {
            action(activity.getString(R.string.admin_remove_owner)) {
                confirm(R.string.admin_remove_owner, R.string.admin_remove_owner_warning) {
                    lockTask.clearDeviceOwner()
                    prefs.kioskModeEnabled = false
                    host.onKioskModeChanged()
                }
            }
        }

        dialog = builder()
            .setTitle(R.string.admin_menu_title)
            .setView(ScrollView(activity).apply { addView(padded(list)) })
            .setNegativeButton(R.string.admin_close, null)
            .create()
        show(dialog)
    }

    private fun statusText(): String {
        val config = host.kioskConfig
        val loaded = host.lastLoadedAt.takeIf { it > 0 }?.let { DateFormat.getTimeInstance(DateFormat.MEDIUM).format(Date(it)) } ?: "—"
        val webView = runCatching { WebViewCompat.getCurrentWebViewPackage(activity)?.versionName }.getOrNull() ?: "—"
        val metrics = activity.resources.configuration
        val orientation = if (metrics.orientation == Configuration.ORIENTATION_PORTRAIT) "vertical" else "horizontal"
        return buildString {
            appendLine("Conexión: ${connectionLabel()}")
            appendLine("APK: ${BuildConfig.VERSION_NAME} (${BuildConfig.VERSION_CODE}) · ${BuildConfig.BUILD_TYPE}")
            appendLine("Web: ${host.webVersion ?: if (host.isPageReady) "cargada" else "sin cargar"}")
            appendLine("URL: ${config?.startUrl ?: "inválida: ${host.configurationError}"}")
            appendLine("Última carga: $loaded")
            appendLine("Modo: ${lockTask.describe()}${if (isTemporaryExit()) " · salida temporal" else ""}")
            appendLine("Memoria: ${memoryLabel()}")
            appendLine("WebView: $webView")
            append("Pantalla: ${metrics.screenWidthDp}×${metrics.screenHeightDp} dp · $orientation")
        }
    }

    private fun connectionLabel(): String {
        val manager = activity.getSystemService(ConnectivityManager::class.java) ?: return "desconocida"
        val capabilities = manager.getNetworkCapabilities(manager.activeNetwork) ?: return "sin red"
        val transport = when {
            capabilities.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) -> "Wi-Fi"
            capabilities.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET) -> "Ethernet"
            capabilities.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR) -> "datos móviles"
            else -> "red"
        }
        return if (capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED)) "$transport con Internet" else "$transport sin Internet"
    }

    private fun memoryLabel(): String {
        val info = ActivityManager.MemoryInfo()
        activity.getSystemService(ActivityManager::class.java)?.getMemoryInfo(info)
        val runtime = Runtime.getRuntime()
        val app = (runtime.totalMemory() - runtime.freeMemory()) / MB
        return "${info.availMem / MB} MB libres de ${info.totalMem / MB} MB · app $app MB"
    }

    private fun showDebugUrl() {
        val input = EditText(activity).apply {
            inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_URI
            setText(prefs.debugUrlOverride ?: BuildConfig.KIOSK_URL)
            setSelectAllOnFocus(true)
        }
        val dialog = builder()
            .setTitle(R.string.admin_debug_url)
            .setMessage(R.string.admin_debug_url_help)
            .setView(padded(input))
            .setPositiveButton(R.string.admin_save) { _, _ ->
                val value = input.text.toString().trim()
                prefs.debugUrlOverride = value.takeIf { it.isNotEmpty() && it != BuildConfig.KIOSK_URL }
                host.onUrlChanged()
            }
            .setNeutralButton(R.string.admin_debug_url_reset) { _, _ -> prefs.debugUrlOverride = null; host.onUrlChanged() }
            .setNegativeButton(R.string.admin_cancel, null)
            .create()
        show(dialog, keyboard = true)
    }

    private fun openSettings(action: String) {
        host.leaveLockTaskForSettings()
        try {
            activity.startActivity(Intent(action))
        } catch (error: Exception) {
            KioskLog.w("No se pudo abrir $action", error)
            runCatching { activity.startActivity(Intent(Settings.ACTION_SETTINGS)) }
        }
    }

    private fun confirm(title: Int, message: Int, run: () -> Unit) {
        show(builder().setTitle(title).setMessage(message).setPositiveButton(R.string.admin_continue) { _, _ -> run() }.setNegativeButton(R.string.admin_cancel, null).create())
    }

    // ------------------------------------------------------------------ helpers

    private fun builder() = AlertDialog.Builder(activity, R.style.Theme_Rofe_Dialog)

    private fun show(dialog: AlertDialog, keyboard: Boolean = false) {
        current = dialog
        if (keyboard) dialog.window?.setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_STATE_ALWAYS_VISIBLE)
        dialog.show()
        dialog.window?.let(host::onAdminDialogShown)
    }

    private fun pinField(hint: Int) = EditText(activity).apply {
        setHint(hint)
        inputType = InputType.TYPE_CLASS_NUMBER or InputType.TYPE_NUMBER_VARIATION_PASSWORD
        filters = arrayOf(InputFilter.LengthFilter(12))
        importantForAutofill = android.view.View.IMPORTANT_FOR_AUTOFILL_NO
        minHeight = dp(56)
    }

    private fun padded(view: android.view.View) = LinearLayout(activity).apply {
        orientation = LinearLayout.VERTICAL
        setPadding(dp(24), dp(8), dp(24), dp(8))
        addView(view)
    }

    private fun dp(value: Int) = (value * activity.resources.displayMetrics.density).toInt()
    private fun seconds(ms: Long) = ((ms + 999) / 1000).toString()

    private companion object {
        const val TEMPORARY_EXIT_MS = 10 * 60_000L
        const val MB = 1024L * 1024L
    }
}
