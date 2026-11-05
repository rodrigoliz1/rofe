package com.rofe.kiosk.admin

import android.app.Activity
import android.app.ActivityManager
import android.app.admin.DevicePolicyManager
import android.content.ComponentName
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.os.Build
import com.rofe.kiosk.KioskLog

/**
 * Android Lock Task Mode.
 * - Device Owner (dedicated device): ROFE allowlists itself, starts locked without any prompt,
 *   becomes the persistent Home app and disables the notification shade and keyguard.
 *   The power menu stays available (LOCK_TASK_FEATURE_GLOBAL_ACTIONS) so staff can turn it off.
 * - Not Device Owner: startLockTask() falls back to Android "screen pinning", which the user
 *   confirms once and can leave with Back+Overview. Good for testing, not for customers.
 */
class LockTaskController(private val activity: Activity) {
    private val dpm = activity.getSystemService(DevicePolicyManager::class.java)
    private val am = activity.getSystemService(ActivityManager::class.java)
    val admin = ComponentName(activity, KioskDeviceAdminReceiver::class.java)
    private val homeAlias = ComponentName(activity.packageName, "com.rofe.kiosk.HomeAlias")

    val isDeviceOwner: Boolean get() = runCatching { dpm.isDeviceOwnerApp(activity.packageName) }.getOrDefault(false)
    val isLockTaskPermitted: Boolean get() = runCatching { dpm.isLockTaskPermitted(activity.packageName) }.getOrDefault(false)
    val state: Int get() = runCatching { am.lockTaskModeState }.getOrDefault(ActivityManager.LOCK_TASK_MODE_NONE)
    val isLocked: Boolean get() = state != ActivityManager.LOCK_TASK_MODE_NONE

    fun describe(): String = when {
        state == ActivityManager.LOCK_TASK_MODE_LOCKED -> "Bloqueado (Lock Task, Device Owner)"
        state == ActivityManager.LOCK_TASK_MODE_PINNED -> "Fijado (screen pinning)"
        isDeviceOwner -> "Device Owner · sin bloquear"
        else -> "App normal (sin bloqueo)"
    }

    /** Applies dedicated-device policies. No-op unless ROFE is Device Owner. */
    fun applyDeviceOwnerPolicies(kioskEnabled: Boolean) {
        if (!isDeviceOwner) return
        try {
            dpm.setLockTaskPackages(admin, arrayOf(activity.packageName))
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                dpm.setLockTaskFeatures(admin, DevicePolicyManager.LOCK_TASK_FEATURE_GLOBAL_ACTIONS)
            }
            setHome(kioskEnabled)
            dpm.setStatusBarDisabled(admin, kioskEnabled)
            dpm.setKeyguardDisabled(admin, kioskEnabled)
        } catch (error: SecurityException) {
            KioskLog.w("No se pudieron aplicar las políticas de Device Owner", error)
        }
    }

    /** As Device Owner, ROFE is the Home app: after boot or Home it comes back automatically. */
    private fun setHome(enabled: Boolean) {
        val pm = activity.packageManager
        pm.setComponentEnabledSetting(
            homeAlias,
            if (enabled) PackageManager.COMPONENT_ENABLED_STATE_ENABLED else PackageManager.COMPONENT_ENABLED_STATE_DEFAULT,
            PackageManager.DONT_KILL_APP,
        )
        dpm.clearPackagePersistentPreferredActivities(admin, activity.packageName)
        if (enabled) {
            val filter = IntentFilter(Intent.ACTION_MAIN).apply {
                addCategory(Intent.CATEGORY_HOME)
                addCategory(Intent.CATEGORY_DEFAULT)
            }
            dpm.addPersistentPreferredActivity(admin, filter, homeAlias)
        }
    }

    fun start() {
        if (isLocked) return
        try {
            activity.startLockTask()
        } catch (error: IllegalArgumentException) {
            KioskLog.w("startLockTask rechazado", error)
        } catch (error: SecurityException) {
            KioskLog.w("startLockTask rechazado", error)
        }
    }

    fun stop() {
        if (!isLocked) return
        try {
            activity.stopLockTask()
        } catch (error: Exception) {
            KioskLog.w("stopLockTask rechazado", error)
        }
    }

    /**
     * Development only: removes Device Owner so the tablet can be used normally or the app
     * uninstalled. Irreversible without re-provisioning (adb dpm set-device-owner).
     */
    @Suppress("DEPRECATION")
    fun clearDeviceOwner() {
        if (!isDeviceOwner) return
        stop()
        applyDeviceOwnerPolicies(kioskEnabled = false)
        dpm.setLockTaskPackages(admin, emptyArray())
        dpm.clearDeviceOwnerApp(activity.packageName)
    }
}
