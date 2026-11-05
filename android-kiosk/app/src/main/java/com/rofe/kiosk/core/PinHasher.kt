package com.rofe.kiosk.core

import java.security.MessageDigest
import java.security.SecureRandom
import java.util.Base64
import javax.crypto.SecretKeyFactory
import javax.crypto.spec.PBEKeySpec

/**
 * Admin PIN storage: PBKDF2-HMAC-SHA256 with a random salt, encoded as "iterations:salt:hash".
 * The PIN itself is never stored nor logged. Verification is constant-time.
 */
object PinHasher {
    const val ITERATIONS = 120_000
    private const val KEY_BITS = 256

    fun isValidPin(pin: String) = pin.length in 6..12 && pin.all { it in '0'..'9' }

    fun encode(pin: String, iterations: Int = ITERATIONS, random: SecureRandom = SecureRandom()): String {
        require(isValidPin(pin)) { "El PIN debe tener entre 6 y 12 dígitos" }
        val salt = ByteArray(16).also(random::nextBytes)
        val encoder = Base64.getEncoder()
        return "$iterations:${encoder.encodeToString(salt)}:${encoder.encodeToString(derive(pin, salt, iterations))}"
    }

    fun verify(pin: String, encoded: String): Boolean {
        val parts = encoded.split(':')
        if (parts.size != 3) return false
        val iterations = parts[0].toIntOrNull()?.takeIf { it in 10_000..2_000_000 } ?: return false
        return try {
            val decoder = Base64.getDecoder()
            MessageDigest.isEqual(derive(pin, decoder.decode(parts[1]), iterations), decoder.decode(parts[2]))
        } catch (_: IllegalArgumentException) {
            false
        }
    }

    fun isWellFormed(encoded: String?) = encoded != null && encoded.split(':').size == 3 && encoded.substringBefore(':').toIntOrNull() != null

    private fun derive(pin: String, salt: ByteArray, iterations: Int): ByteArray {
        val spec = PBEKeySpec(pin.toCharArray(), salt, iterations, KEY_BITS)
        return try {
            SecretKeyFactory.getInstance("PBKDF2WithHmacSHA256").generateSecret(spec).encoded
        } finally {
            spec.clearPassword()
        }
    }
}
