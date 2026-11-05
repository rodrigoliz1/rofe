package com.rofe.kiosk.admin

import android.app.admin.DeviceAdminReceiver
import android.content.Context
import android.content.Intent
import com.rofe.kiosk.KioskLog

/**
 * Device-admin component required to make ROFE the Device Owner of a dedicated tablet:
 *   adb shell dpm set-device-owner com.rofe.kiosk/.admin.KioskDeviceAdminReceiver
 * See android-kiosk/README.md. It declares no extra policies.
 */
class KioskDeviceAdminReceiver : DeviceAdminReceiver() {
    override fun onEnabled(context: Context, intent: Intent) = KioskLog.i("Administrador de dispositivo activado")
    override fun onDisabled(context: Context, intent: Intent) = KioskLog.i("Administrador de dispositivo desactivado")
    override fun onLockTaskModeEntering(context: Context, intent: Intent, pkg: String) = KioskLog.i("Entrando a Lock Task")
    override fun onLockTaskModeExiting(context: Context, intent: Intent) = KioskLog.i("Saliendo de Lock Task")
}
