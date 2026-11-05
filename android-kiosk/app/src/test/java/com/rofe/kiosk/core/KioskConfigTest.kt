package com.rofe.kiosk.core

import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Test

class KioskConfigTest {
    @Test fun releaseRequiresHttps() {
        assertThrows(IllegalArgumentException::class.java) { KioskConfig.parse("http://rofe.vercel.app/kiosk", "", allowCleartext = false) }
        assertEquals("https://rofe.vercel.app", KioskConfig.parse("https://rofe.vercel.app/kiosk", "", false).origin)
    }

    @Test fun debugMayUseTheLanWithAPort() {
        val config = KioskConfig.parse("http://192.168.0.8:5173/kiosk", "", allowCleartext = true)
        assertEquals("http://192.168.0.8:5173", config.origin)
    }

    @Test fun rejectsCredentialsAndMissingHost() {
        assertThrows(IllegalArgumentException::class.java) { KioskConfig.parse("https://user:pass@rofe.vercel.app/kiosk", "", false) }
        assertThrows(IllegalArgumentException::class.java) { KioskConfig.parse("https:///kiosk", "", false) }
        assertThrows(IllegalArgumentException::class.java) { KioskConfig.parse("rofe.vercel.app/kiosk", "", false) }
    }

    @Test fun appendsKioskSettingsKeepingExistingQueryAndFragment() {
        val config = KioskConfig.parse("https://rofe.vercel.app/kiosk", "", false)
        assertEquals("https://rofe.vercel.app/kiosk?idle=90&haptics=1", config.launchUrl(linkedMapOf("idle" to "90", "haptics" to "1")))
        assertEquals("https://rofe.vercel.app/kiosk?a=1&idle=90#x", KioskConfig.parse("https://rofe.vercel.app/kiosk?a=1#x", "", false).launchUrl(mapOf("idle" to "90")))
    }

    @Test fun ignoresDangerousResourceHostRules() {
        assertEquals(listOf("*.supabase.co", "cdn.rofe.mx"), KioskConfig.parse("https://rofe.vercel.app/kiosk", " *.supabase.co, *, cdn.rofe.mx ,a/b", false).resourceHosts)
    }
}
