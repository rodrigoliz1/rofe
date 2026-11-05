package com.rofe.kiosk.core

import java.net.URI

/** A capability scoped to Barista's current top-level page, never to resource hosts. */
object CameraPolicy {
    const val VIDEO = "android.webkit.resource.VIDEO_CAPTURE"
    fun permits(enabled: Boolean, configuredOrigin: String?, requestOrigin: String?, pageUrl: String?, resources: Array<String>): Boolean {
        if (!enabled || configuredOrigin == null || resources.toSet() != setOf(VIDEO)) return false
        return runCatching {
            fun origin(uri: URI): String {
                require(uri.rawUserInfo == null && uri.host != null)
                val port = if (uri.port == -1 || uri.scheme == "https" && uri.port == 443 || uri.scheme == "http" && uri.port == 80) "" else ":${uri.port}"
                return "${uri.scheme.lowercase()}://${uri.host.lowercase()}$port"
            }
            val configured = URI(configuredOrigin)
            val request = URI(requestOrigin ?: return false)
            val page = URI(pageUrl ?: return false)
            origin(configured) == origin(request) && origin(configured) == origin(page) && page.path.trimEnd('/') == "/barista"
        }.getOrDefault(false)
    }
}
