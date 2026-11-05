package com.rofe.kiosk

import android.content.Context
import androidx.core.content.edit
import com.rofe.kiosk.core.AdminLockout
import com.rofe.kiosk.core.PinHasher

/**
 * App-private settings (MODE_PRIVATE, excluded from backups). Holds the admin PIN only as a
 * salted PBKDF2 hash. Device registration tokens stay in the web app's own storage.
 */
class KioskPrefs(context: Context) : AdminLockout.Store {
    private val prefs = context.applicationContext.getSharedPreferences("rofe_kiosk", Context.MODE_PRIVATE)

    /** Stored PIN hash, or the one provisioned at build time (rofe.adminPinHash), or null. */
    val pinHash: String?
        get() = prefs.getString(KEY_PIN, null)?.takeIf(PinHasher::isWellFormed)
            ?: BuildConfig.ADMIN_PIN_HASH.takeIf(PinHasher::isWellFormed)

    fun savePinHash(encoded: String) = prefs.edit { putString(KEY_PIN, encoded) }

    override var failures: Int
        get() = prefs.getInt("pin_failures", 0)
        set(value) = prefs.edit { putInt("pin_failures", value) }

    override var lockedUntil: Long
        get() = prefs.getLong("pin_locked_until", 0)
        set(value) = prefs.edit { putLong("pin_locked_until", value) }

    /** Lock Task (kiosk) mode. Debug starts as a normal app; release starts locked. */
    var kioskModeEnabled: Boolean
        get() = prefs.getBoolean("kiosk_mode", BuildConfig.LOCK_TASK_DEFAULT)
        set(value) = prefs.edit { putBoolean("kiosk_mode", value) }

    var autostart: Boolean
        get() = prefs.getBoolean("autostart", BuildConfig.AUTO_START_DEFAULT)
        set(value) = prefs.edit { putBoolean("autostart", value) }

    var haptics: Boolean
        get() = prefs.getBoolean("haptics", true)
        set(value) = prefs.edit { putBoolean("haptics", value) }

    /** While in the future, kiosk mode is suspended for maintenance by an admin. */
    var temporaryExitUntil: Long
        get() = prefs.getLong("temporary_exit_until", 0)
        set(value) = prefs.edit { putLong("temporary_exit_until", value) }

    /** Debug builds only: point the kiosk at another server (e.g. a LAN dev server). */
    var debugUrlOverride: String?
        get() = if (BuildConfig.DEBUG) prefs.getString("debug_url", null) else null
        set(value) = prefs.edit { if (value.isNullOrBlank()) remove("debug_url") else putString("debug_url", value) }

    private companion object {
        const val KEY_PIN = "admin_pin_hash"
    }
}
