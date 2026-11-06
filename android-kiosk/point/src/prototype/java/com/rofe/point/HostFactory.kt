package com.rofe.point

import android.app.Application
import com.rofe.point.core.HostStatus
import com.rofe.point.core.MainAppHost

internal fun createHost(@Suppress("UNUSED_PARAMETER") application: Application): MainAppHost = object : MainAppHost {
    override fun inspect(callback: (HostStatus) -> Unit) = callback(HostStatus.PROTOTYPE)
}
