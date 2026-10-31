plugins { id("com.android.application") version "9.1.0" }

// The release key lives outside the repo. Without it (a fresh clone) release builds use the debug key.
val keystore = providers.gradleProperty("tabbyKeystore").orNull
// TabbyDeck's version, from the root package.json: 0.4.0 is versionCode 400, so every release installs over the last.
val tabbyVersion = Regex("\"version\":\\s*\"(\\d+\\.\\d+\\.\\d+)\"").find(file("../../package.json").readText())!!.groupValues[1]

android {
    namespace = "io.github.iamshihab2020.tabbydeck"
    compileSdk = 36
    defaultConfig {
        applicationId = "io.github.iamshihab2020.tabbydeck"
        minSdk = 21 // Android 5.0: the oldest whose WebView can be updated to run the deck
        targetSdk = 36
        versionCode = tabbyVersion.split('.').fold(0) { n, part -> n * 100 + part.toInt() }
        versionName = tabbyVersion
    }
    signingConfigs {
        if (keystore != null) create("release") {
            storeFile = file(keystore)
            storePassword = providers.gradleProperty("tabbyKeystorePassword").get()
            keyAlias = "tabbydeck"
            keyPassword = storePassword
        }
    }
    buildTypes {
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
            signingConfig = signingConfigs.findByName("release") ?: signingConfigs.getByName("debug")
        }
    }
}
