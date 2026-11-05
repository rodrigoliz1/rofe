package com.rofe.kiosk.core

import java.net.URI
import java.net.URLEncoder

/**
 * Where the kiosk lives and what it may talk to. Built from BuildConfig per build type
 * (debug / staging / release); release and staging are HTTPS-only.
 */
class KioskConfig private constructor(
    val startUrl: String,
    /** scheme://host[:port], the only origin allowed to navigate the WebView. */
    val origin: String,
    val host: String,
    /** Extra resource hosts, exact ("cdn.example.com") or wildcard ("*.supabase.co"). */
    val resourceHosts: List<String>,
    val allowCleartext: Boolean,
) {
    /** The start URL plus kiosk settings for the web app (e.g. `?idle=90`). */
    fun launchUrl(params: Map<String, String>): String {
        if (params.isEmpty()) return startUrl
        val query = params.entries.joinToString("&") { (key, value) -> "${encode(key)}=${encode(value)}" }
        val (base, fragment) = startUrl.split('#', limit = 2).let { it[0] to it.getOrNull(1) }
        val joined = if ('?' in base) "$base&$query" else "$base?$query"
        return if (fragment == null) joined else "$joined#$fragment"
    }

    companion object {
        fun parse(url: String, extraHosts: String, allowCleartext: Boolean): KioskConfig {
            val uri = try { URI(url.trim()) } catch (error: Exception) { throw IllegalArgumentException("URL inválida", error) }
            val scheme = uri.scheme?.lowercase() ?: throw IllegalArgumentException("La URL no tiene esquema")
            require(scheme == "https" || (allowCleartext && scheme == "http")) { "La URL debe usar HTTPS" }
            val host = uri.host?.lowercase()?.takeIf { it.isNotEmpty() } ?: throw IllegalArgumentException("La URL no tiene dominio")
            require(uri.rawUserInfo == null) { "La URL no puede incluir credenciales" }
            val origin = if (uri.port == -1) "$scheme://$host" else "$scheme://$host:${uri.port}"
            val hosts = extraHosts.split(',').map { it.trim().lowercase() }.filter { it.isNotEmpty() && it != "*" && !it.contains('/') }
            return KioskConfig(uri.toString(), origin, host, hosts, allowCleartext)
        }

        private fun encode(value: String) = URLEncoder.encode(value, Charsets.UTF_8.name())
    }
}
