package com.rofe.kiosk.core

import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class PinHasherTest {
    @Test fun verifiesOnlyTheRightPin() {
        val encoded = PinHasher.encode("482915", iterations = 10_000)
        assertTrue(PinHasher.verify("482915", encoded))
        assertFalse(PinHasher.verify("482916", encoded))
        assertFalse(encoded.contains("482915"))
    }

    @Test fun saltsEveryHash() {
        assertNotEquals(PinHasher.encode("482915", 10_000), PinHasher.encode("482915", 10_000))
    }

    @Test fun rejectsWeakOrMalformedInput() {
        assertFalse(PinHasher.isValidPin("1234"))
        assertFalse(PinHasher.isValidPin("12a456"))
        assertTrue(PinHasher.isValidPin("123456"))
        assertFalse(PinHasher.verify("123456", "garbage"))
        assertFalse(PinHasher.verify("123456", "10:AAAA:BBBB"))
        assertFalse(PinHasher.verify("123456", "120000:%%%:BBBB"))
    }
}
