package com.rofe.point

import android.content.Intent
import android.widget.TextView
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class PointInstrumentedTest {
    @Test fun coldStartAndRecreationShowNativeShellWithoutExternalNavigation() {
        val instrumentation = InstrumentationRegistry.getInstrumentation()
        val context = instrumentation.targetContext
        val activity = instrumentation.startActivitySync(Intent(context, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        instrumentation.runOnMainSync {
            assertNotNull(activity.findViewById<TextView>(R.id.status_title))
            assertTrue(activity is MainActivity)
            activity.recreate()
        }
        instrumentation.waitForIdleSync()
    }
}
