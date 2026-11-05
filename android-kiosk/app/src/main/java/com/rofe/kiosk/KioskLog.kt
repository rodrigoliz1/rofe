package com.rofe.kiosk

import android.util.Log

/**
 * Logging policy: debug builds log details; release builds log only warnings/errors with
 * sanitized content. URLs are reduced to scheme://host/path (no query, tokens or names).
 * Never pass credentials, PINs or customer data here.
 */
object KioskLog {
    private const val TAG = "ROFEKiosk"

    fun d(message: String) { if (BuildConfig.DEBUG) Log.d(TAG, message) }
    fun i(message: String) { if (BuildConfig.DEBUG) Log.i(TAG, message) }
    fun w(message: String, error: Throwable? = null) {
        if (BuildConfig.DEBUG) Log.w(TAG, message, error) else Log.w(TAG, message + (error?.let { " (${it.javaClass.simpleName})" } ?: ""))
    }
    fun e(message: String, error: Throwable? = null) {
        if (BuildConfig.DEBUG) Log.e(TAG, message, error) else Log.e(TAG, message + (error?.let { " (${it.javaClass.simpleName})" } ?: ""))
    }

    fun safeUrl(url: String?): String {
        if (url == null) return "(null)"
        return try {
            val uri = android.net.Uri.parse(url)
            if (uri.scheme == "data" || uri.scheme == "blob") "${uri.scheme}:…" else "${uri.scheme}://${uri.host}${uri.path ?: ""}"
        } catch (_: Exception) { "(url)" }
    }
}
