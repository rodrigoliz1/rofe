package com.rofe.point

import android.app.Application
import android.os.Handler
import android.os.Looper
import com.mercadolibre.android.point_integration_sdk.nativesdk.MPManager
import com.mercadolibre.android.point_integration_sdk.nativesdk.configurable.MPConfigBuilder
import com.mercadolibre.android.point_integration_sdk.nativesdk.message.utils.ResponseStatus
import com.rofe.point.core.HostStatus
import com.rofe.point.core.MainAppHost

internal fun createHost(application: Application): MainAppHost = MercadoPagoHost(application)

/** Uses the real, hash-pinned SDK. A successful metadata response does NOT enable external Orders handoff. */
internal class MercadoPagoHost(
    private val application: Application,
    private val clientId: String = BuildConfig.MP_CLIENT_ID,
) : MainAppHost {
    private val main = Handler(Looper.getMainLooper())
    private var initialized = false

    override fun inspect(callback: (HostStatus) -> Unit) {
        if (clientId.isBlank()) {
            callback(HostStatus.CLIENT_ID_REQUIRED)
            return
        }
        try {
            if (!initialized) {
                // Do not enable card/payment flows, SSO, camera, printer or Bluetooth just for diagnostics.
                MPManager.initialize(application, MPConfigBuilder(application, clientId).build())
                initialized = true
            }
            MPManager.smartInformationTools.getInformation { response ->
                // Never retain/log serial, account, raw error, URI, payment data or SDK result.toString().
                val result = when {
                    response.status != ResponseStatus.SUCCESS || response.data == null -> HostStatus.UNAVAILABLE
                    response.data!!.smartDevice.modelName.uppercase() != "N950" -> HostStatus.UNSUPPORTED_DEVICE
                    else -> HostStatus.HOMOLOGATION_REQUIRED
                }
                main.post { callback(result) }
            }
        } catch (_: Exception) {
            main.post { callback(HostStatus.UNAVAILABLE) }
        }
    }
}
