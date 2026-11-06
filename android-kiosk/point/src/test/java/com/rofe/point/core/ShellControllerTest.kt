package com.rofe.point.core

import org.junit.Assert.*
import org.junit.Test

class ShellControllerTest {
    private class Host : MainAppHost {
        val callbacks = mutableListOf<(HostStatus) -> Unit>()
        override fun inspect(callback: (HostStatus) -> Unit) { callbacks += callback }
    }
    private val host = Host()
    private val controller = ShellController(host) {}

    @Test fun foregroundInspectsOnlyOnceAndNeverClaimsPaymentReadiness() {
        controller.resume()
        assertEquals(1, host.callbacks.size)
        host.callbacks.single()(HostStatus.HOMOLOGATION_REQUIRED)
        assertEquals(HostStatus.HOMOLOGATION_REQUIRED, controller.state.host)
        assertFalse(controller.state.inspecting)
    }

    @Test fun nativeUiInterruptionYieldsAndReturnOnlyRestoresShell() {
        controller.resume()
        host.callbacks.last()(HostStatus.HOMOLOGATION_REQUIRED)
        controller.pause()
        assertFalse(controller.state.foreground)
        controller.resume()
        assertEquals(2, host.callbacks.size)
        assertTrue(controller.state.foreground)
        assertEquals(HostStatus.HOMOLOGATION_REQUIRED, controller.state.host)
    }

    @Test fun lateNativeCallbackCannotModifyPausedShell() {
        controller.resume()
        controller.pause()
        host.callbacks.single()(HostStatus.UNAVAILABLE)
        assertEquals(HostStatus.PROTOTYPE, controller.state.host)
        assertFalse(controller.state.inspecting)
    }

    @Test fun retryInvalidatesPreviousCallback() {
        controller.resume()
        controller.refreshHost()
        host.callbacks[1](HostStatus.HOMOLOGATION_REQUIRED)
        host.callbacks[0](HostStatus.UNAVAILABLE)
        assertEquals(HostStatus.HOMOLOGATION_REQUIRED, controller.state.host)
    }

    @Test fun duplicateCallbackCannotOverwriteFirstResult() {
        controller.resume()
        host.callbacks[0](HostStatus.HOMOLOGATION_REQUIRED)
        host.callbacks[0](HostStatus.UNAVAILABLE)
        assertEquals(HostStatus.HOMOLOGATION_REQUIRED, controller.state.host)
    }

    @Test fun timeoutAllowsRecoveryAndRejectsStaleResult() {
        controller.resume()
        controller.inspectionTimedOut()
        host.callbacks[0](HostStatus.HOMOLOGATION_REQUIRED)
        assertEquals(HostStatus.UNAVAILABLE, controller.state.host)
        controller.refreshHost()
        host.callbacks[1](HostStatus.HOMOLOGATION_REQUIRED)
        assertEquals(HostStatus.HOMOLOGATION_REQUIRED, controller.state.host)
    }

    @Test fun connectivityDoesNotTriggerSdkRequestsOrFinancialRetries() {
        controller.resume()
        repeat(20) {
            controller.connectionChanged(Connection.OFFLINE)
            controller.connectionChanged(Connection.AVAILABLE)
        }
        assertEquals(1, host.callbacks.size)
        assertEquals(Connection.AVAILABLE, controller.state.connection)
    }

    @Test fun pausePreventsRetryUntilResumed() {
        controller.refreshHost()
        assertEquals(0, host.callbacks.size)
        controller.resume()
        controller.pause()
        controller.refreshHost()
        assertEquals(1, host.callbacks.size)
    }

    @Test fun processRestartDoesNotRestoreOrRepeatFinancialOperations() {
        controller.resume()
        host.callbacks[0](HostStatus.UNAVAILABLE)
        val restarted = ShellController(host) {}
        assertEquals(ShellState(), restarted.state)
        restarted.resume()
        assertTrue(restarted.state.inspecting)
    }

    @Test fun thrownHostFailureBecomesSafeStatus() {
        val controller = ShellController(object : MainAppHost {
            override fun inspect(callback: (HostStatus) -> Unit) { error("raw provider payload must not reach UI") }
        }) {}
        controller.resume()
        assertEquals(HostStatus.UNAVAILABLE, controller.state.host)
        assertFalse(controller.state.inspecting)
    }
}
