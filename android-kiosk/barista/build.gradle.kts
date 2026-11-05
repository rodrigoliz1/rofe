import org.jetbrains.kotlin.gradle.dsl.JvmTarget
import java.net.URI
import java.security.SecureRandom
import java.util.Base64
import javax.crypto.SecretKeyFactory
import javax.crypto.spec.PBEKeySpec

plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
}

/** -Profe.x=…, then the ROFE_X environment variable, then gradle.properties / the default. */
fun setting(name: String, default: String = ""): String {
    val env = "ROFE_BARISTA_" + name.removePrefix("barista.").replace(Regex("([a-z])([A-Z])"), "$1_$2").uppercase()
    return providers.gradleProperty(name).orNull?.takeIf { it.isNotBlank() }
        ?: providers.environmentVariable(env).orNull?.takeIf { it.isNotBlank() }
        ?: default
}

fun baristaUrl(name: String, requireHttps: Boolean): String {
    val value = setting(name, "https://rofe.vercel.app/barista")
    val uri = runCatching { URI(value) }.getOrNull()
    require(uri?.host != null && uri.scheme in setOf("https", "http")) { "$name debe ser una URL completa, por ejemplo https://rofe.vercel.app/barista (recibido: '$value')." }
    require(!requireHttps || uri!!.scheme == "https") { "$name debe usar HTTPS: las builds staging y release no permiten tráfico sin cifrar." }
    require(uri!!.path.trimEnd('/') == "/barista" && uri.rawUserInfo == null && uri.fragment == null) { "$name debe abrir exclusivamente /barista, sin credenciales ni fragmentos." }
    return value
}

fun quoted(value: String) = "\"" + value.replace("\\", "\\\\").replace("\"", "\\\"") + "\""

// Release signing comes only from the environment / CI secrets. Nothing is committed.
val keystoreFile = setting("barista.keystoreFile")
val releaseSigningAvailable = keystoreFile.isNotEmpty() && file(keystoreFile).exists()

android {
    namespace = "com.rofe.kiosk"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.rofe.barista"
        buildConfigField("boolean", "BARISTA_MODE", "true")
        buildConfigField("boolean", "CAMERA_ENABLED", "true")
        buildConfigField("boolean", "AUTO_START_DEFAULT", "false")
        minSdk = 26
        targetSdk = 35
        versionCode = setting("barista.versionCode", "2").toInt()
        versionName = setting("barista.versionName", "1.0.0")
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"

        buildConfigField("String", "EXTRA_ALLOWED_HOSTS", quoted(setting("barista.extraHosts", "*.supabase.co")))
        buildConfigField("int", "IDLE_SECONDS", setting("barista.idleSeconds", "90").toInt().coerceIn(20, 900).toString())
        // Optional initial admin PIN ("iterations:salt:hash"), produced by ./gradlew :app:hashPin -Ppin=…
        // Without it, the first admin long-press asks the operator to create the PIN on the device.
        buildConfigField("String", "ADMIN_PIN_HASH", quoted(setting("barista.adminPinHash")))
    }

    signingConfigs {
        if (releaseSigningAvailable) {
            create("release") {
                storeFile = file(keystoreFile)
                storePassword = setting("barista.keystorePassword")
                keyAlias = setting("barista.keyAlias")
                keyPassword = setting("barista.keyPassword")
                enableV1Signing = false
                enableV2Signing = true
                enableV3Signing = true
            }
        }
    }

    buildTypes {
        debug {
            applicationIdSuffix = ".debug"
            versionNameSuffix = "-debug"
            resValue("string", "app_name", "ROFÉ Barista Debug")
            buildConfigField("String", "KIOSK_URL", quoted(baristaUrl("barista.debugUrl", requireHttps = false)))
            // Only debug may load http:// (e.g. http://192.168.x.x:5173/kiosk on the LAN).
            buildConfigField("boolean", "ALLOW_CLEARTEXT", "true")
            // Development: a normal app until the admin enables kiosk mode from the menu.
            buildConfigField("boolean", "LOCK_TASK_DEFAULT", "false")
        }
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "../app/proguard-rules.pro")
            resValue("string", "app_name", "ROFÉ Barista")
            buildConfigField("String", "KIOSK_URL", quoted(baristaUrl("barista.releaseUrl", requireHttps = true)))
            buildConfigField("boolean", "ALLOW_CLEARTEXT", "false")
            buildConfigField("boolean", "LOCK_TASK_DEFAULT", "false")
            signingConfig = if (releaseSigningAvailable) signingConfigs.getByName("release") else null
        }
        create("staging") {
            initWith(getByName("release"))
            applicationIdSuffix = ".staging"
            versionNameSuffix = "-staging"
            matchingFallbacks += listOf("release")
            resValue("string", "app_name", "ROFÉ Barista Staging")
            buildConfigField("String", "KIOSK_URL", quoted(baristaUrl("barista.stagingUrl", requireHttps = true)))
            // Installable for QA without the production key; release keeps its own signature.
            signingConfig = if (releaseSigningAvailable) signingConfigs.getByName("release") else signingConfigs.getByName("debug")
        }
    }

    sourceSets {
        getByName("main") {
            java.srcDir("../app/src/main/java")
            res.srcDir("../app/src/main/res")
        }
        getByName("debug").res.srcDir("../app/src/debug/res")
        getByName("test").java.srcDir("../app/src/test/java/com/rofe/kiosk/core")
    }

    buildFeatures {
        buildConfig = true
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    testOptions {
        unitTests.isIncludeAndroidResources = true
        unitTests.all {
            it.systemProperty("robolectric.logging.enabled", "true")
            // Robolectric downloads android-all at test time; Google's Maven Central mirror is steadier on CI.
            it.systemProperty("robolectric.dependency.repo.url", "https://maven-central.storage-download.googleapis.com/maven2")
        }
    }

    lint {
        abortOnError = true
        checkReleaseBuilds = true
        // A dedicated-device app is never published on Google Play.
        disable += setOf("ExpiredTargetSdkVersion", "GradleDependency", "NewerVersionAvailable", "AndroidGradlePluginVersion", "OldTargetApi")
    }

    packaging {
        resources.excludes += setOf("META-INF/AL2.0", "META-INF/LGPL2.1")
    }
}

kotlin {
    compilerOptions { jvmTarget.set(JvmTarget.JVM_17) }
}

dependencies {
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.appcompat)
    implementation(libs.androidx.activity.ktx)
    implementation(libs.androidx.webkit)
    implementation(libs.androidx.core.splashscreen)

    testImplementation(libs.junit)
    testImplementation(libs.robolectric)
    testImplementation(libs.androidx.test.core.ktx)
    testImplementation(libs.androidx.test.ext.junit.ktx)

    androidTestImplementation(libs.androidx.test.ext.junit.ktx)
    androidTestImplementation(libs.androidx.test.runner)
    androidTestImplementation(libs.androidx.test.rules)
    androidTestImplementation(libs.androidx.espresso.core)
    androidTestImplementation(libs.androidx.uiautomator)
}

/** ./gradlew :app:hashPin -Ppin=482915  →  prints a value for rofe.adminPinHash (never the PIN). */
tasks.register("hashPin") {
    group = "rofe"
    description = "Genera el hash PBKDF2 de un PIN administrativo para rofe.adminPinHash."
    val pin = providers.gradleProperty("pin")
    doLast {
        val value = pin.orNull ?: error("Indica el PIN: ./gradlew :app:hashPin -Ppin=123456")
        require(value.length in 6..12 && value.all(Char::isDigit)) { "El PIN debe tener entre 6 y 12 dígitos." }
        val iterations = 120_000
        val salt = ByteArray(16).also { SecureRandom().nextBytes(it) }
        val spec = PBEKeySpec(value.toCharArray(), salt, iterations, 256)
        val hash = SecretKeyFactory.getInstance("PBKDF2WithHmacSHA256").generateSecret(spec).encoded
        spec.clearPassword()
        val encoder = Base64.getEncoder()
        println("barista.adminPinHash=$iterations:${encoder.encodeToString(salt)}:${encoder.encodeToString(hash)}")
    }
}
