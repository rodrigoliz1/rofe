import org.jetbrains.kotlin.gradle.dsl.JvmTarget
import java.security.MessageDigest

plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
}

fun setting(name: String, fallback: String = ""): String =
    providers.environmentVariable("ROFE_POINT_$name").orElse(fallback).get()

val sdkFile = file(setting("SDK_FILE", "vendor/nativesdk-7.3.1.aar"))
val sdkSha256 = "fa0969740cb670298d48e8b13fba06c0001e69dbf9d2559556124525d187575b"
val clientId = setting("CLIENT_ID")
require(clientId.isEmpty() || clientId.matches(Regex("[1-9][0-9]{0,18}"))) { "ROFE_POINT_CLIENT_ID debe ser el identificador público numérico asignado por Mercado Pago." }
val signingFile = setting("KEYSTORE_FILE")
val signingAvailable = signingFile.isNotBlank() && file(signingFile).isFile

android {
    namespace = "com.rofe.point"
    compileSdk = 35
    defaultConfig {
        applicationId = "com.rofe.point"
        minSdk = 31
        targetSdk = 35
        versionCode = setting("VERSION_CODE", "1").toInt().also { require(it > 0) }
        versionName = setting("VERSION_NAME", "1.0.0")
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
    }
    flavorDimensions += "host"
    productFlavors {
        create("prototype") {
            dimension = "host"
            applicationIdSuffix = ".prototype"
            resValue("string", "app_name", "ROFÉ Point Prototipo")
        }
        create("mainapp") {
            dimension = "host"
            resValue("string", "app_name", "ROFÉ Point")
            // CLIENT_ID is public, NOT an access token. Empty debug values never initialize the SDK.
            manifestPlaceholders["pointClientId"] = if (clientId.isEmpty()) "" else "${clientId}L"
            buildConfigField("String", "MP_CLIENT_ID", "\"$clientId\"")
        }
    }
    signingConfigs {
        if (signingAvailable) create("pointRelease") {
            storeFile = file(signingFile)
            storePassword = setting("KEYSTORE_PASSWORD")
            keyAlias = setting("KEY_ALIAS")
            keyPassword = setting("KEY_PASSWORD")
            enableV1Signing = true
            enableV2Signing = true
            enableV3Signing = true
        }
    }
    buildTypes {
        debug {
            applicationIdSuffix = ".debug"
            versionNameSuffix = "-debug"
        }
        release {
            isDebuggable = false
            // Keep the vendor AAR intact until Mercado Pago supplies its approved shrinker rules.
            isMinifyEnabled = false
            signingConfig = if (signingAvailable) signingConfigs.getByName("pointRelease") else null
        }
    }
    buildFeatures { buildConfig = true }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    testOptions {
        unitTests.isIncludeAndroidResources = true
        unitTests.all {
            // Android framework/native-render temporary files are released between classes.
            it.maxParallelForks = 1
            it.forkEvery = 1
            it.systemProperty("robolectric.dependency.repo.url", "https://maven-central.storage-download.googleapis.com/maven2")
        }
    }
    lint {
        abortOnError = true
        checkReleaseBuilds = true
        disable += setOf("ExpiredTargetSdkVersion", "GradleDependency", "NewerVersionAvailable", "AndroidGradlePluginVersion", "OldTargetApi")
    }
}
kotlin { compilerOptions { jvmTarget.set(JvmTarget.JVM_17) } }

dependencies {
    // Native Android Views, no WebView, Play Services, card reader or REST payment client.
    implementation(libs.androidx.activity.ktx)
    add("mainappImplementation", files(sdkFile))
    // Local AARs have no transitive POM: MPConfigBuilder requires Gson at runtime.
    add("mainappImplementation", "com.google.code.gson:gson:2.15.0")
    testImplementation(libs.junit)
    testImplementation(libs.robolectric)
    testImplementation(libs.androidx.test.core.ktx)
    testImplementation(libs.androidx.test.ext.junit.ktx)
    androidTestImplementation(libs.androidx.test.ext.junit.ktx)
    androidTestImplementation(libs.androidx.test.runner)
}

val verifyVendorSdk = tasks.register("verifyPointSdk") {
    inputs.file(sdkFile).optional()
    doLast {
        require(sdkFile.isFile) { "Falta el SDK oficial. Ejecuta ./scripts/fetch-point-sdk.sh; no se sustituye por un SDK simulado." }
        val actual = MessageDigest.getInstance("SHA-256").digest(sdkFile.readBytes()).joinToString("") { "%02x".format(it) }
        require(actual == sdkSha256) { "El SDK no coincide con la versión oficial revisada. Revisa procedencia y compatibilidad antes de cambiar el pin." }
    }
}
tasks.matching { it.name == "preMainappDebugBuild" || it.name == "preMainappReleaseBuild" }.configureEach { dependsOn(verifyVendorSdk) }
tasks.matching { it.name == "preMainappReleaseBuild" }.configureEach {
    doFirst {
        require(clientId.isNotEmpty()) { "Release Main App bloqueada: falta ROFE_POINT_CLIENT_ID autorizado." }
        require(signingAvailable && listOf("KEYSTORE_PASSWORD", "KEY_ALIAS", "KEY_PASSWORD").all { setting(it).isNotEmpty() }) {
            "Release Main App bloqueada: configura su keystore independiente fuera de Git; no se usa una firma debug como fallback."
        }
    }
}
