package com.rofe.point

import android.util.Log

/** Fixed vocabulary only: no arbitrary strings, exception messages, payloads or identifiers. */
internal object SafeDiagnostics {
    enum class Event { FOREGROUND, BACKGROUND, HOST_UNAVAILABLE, HOST_REVIEW_REQUIRED, NETWORK_OFFLINE }
    fun record(event: Event) { Log.i("RofePoint", "event=${event.name} build=${BuildConfig.VERSION_CODE}") }
}
