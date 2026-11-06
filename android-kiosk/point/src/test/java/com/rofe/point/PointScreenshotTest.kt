package com.rofe.point

import android.graphics.Bitmap
import android.graphics.Canvas
import android.view.View
import android.widget.TextView
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.Robolectric
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode
import java.io.File

/** Native Android rendering, not an HTML mockup. No Mercado Pago host or payment is simulated. */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34], qualifiers = "w500dp-h1000dp-mdpi")
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class PointScreenshotTest {
    @Test fun renderPortraitWaitingAndOfflineScreens() {
        Robolectric.buildActivity(MainActivity::class.java).setup().use { owner ->
            val activity = owner.get()
            val root = activity.findViewById<View>(R.id.point_root)
            save(root, "offline", 500, 1000)
            // Presentation-only fixture. It does not claim a live host or successful transaction.
            activity.findViewById<TextView>(R.id.status_title).setText(R.string.waiting_title)
            activity.findViewById<TextView>(R.id.status_description).setText(R.string.waiting_description)
            activity.findViewById<TextView>(R.id.network_status).setText(R.string.network_available)
            activity.findViewById<View>(R.id.retry).visibility = View.GONE
            save(root, "waiting", 500, 1000)
        }
    }

    @Test fun landscapeRemainsScrollable() {
        Robolectric.buildActivity(MainActivity::class.java).setup().use { owner ->
            val root = owner.get().findViewById<View>(R.id.point_root)
            save(root, "landscape", 1000, 500)
            assertTrue(root is android.widget.ScrollView)
            assertTrue(root.measuredHeight > 0)
        }
    }

    @Test @Config(qualifiers = "w360dp-h640dp-mdpi")
    fun largeTextOnNarrowDisplayCanScrollToAllInstructions() {
        RuntimeEnvironment.setFontScale(1.8f)
        Robolectric.buildActivity(MainActivity::class.java).setup().use { owner ->
            val root = owner.get().findViewById<android.widget.ScrollView>(R.id.point_root)
            save(root, "large-text", 360, 640)
            assertTrue(root.getChildAt(0).measuredHeight > root.measuredHeight)
            val description = owner.get().findViewById<TextView>(R.id.status_description)
            assertTrue(description.measuredHeight >= description.lineCount * description.lineHeight)
        }
    }

    private fun save(root: View, name: String, width: Int, height: Int) {
        root.measure(View.MeasureSpec.makeMeasureSpec(width, View.MeasureSpec.EXACTLY), View.MeasureSpec.makeMeasureSpec(height, View.MeasureSpec.EXACTLY))
        root.layout(0, 0, width, height)
        val bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(bitmap)
        canvas.drawColor(root.context.getColor(R.color.point_background)) // The actual Activity theme background.
        root.draw(canvas)
        val directory = File("build/point-evidence").apply { mkdirs() }
        File(directory, "$name-${BuildConfig.FLAVOR}.png").outputStream().use { bitmap.compress(Bitmap.CompressFormat.PNG, 100, it) }
        bitmap.recycle()
    }
}
