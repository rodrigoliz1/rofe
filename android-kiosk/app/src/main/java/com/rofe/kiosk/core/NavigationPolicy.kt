package com.rofe.kiosk.core

import java.net.URI

/**
 * Allowlist for the kiosk WebView.
 * - Navigations (pages) only within the ROFE origin: links to other sites, intent:, tel:,
 *   market:, file: and javascript: URLs never open.
 * - Subresources from the ROFE origin, the configured resource hosts, data: and blob:.
 */
class NavigationPolicy(private val config: KioskConfig) {

    fun isAppOrigin(url: String?): Boolean {
        val uri = parse(url) ?: return false
        val scheme = uri.scheme?.lowercase() ?: return false
        val host = uri.host?.lowercase() ?: return false
        val origin = if (uri.port == -1) "$scheme://$host" else "$scheme://$host:${uri.port}"
        return origin == config.origin
    }

    fun allowNavigation(url: String?): Boolean = isAppOrigin(url) || url == "about:blank"

    fun allowResource(url: String?): Boolean {
        val uri = parse(url) ?: return false
        return when (uri.scheme?.lowercase()) {
            "data", "blob" -> true
            "https" -> isAppOrigin(url) || hostAllowed(uri.host?.lowercase())
            "http" -> config.allowCleartext && isAppOrigin(url)
            else -> false
        }
    }

    private fun hostAllowed(host: String?): Boolean {
        if (host == null) return false
        if (host == config.host) return true
        return config.resourceHosts.any { rule ->
            if (rule.startsWith("*.")) host.endsWith(rule.substring(1)) && host.length > rule.length - 1 else host == rule
        }
    }

    private fun parse(url: String?): URI? = try { url?.let(::URI) } catch (_: Exception) { null }
}
