package com.rofe.point.core

/** Passive capability inspection only. There is deliberately no create/charge/cancel API here. */
interface MainAppHost {
    fun inspect(callback: (HostStatus) -> Unit)
}

enum class HostStatus {
    PROTOTYPE,
    CLIENT_ID_REQUIRED,
    HOMOLOGATION_REQUIRED,
    UNSUPPORTED_DEVICE,
    UNAVAILABLE,
}

enum class Connection { CHECKING, AVAILABLE, OFFLINE, UNKNOWN }

data class ShellState(
    val foreground: Boolean = false,
    val connection: Connection = Connection.CHECKING,
    val host: HostStatus = HostStatus.PROTOTYPE,
    val inspecting: Boolean = false,
)
