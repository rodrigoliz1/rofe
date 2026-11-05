package com.rofe.kiosk

import android.Manifest
import android.content.pm.PackageManager
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.content.ContextCompat
import com.rofe.kiosk.core.CameraPolicy
import android.annotation.SuppressLint
import android.content.res.Configuration
import android.graphics.Bitmap
import android.graphics.Color
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.net.Uri
import android.net.http.SslError
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.text.SpannableString
import android.text.Spanned
import android.text.style.ForegroundColorSpan
import android.view.View
import android.view.ViewGroup
import android.view.WindowManager
import android.webkit.ConsoleMessage
import android.webkit.CookieManager
import android.webkit.GeolocationPermissions
import android.webkit.PermissionRequest
import android.webkit.RenderProcessGoneDetail
import android.webkit.SslErrorHandler
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebStorage
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Button
import android.widget.FrameLayout
import android.widget.ProgressBar
import android.widget.TextView
import androidx.activity.OnBackPressedCallback
import androidx.annotation.VisibleForTesting
import androidx.appcompat.app.AppCompatActivity
import androidx.core.graphics.Insets
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import androidx.webkit.WebViewCompat
import androidx.webkit.WebViewFeature
import com.rofe.kiosk.admin.AdminMenu
import com.rofe.kiosk.admin.LockTaskController
import com.rofe.kiosk.core.KioskConfig
import com.rofe.kiosk.core.NavigationPolicy
import org.json.JSONObject
import java.io.ByteArrayInputStream
import kotlin.math.max
import kotlin.math.min

/**
 * ROFE Kiosk: a dedicated, full-screen WebView for https://…/kiosk.
 *
 * All business logic (catalog, prices, orders, payments) stays in the web app and backend;
 * this shell only provides what a browser cannot: immersive mode, Lock Task, Back handling,
 * boot start, a native admin exit and a safe, origin-locked WebView.
 */
class MainActivity : AppCompatActivity(), AdminMenu.Host {

    private var cameraRequest: PermissionRequest? = null
    private var cameraPermissionPrompt = false
    private val requestCamera = registerForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        cameraPermissionPrompt = false
        val pending = cameraRequest
        cameraRequest = null
        if (pending != null) {
            if (granted && canUseCamera(pending)) pending.grant(arrayOf(PermissionRequest.RESOURCE_VIDEO_CAPTURE)) else pending.deny()
        }
    }
    private fun canUseCamera(request: PermissionRequest): Boolean = CameraPolicy.permits(
        BuildConfig.CAMERA_ENABLED, config?.origin, request.origin.toString(), webView?.url, request.resources,
    ) && !isFinishing && !isDestroyed
    private fun cancelCamera() { cameraRequest?.deny(); cameraRequest = null }

    private val handler = Handler(Looper.getMainLooper())
    private lateinit var prefs: KioskPrefs
    private lateinit var lockTask: LockTaskController
    private lateinit var adminMenu: AdminMenu
    private lateinit var root: FrameLayout
    private lateinit var webContainer: FrameLayout
    private lateinit var overlay: View
    private lateinit var overlayTitle: TextView
    private lateinit var overlayMessage: TextView
    private lateinit var overlayProgress: ProgressBar
    private lateinit var overlayRetry: Button

    private var config: KioskConfig? = null
    private var policy: NavigationPolicy? = null
    private var configError: String? = null
    private var webView: WebView? = null
    private var pageReady = false
    private var mainFrameFailed = false
    private var retryAttempt = 0
    private var networkCallback: ConnectivityManager.NetworkCallback? = null
    private var barsStuckVisible = false
    private var pendingRelock = false

    override var webVersion: String? = null
        private set
    override var lastLoadedAt: Long = 0
        private set

    // ---------------------------------------------------------------- lifecycle

    override fun onCreate(savedInstanceState: Bundle?) {
        val splash = installSplashScreen()
        super.onCreate(savedInstanceState)
        val createdAt = SystemClock.uptimeMillis()
        // Short native splash; afterwards the branded overlay covers loading (never a white page).
        splash.setKeepOnScreenCondition { !pageReady && SystemClock.uptimeMillis() - createdAt < SPLASH_MAX_MS }

        prefs = KioskPrefs(this)
        lockTask = LockTaskController(this)
        adminMenu = AdminMenu(this, prefs, lockTask, this)

        setUpWindow()
        setContentView(R.layout.activity_main)
        root = findViewById(R.id.root)
        webContainer = findViewById(R.id.web_container)
        overlay = findViewById(R.id.status_overlay)
        overlayTitle = findViewById(R.id.overlay_title)
        overlayMessage = findViewById(R.id.overlay_message)
        overlayProgress = findViewById(R.id.overlay_progress)
        overlayRetry = findViewById(R.id.overlay_retry)
        findViewById<TextView>(R.id.overlay_brand).apply {
            text = brandText()
            // The same discreet admin entry as the web logo, for when the page is not loaded.
            setOnLongClickListener { requestAdmin(); true }
        }
        overlayRetry.setOnClickListener { retryAttempt = 0; loadKiosk() }
        applyInsetsHandling()

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() = onKioskBack()
        })

        loadConfig()
        lockTask.applyDeviceOwnerPolicies(kioskEnabled = shouldLock())
        createWebView()
        loadKiosk()
        registerNetworkCallback()
    }

    override fun onResume() {
        super.onResume()
        webView?.onResume()
        if (BuildConfig.BARISTA_MODE) webView?.evaluateJavascript("window.dispatchEvent(new Event('rofe:resume'))", null)
        applyImmersive()
        if (pendingRelock || shouldLock()) {
            pendingRelock = false
            enforceKioskMode()
        }
    }

    override fun onPause() {
        if (BuildConfig.BARISTA_MODE && !cameraPermissionPrompt) {
            cancelCamera()
            webView?.evaluateJavascript("window.dispatchEvent(new Event('rofe:native-pause'))", null)
        }
        webView?.onPause()
        super.onPause()
    }

    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        if (hasFocus) applyImmersive()
    }

    /** Rotation, keyboard and density changes are handled in place (manifest configChanges):
     *  the WebView is never recreated, so the order, modal and typed name survive. */
    override fun onConfigurationChanged(newConfig: Configuration) {
        super.onConfigurationChanged(newConfig)
        applyImmersive()
    }

    override fun onDestroy() {
        cancelCamera()
        handler.removeCallbacksAndMessages(null)
        networkCallback?.let { runCatching { getSystemService(ConnectivityManager::class.java).unregisterNetworkCallback(it) } }
        destroyWebView()
        super.onDestroy()
    }

    // ---------------------------------------------------------------- window, immersive, insets

    private fun setUpWindow() {
        WindowCompat.setDecorFitsSystemWindows(window, false)
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.VANILLA_ICE_CREAM) {
            // Android 15 is edge-to-edge by default and ignores these.
            @Suppress("DEPRECATION")
            window.statusBarColor = Color.TRANSPARENT
            @Suppress("DEPRECATION")
            window.navigationBarColor = Color.TRANSPARENT
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            window.attributes = window.attributes.apply {
                layoutInDisplayCutoutMode = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                    WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_ALWAYS
                } else {
                    WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES
                }
            }
        }
    }

    /** Hides status and navigation bars; a swipe shows them briefly over the content. */
    private fun applyImmersive() {
        val controller = WindowCompat.getInsetsController(window, window.decorView)
        if (immersiveWanted()) {
            controller.systemBarsBehavior = WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
            controller.hide(WindowInsetsCompat.Type.systemBars())
        } else {
            controller.show(WindowInsetsCompat.Type.systemBars())
        }
    }

    private fun immersiveWanted() = !adminMenu.isTemporaryExit()

    /**
     * Safe areas are solved natively: the WebView is padded by the display cutout, the
     * keyboard (IME) and — only when bars are really part of the layout — the system bars.
     * Transient bars revealed by a swipe overlay the page instead of resizing it, so the
     * layout never jumps. If a firmware refuses immersive mode and keeps the bars on screen,
     * they are padded after a short grace period so no button sits under them.
     */
    private fun applyInsetsHandling() {
        ViewCompat.setOnApplyWindowInsetsListener(root) { view, insets ->
            val barsVisible = insets.isVisible(WindowInsetsCompat.Type.systemBars())
            if (immersiveWanted() && barsVisible && !barsStuckVisible) {
                handler.removeCallbacks(checkStuckBars)
                handler.postDelayed(checkStuckBars, STUCK_BARS_MS)
            } else if (!barsVisible) {
                handler.removeCallbacks(checkStuckBars)
                barsStuckVisible = false
            }
            val cutout = insets.getInsets(WindowInsetsCompat.Type.displayCutout())
            val bars = if (!immersiveWanted() || barsStuckVisible) insets.getInsets(WindowInsetsCompat.Type.systemBars()) else Insets.NONE
            val ime = insets.getInsets(WindowInsetsCompat.Type.ime())
            view.setPadding(
                max(cutout.left, bars.left),
                max(cutout.top, bars.top),
                max(cutout.right, bars.right),
                max(max(cutout.bottom, bars.bottom), ime.bottom),
            )
            WindowInsetsCompat.CONSUMED
        }
    }

    private val checkStuckBars = Runnable {
        val insets = ViewCompat.getRootWindowInsets(root) ?: return@Runnable
        if (insets.isVisible(WindowInsetsCompat.Type.systemBars())) {
            applyImmersive()
            barsStuckVisible = true
            ViewCompat.requestApplyInsets(root)
        }
    }

    // ---------------------------------------------------------------- kiosk mode

    private fun shouldLock() = prefs.kioskModeEnabled && !adminMenu.isTemporaryExit()

    private fun enforceKioskMode() {
        lockTask.applyDeviceOwnerPolicies(kioskEnabled = shouldLock())
        if (shouldLock()) lockTask.start() else lockTask.stop()
        applyImmersive()
        ViewCompat.requestApplyInsets(root)
    }

    // ---------------------------------------------------------------- WebView

    private fun loadConfig() {
        val url = prefs.debugUrlOverride ?: BuildConfig.KIOSK_URL
        try {
            val parsed = KioskConfig.parse(url, BuildConfig.EXTRA_ALLOWED_HOSTS, BuildConfig.ALLOW_CLEARTEXT)
            require(!BuildConfig.BARISTA_MODE || Uri.parse(parsed.startUrl).path?.trimEnd('/') == "/barista") { "ROFÉ Barista requiere la ruta /barista." }
            config = parsed
            policy = NavigationPolicy(parsed)
            configError = null
        } catch (error: IllegalArgumentException) {
            config = null
            policy = null
            configError = error.message
            KioskLog.e("Configuración de URL inválida", error)
        }
    }

    @SuppressLint("SetJavaScriptEnabled")
    private fun createWebView() {
        val view = WebView(this)
        view.layoutParams = FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT)
        view.setBackgroundColor(getColor(R.color.rofe_background))
        view.overScrollMode = View.OVER_SCROLL_NEVER
        view.isVerticalScrollBarEnabled = false
        view.isHorizontalScrollBarEnabled = false
        // No long-press menu / text selection bubble / haptic on long press; inputs keep the keyboard.
        view.isLongClickable = false
        view.isHapticFeedbackEnabled = false
        view.setOnLongClickListener { true }
        // A shared terminal must not offer previous customers' names through autofill.
        view.importantForAutofill = View.IMPORTANT_FOR_AUTOFILL_NO_EXCLUDE_DESCENDANTS

        with(view.settings) {
            javaScriptEnabled = true
            domStorageEnabled = true // IndexedDB/localStorage: terminal registration and offline outbox
            allowFileAccess = false
            allowContentAccess = false
            @Suppress("DEPRECATION")
            allowFileAccessFromFileURLs = false
            @Suppress("DEPRECATION")
            allowUniversalAccessFromFileURLs = false
            setGeolocationEnabled(false)
            javaScriptCanOpenWindowsAutomatically = false
            setSupportMultipleWindows(false)
            // No zoom of any kind and a 1:1 CSS pixel scale independent of the system font size.
            setSupportZoom(false)
            builtInZoomControls = false
            displayZoomControls = false
            textZoom = 100
            useWideViewPort = true
            loadWithOverviewMode = false
            mediaPlaybackRequiresUserGesture = false // payment confirmation sound
            mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
            cacheMode = WebSettings.LOAD_DEFAULT // HTTP caching rules from the server; HTML is revalidated
            userAgentString = "$userAgentString ${if (BuildConfig.BARISTA_MODE) "ROFEBarista" else "ROFEKiosk"}/${BuildConfig.VERSION_NAME}"
        }
        safeWebViewFeature("SAFE_BROWSING_ENABLE") {
            if (WebViewFeature.isFeatureSupported(WebViewFeature.SAFE_BROWSING_ENABLE)) {
                androidx.webkit.WebSettingsCompat.setSafeBrowsingEnabled(view.settings, true)
            }
        }
        CookieManager.getInstance().apply {
            setAcceptCookie(true) // httpOnly refresh cookie of the ROFE session
            setAcceptThirdPartyCookies(view, false)
        }
        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG)

        view.webViewClient = KioskWebViewClient()
        view.webChromeClient = KioskChromeClient()
        view.setDownloadListener { url, _, _, _, _ -> KioskLog.w("Descarga bloqueada: ${KioskLog.safeUrl(url)}") }
        installBridge(view)

        webContainer.addView(view, 0)
        webView = view
    }

    /**
     * web → native messages, without addJavascriptInterface: the object `rofeNative` is only
     * injected into frames whose origin is exactly the ROFE origin (WebMessageListener rules).
     */
    private fun installBridge(view: WebView) {
        val origin = config?.origin ?: return
        safeWebViewFeature("WEB_MESSAGE_LISTENER") {
            if (WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) {
                WebViewCompat.addWebMessageListener(view, "rofeNative", setOf(origin)) { _, message, sourceOrigin, isMainFrame, _ ->
                    onWebMessage(message.data, sourceOrigin, isMainFrame)
                }
            } else {
                KioskLog.w("WebView sin WebMessageListener: el acceso admin queda en el logo nativo")
            }
        }
    }

    private fun onWebMessage(data: String?, sourceOrigin: Uri, isMainFrame: Boolean) {
        if (!isMainFrame || data == null || data.length > 4096) return
        if (policy?.isAppOrigin(sourceOrigin.toString()) != true) return
        val message = try { JSONObject(data) } catch (_: Exception) { return }
        when (message.optString("type")) {
            "ready" -> {
                webVersion = message.optString("webVersion").take(64).ifBlank { null }
                markReady()
            }
            "admin" -> requestAdmin()
        }
    }

    private fun destroyWebView() {
        webView?.let { view ->
            webContainer.removeView(view)
            view.stopLoading()
            view.webChromeClient = null
            view.destroy()
        }
        webView = null
    }

    private fun kioskUrl(): String? = config?.launchUrl(
        linkedMapOf(
            "idle" to BuildConfig.IDLE_SECONDS.toString(),
            "haptics" to if (prefs.haptics) "1" else "0",
        ),
    )

    private fun loadKiosk() {
        val view = webView ?: return
        val url = kioskUrl()
        if (url == null) {
            showStatus(getString(R.string.status_config_title), getString(R.string.status_config_message, configError ?: ""), retry = false, progress = false)
            return
        }
        pageReady = false
        mainFrameFailed = false
        showStatus(getString(R.string.status_connecting_title), null, retry = false, progress = true)
        handler.removeCallbacks(slowLoading)
        handler.postDelayed(slowLoading, SLOW_LOAD_MS)
        KioskLog.d("Cargando ${KioskLog.safeUrl(url)}")
        view.loadUrl(url)
    }

    private val slowLoading = Runnable {
        if (!pageReady && !mainFrameFailed) {
            showStatus(getString(R.string.status_connecting_title), getString(R.string.status_slow_message), retry = true, progress = true)
        }
    }

    private fun markReady() {
        if (pageReady) return
        pageReady = true
        retryAttempt = 0
        lastLoadedAt = System.currentTimeMillis()
        handler.removeCallbacks(slowLoading)
        handler.removeCallbacks(autoRetry)
        overlay.visibility = View.GONE
        webView?.visibility = View.VISIBLE
    }

    private fun onMainFrameError(offline: Boolean, detail: String) {
        mainFrameFailed = true
        pageReady = false
        KioskLog.w("No se pudo cargar ROFE: $detail")
        webView?.visibility = View.INVISIBLE // never show the WebView's own error page
        val title = getString(if (offline) R.string.status_offline_title else R.string.status_error_title)
        showStatus(title, getString(R.string.status_retrying_message), retry = true, progress = true)
        scheduleAutoRetry()
    }

    private val autoRetry = Runnable { if (!pageReady) loadKiosk() }

    private fun scheduleAutoRetry() {
        handler.removeCallbacks(autoRetry)
        val delay = min(RETRY_MAX_MS, RETRY_BASE_MS shl min(retryAttempt, 3))
        retryAttempt += 1
        handler.postDelayed(autoRetry, delay)
    }

    private fun showStatus(title: String, message: String?, retry: Boolean, progress: Boolean) {
        overlay.visibility = View.VISIBLE
        overlayTitle.text = title
        overlayMessage.text = message.orEmpty()
        overlayMessage.visibility = if (message.isNullOrEmpty()) View.GONE else View.VISIBLE
        overlayRetry.visibility = if (retry) View.VISIBLE else View.GONE
        overlayProgress.visibility = if (progress) View.VISIBLE else View.INVISIBLE
    }

    private fun registerNetworkCallback() {
        val manager = getSystemService(ConnectivityManager::class.java) ?: return
        val callback = object : ConnectivityManager.NetworkCallback() {
            override fun onCapabilitiesChanged(network: Network, capabilities: NetworkCapabilities) {
                if (capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED)) {
                    handler.post { if (mainFrameFailed) { retryAttempt = 0; loadKiosk() } }
                }
            }
        }
        try {
            manager.registerDefaultNetworkCallback(callback)
            networkCallback = callback
        } catch (error: Exception) {
            KioskLog.w("No se pudo observar la red", error)
        }
    }

    private inline fun safeWebViewFeature(name: String, block: () -> Unit) {
        try { block() } catch (error: Throwable) { KioskLog.w("Función de WebView no disponible: $name", error) }
    }

    private fun brandText(): CharSequence = SpannableString("ROFÉ.").apply {
        setSpan(ForegroundColorSpan(getColor(R.color.rofe_gold)), length - 1, length, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
    }

    // ---------------------------------------------------------------- Back

    /** Back never leaves ROFE: the web app closes its dialog / goes up one step, or nothing happens. */
    private fun onKioskBack() {
        val view = webView ?: return
        if (!pageReady) return
        view.evaluateJavascript(BACK_SCRIPT, null)
    }

    // ---------------------------------------------------------------- admin

    private fun requestAdmin() = adminMenu.requestAccess()

    override val kioskConfig: KioskConfig? get() = config
    override val configurationError: String? get() = configError
    override val isPageReady: Boolean get() = pageReady

    override fun reloadKiosk() {
        val view = webView
        if (view != null && pageReady && policy?.isAppOrigin(view.url) == true) {
            pageReady = false
            showStatus(getString(R.string.status_connecting_title), null, retry = false, progress = true)
            view.reload()
        } else {
            loadKiosk()
        }
    }

    override fun restartWebView() {
        destroyWebView()
        createWebView()
        loadKiosk()
    }

    override fun resetCustomerSession() {
        webView?.evaluateJavascript("window.rofeKiosk&&window.rofeKiosk.resetSession()", null)
    }

    override fun openStaffAccess() {
        webView?.evaluateJavascript("window.rofeKiosk&&window.rofeKiosk.openStaffAccess()", null)
    }

    override fun clearCache() {
        webView?.clearCache(true)
        reloadKiosk()
    }

    override fun clearLocalData() {
        WebStorage.getInstance().deleteAllData()
        CookieManager.getInstance().removeAllCookies(null)
        CookieManager.getInstance().flush()
        webView?.clearCache(true)
        webView?.clearHistory()
        restartWebView()
    }

    override fun onKioskModeChanged() = enforceKioskMode()

    override fun onUrlChanged() {
        loadConfig()
        restartWebView()
    }

    override fun leaveLockTaskForSettings() {
        if (lockTask.isLocked) {
            pendingRelock = true
            lockTask.stop()
        }
        if (lockTask.isDeviceOwner) lockTask.applyDeviceOwnerPolicies(kioskEnabled = false)
    }

    override fun onAdminDialogShown(window: android.view.Window) {
        // Dialogs take focus; keep the bars hidden behind them too.
        val controller = WindowCompat.getInsetsController(window, window.decorView)
        controller.systemBarsBehavior = WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
        controller.hide(WindowInsetsCompat.Type.systemBars())
    }

    // ---------------------------------------------------------------- clients

    private inner class KioskWebViewClient : WebViewClient() {
        override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
            val url = request.url.toString()
            if (policy?.allowNavigation(url) == true && (!BuildConfig.BARISTA_MODE || url == "about:blank" || Uri.parse(url).path?.trimEnd('/') == "/barista")) return false
            KioskLog.w("Navegación bloqueada: ${KioskLog.safeUrl(url)}")
            return true
        }

        override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse? {
            val url = request.url.toString()
            val allowed = if (request.isForMainFrame) policy?.allowNavigation(url) == true && (!BuildConfig.BARISTA_MODE || url == "about:blank" || Uri.parse(url).path?.trimEnd('/') == "/barista") else policy?.allowResource(url) == true
            if (allowed) return null
            KioskLog.w("Recurso bloqueado: ${KioskLog.safeUrl(url)}")
            return WebResourceResponse("text/plain", "utf-8", 403, "Blocked", emptyMap(), ByteArrayInputStream(ByteArray(0)))
        }

        override fun onPageStarted(view: WebView, url: String?, favicon: Bitmap?) {
            cancelCamera()
            mainFrameFailed = false
        }

        override fun onPageFinished(view: WebView, url: String?) {
            // The web app also posts {type:'ready'}; this covers WebViews without the bridge.
            if (!mainFrameFailed && policy?.isAppOrigin(url) == true) handler.postDelayed({ if (!mainFrameFailed) markReady() }, READY_FALLBACK_MS)
        }

        override fun onReceivedError(view: WebView, request: WebResourceRequest, error: WebResourceError) {
            if (!request.isForMainFrame) return
            val offline = error.errorCode in OFFLINE_ERRORS
            onMainFrameError(offline, "código ${error.errorCode}")
        }

        override fun onReceivedHttpError(view: WebView, request: WebResourceRequest, response: WebResourceResponse) {
            if (request.isForMainFrame && response.statusCode >= 500) onMainFrameError(offline = false, detail = "HTTP ${response.statusCode}")
        }

        /** Certificates are never bypassed. */
        @SuppressLint("WebViewClientOnReceivedSslError")
        override fun onReceivedSslError(view: WebView, handler: SslErrorHandler, error: SslError) {
            handler.cancel()
            onMainFrameError(offline = false, detail = "certificado TLS no válido (${error.primaryError})")
        }

        /** A crashed or killed renderer must not take the app down: start a fresh WebView. */
        override fun onRenderProcessGone(view: WebView, detail: RenderProcessGoneDetail): Boolean {
            KioskLog.w("El proceso de la WebView terminó (crash=${detail.didCrash()})")
            if (view == webView) {
                webView = null
                webContainer.removeView(view)
                view.destroy()
                createWebView()
                loadKiosk()
            }
            return true
        }
    }

    private inner class KioskChromeClient : WebChromeClient() {
        override fun onPermissionRequest(request: PermissionRequest) {
            runOnUiThread {
                if (!canUseCamera(request) || cameraRequest != null) { request.deny(); return@runOnUiThread }
                if (ContextCompat.checkSelfPermission(this@MainActivity, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED) {
                    request.grant(arrayOf(PermissionRequest.RESOURCE_VIDEO_CAPTURE))
                } else {
                    cameraRequest = request
                    cameraPermissionPrompt = true
                    requestCamera.launch(Manifest.permission.CAMERA)
                }
            }
        }
        override fun onPermissionRequestCanceled(request: PermissionRequest) {
            runOnUiThread { if (cameraRequest === request) cameraRequest = null }
        }

        override fun onGeolocationPermissionsShowPrompt(origin: String?, callback: GeolocationPermissions.Callback) =
            callback.invoke(origin, false, false)

        /** The kiosk flow has no uploads (product photos are managed from the admin panel). */
        override fun onShowFileChooser(view: WebView?, callback: ValueCallback<Array<Uri>>?, params: FileChooserParams?): Boolean = false

        override fun onConsoleMessage(message: ConsoleMessage): Boolean {
            if (BuildConfig.DEBUG) KioskLog.d("web: ${message.messageLevel()} ${message.message()}")
            return true
        }

        override fun getDefaultVideoPoster(): Bitmap = Bitmap.createBitmap(1, 1, Bitmap.Config.ARGB_8888)
    }

    // ---------------------------------------------------------------- testing hooks

    @VisibleForTesting
    internal fun webViewForTest(): WebView? = webView

    @VisibleForTesting
    internal fun overlayVisibleForTest(): Boolean = overlay.visibility == View.VISIBLE

    @VisibleForTesting
    internal fun simulateMainFrameErrorForTest(offline: Boolean) = onMainFrameError(offline, "prueba")

    @VisibleForTesting
    internal fun simulateReadyForTest() = markReady()

    @VisibleForTesting
    internal fun requestAdminForTest() = requestAdmin()

    @VisibleForTesting
    internal fun handleWebMessageForTest(data: String, origin: String) = onWebMessage(data, Uri.parse(origin), isMainFrame = true)

    companion object {
        private const val SPLASH_MAX_MS = 1_500L
        private const val SLOW_LOAD_MS = 6_000L
        private const val READY_FALLBACK_MS = 400L
        private const val STUCK_BARS_MS = 4_000L
        private const val RETRY_BASE_MS = 3_000L
        private const val RETRY_MAX_MS = 30_000L
        private val OFFLINE_ERRORS = setOf(
            WebViewClient.ERROR_HOST_LOOKUP,
            WebViewClient.ERROR_CONNECT,
            WebViewClient.ERROR_TIMEOUT,
            WebViewClient.ERROR_IO,
        )
        private const val BACK_SCRIPT = "(function(){try{return !!(window.rofeKiosk&&window.rofeKiosk.back());}catch(e){return false;}})()"
    }
}
