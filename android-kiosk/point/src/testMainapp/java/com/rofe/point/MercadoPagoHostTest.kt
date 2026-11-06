package com.rofe.point

import androidx.test.core.app.ApplicationProvider
import com.rofe.point.core.HostStatus
import org.junit.Assert.assertEquals
import org.junit.Assume.assumeTrue
import org.junit.Assert.assertTrue
import org.robolectric.Shadows.shadowOf
import android.os.Looper
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class MercadoPagoHostTest {
    @Test fun absentClientIdNeverInitializesSdkOrClaimsIntegration() {
        assumeTrue("Esta prueba cubre configuración ausente; el candidato configurado requiere sandbox real.", BuildConfig.MP_CLIENT_ID.isBlank())
        val host = MercadoPagoHost(ApplicationProvider.getApplicationContext())
        var result: HostStatus? = null
        host.inspect { result = it }
        assertEquals(HostStatus.CLIENT_ID_REQUIRED, result)
    }

    @Test fun realSdkFailsSafelyOnAndroidWithoutOfficialHost() {
        // Synthetic public ID, only inside Robolectric; no merchant, real terminal or remote payment call.
        val host = MercadoPagoHost(ApplicationProvider.getApplicationContext(), clientId = "1")
        var result: HostStatus? = null
        host.inspect { result = it }
        shadowOf(Looper.getMainLooper()).idle()
        assertEquals(HostStatus.UNAVAILABLE, result)
        assertTrue(BuildConfig.APPLICATION_ID.startsWith("com.rofe.point"))
    }
}
