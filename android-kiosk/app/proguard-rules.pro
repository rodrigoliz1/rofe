# ROFE Kiosk. No JavaScript interfaces are exposed (WebMessageListener is used instead),
# so no @JavascriptInterface keep rules are needed. Components declared in the manifest
# are kept automatically by AGP.

# Release builds drop debug/verbose logging entirely.
-assumenosideeffects class android.util.Log {
    public static int d(...);
    public static int v(...);
    public static int i(...);
}
