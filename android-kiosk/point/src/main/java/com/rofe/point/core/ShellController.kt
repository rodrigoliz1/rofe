package com.rofe.point.core

/** Main-thread controller. Resume is not proof of payment, cancellation, expiration or host readiness. */
class ShellController(private val host: MainAppHost, private val changed: (ShellState) -> Unit) {
    var state = ShellState()
        private set
    private var generation = 0L

    fun resume() {
        state = state.copy(foreground = true)
        refreshHost()
    }

    fun pause() {
        generation++
        update(state.copy(foreground = false, inspecting = false))
    }

    fun connectionChanged(connection: Connection) = update(state.copy(connection = connection))

    fun refreshHost() {
        if (!state.foreground) return
        val request = ++generation
        update(state.copy(inspecting = true))
        try {
            host.inspect { result ->
                if (state.foreground && generation == request && state.inspecting) {
                    update(state.copy(host = result, inspecting = false))
                }
            }
        } catch (_: Exception) {
            if (generation == request) update(state.copy(host = HostStatus.UNAVAILABLE, inspecting = false))
        }
    }

    fun inspectionTimedOut() {
        if (!state.foreground || !state.inspecting) return
        generation++
        update(state.copy(host = HostStatus.UNAVAILABLE, inspecting = false))
    }

    private fun update(next: ShellState) {
        state = next
        changed(next)
    }
}
