package com.rofe.kiosk.core

import org.junit.Assert.*
import org.junit.Test

class CameraPolicyTest {
    private fun allowed(enabled: Boolean = true, origin: String = "https://rofe.example", page: String = "https://rofe.example/barista", resources: Array<String> = arrayOf(CameraPolicy.VIDEO)) =
        CameraPolicy.permits(enabled, "https://rofe.example", origin, page, resources)
    @Test fun baristaCameraOnly() {
        assertTrue(allowed())
        assertTrue(allowed(origin = "https://rofe.example:443", page = "https://rofe.example/barista/?scan=1"))
        assertFalse(allowed(enabled = false))
        assertFalse(allowed(page = "https://rofe.example/kiosk"))
        assertFalse(allowed(origin = "https://evil.example"))
        assertFalse(allowed(page = "https://evil.example/barista"))
        assertFalse(allowed(origin = "http://rofe.example"))
        assertFalse(allowed(page = "https://attacker@rofe.example/barista"))
        assertFalse(allowed(resources = arrayOf(CameraPolicy.VIDEO, "android.webkit.resource.AUDIO_CAPTURE")))
        assertFalse(allowed(resources = emptyArray()))
        assertFalse(allowed(origin = "malformed"))
    }
}
