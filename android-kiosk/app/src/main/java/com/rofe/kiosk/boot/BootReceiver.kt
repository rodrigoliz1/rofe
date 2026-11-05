package com.rofe.kiosk.boot

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import com.rofe.kiosk.KioskLog
import com.rofe.kiosk.KioskPrefs
import com.rofe.kiosk.MainActivity

/**
 * Opens ROFE after boot or after an APK update.
 *
 * Android 10+ blocks activity starts from the background for normal apps. The launch below
 * is allowed when ROFE is Device Owner (exempt) — the recommended setup. Without Device Owner,
 * set ROFE as the Home app (admin menu → "Usar ROFE como inicio") so Android opens it itself.
 */
class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val action = intent.action ?: return
        if (action !in ACTIONS) return
        if (!KioskPrefs(context).autostart) return
        try {
            context.startActivity(
                Intent(context, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_REORDER_TO_FRONT),
            )
        } catch (error: Exception) {
            KioskLog.w("Android no permitió abrir ROFE tras el arranque", error)
        }
    }

    private companion object {
        val ACTIONS = setOf(
            Intent.ACTION_BOOT_COMPLETED,
            Intent.ACTION_MY_PACKAGE_REPLACED,
            "android.intent.action.QUICKBOOT_POWERON",
            "com.htc.intent.action.QUICKBOOT_POWERON",
        )
    }
}
