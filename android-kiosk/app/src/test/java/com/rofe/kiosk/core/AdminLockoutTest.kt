package com.rofe.kiosk.core

import org.junit.Assert.assertEquals
import org.junit.Test

class AdminLockoutTest {
    private var now = 1_000_000L
    private val store = object : AdminLockout.Store { override var failures = 0; override var lockedUntil = 0L }
    private val lockout = AdminLockout(store) { now }

    @Test fun locksAfterFiveFailuresAndBacksOff() {
        repeat(4) { assertEquals(0L, lockout.recordFailure()) }
        assertEquals(30_000L, lockout.recordFailure())
        now += 30_000
        assertEquals(0L, lockout.remainingMs())
        assertEquals(60_000L, lockout.recordFailure())
        repeat(10) { lockout.recordFailure() }
        assertEquals(AdminLockout.MAX_LOCK_MS, lockout.remainingMs())
    }

    @Test fun successResetsTheCounter() {
        repeat(5) { lockout.recordFailure() }
        lockout.recordSuccess()
        assertEquals(0L, lockout.remainingMs())
        assertEquals(0L, lockout.recordFailure())
    }
}
