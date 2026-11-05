package com.rofe.kiosk.core

/**
 * Brute-force protection for the admin PIN: after 5 wrong PINs the dialog locks for 30 s,
 * doubling on each further failure up to 15 minutes. State survives app restarts.
 */
class AdminLockout(private val store: Store, private val clock: () -> Long) {
    interface Store {
        var failures: Int
        var lockedUntil: Long
    }

    fun remainingMs(): Long = (store.lockedUntil - clock()).coerceAtLeast(0)

    /** Returns how long the PIN is locked now (0 if it is not). */
    fun recordFailure(): Long {
        store.failures += 1
        val extra = store.failures - FREE_ATTEMPTS
        if (extra >= 0) {
            val lock = (BASE_LOCK_MS shl extra.coerceAtMost(5)).coerceAtMost(MAX_LOCK_MS)
            store.lockedUntil = clock() + lock
        }
        return remainingMs()
    }

    fun recordSuccess() {
        store.failures = 0
        store.lockedUntil = 0
    }

    companion object {
        const val FREE_ATTEMPTS = 5
        const val BASE_LOCK_MS = 30_000L
        const val MAX_LOCK_MS = 15 * 60_000L
    }
}
