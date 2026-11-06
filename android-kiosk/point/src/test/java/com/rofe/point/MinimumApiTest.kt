package com.rofe.point

import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.Robolectric
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/** N950's documented Android 12 baseline, without a physical Point or a payment host. */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [31])
class MinimumApiTest {
    @Test fun opensAndRecoversOnAndroid12() {
        Robolectric.buildActivity(MainActivity::class.java).setup().use { owner ->
            owner.pause().resume()
            assertNotNull(owner.get().findViewById<android.view.View>(R.id.status_title))
            owner.get().onWindowFocusChanged(true)
            assertFalse(owner.get().isFinishing)
        }
    }
}
