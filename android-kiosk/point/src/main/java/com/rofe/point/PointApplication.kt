package com.rofe.point

import android.app.Application
import com.rofe.point.core.MainAppHost

class PointApplication : Application() {
    // One SDK owner per process. No token, terminal ID or financial state is persisted.
    val host: MainAppHost by lazy { createHost(this) }
}
