package com.rofe.kiosk.core

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class NavigationPolicyTest {
    private val release = NavigationPolicy(KioskConfig.parse("https://rofe.vercel.app/kiosk", "*.supabase.co", allowCleartext = false))
    private val debug = NavigationPolicy(KioskConfig.parse("http://192.168.0.8:5173/kiosk", "", allowCleartext = true))

    @Test fun navigationStaysOnTheRofeOrigin() {
        assertTrue(release.allowNavigation("https://rofe.vercel.app/kiosk?idle=90"))
        assertTrue(release.allowNavigation("https://ROFE.vercel.app/"))
        assertTrue(release.allowNavigation("about:blank"))
        assertFalse(release.allowNavigation("https://evil.example/kiosk"))
        assertFalse(release.allowNavigation("https://rofe.vercel.app.evil.example/"))
        assertFalse(release.allowNavigation("http://rofe.vercel.app/kiosk"))
        assertFalse(release.allowNavigation("https://rofe.vercel.app:8443/kiosk"))
        assertFalse(release.allowNavigation("intent://scan/#Intent;scheme=zxing;end"))
        assertFalse(release.allowNavigation("tel:5555555555"))
        assertFalse(release.allowNavigation("market://details?id=x"))
        assertFalse(release.allowNavigation("file:///sdcard/a.html"))
        assertFalse(release.allowNavigation("javascript:alert(1)"))
        assertFalse(release.allowNavigation(null))
        assertFalse(release.allowNavigation("ht tp://bad url"))
    }

    @Test fun resourcesFromRofeAndAllowlistedHostsOnly() {
        assertTrue(release.allowResource("https://rofe.vercel.app/assets/index.js"))
        assertTrue(release.allowResource("https://abc123.supabase.co/storage/v1/object/public/p.webp"))
        assertTrue(release.allowResource("data:image/png;base64,AAAA"))
        assertTrue(release.allowResource("blob:https://rofe.vercel.app/1234"))
        assertFalse(release.allowResource("https://supabase.co/x"))
        assertFalse(release.allowResource("https://tracker.example/pixel.gif"))
        assertFalse(release.allowResource("http://abc.supabase.co/x.webp"))
        assertFalse(release.allowResource("file:///android_asset/x"))
    }

    @Test fun cleartextOnlyForTheDebugOrigin() {
        assertTrue(debug.allowNavigation("http://192.168.0.8:5173/kiosk"))
        assertTrue(debug.allowResource("http://192.168.0.8:5173/src/main.tsx"))
        assertFalse(debug.allowResource("http://192.168.0.9:5173/x.js"))
    }
}
