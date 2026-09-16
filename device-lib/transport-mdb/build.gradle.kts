plugins {
    id("com.android.library")
    kotlin("android")
}

// The ONLY module allowed to import android.* - it hides the CM30 AAR behind Module 1's Transport.
android {
    namespace = "com.rabbah.device.mdb"
    compileSdk = 37
    defaultConfig { minSdk = 30 }        // the AAR's manifest demands 30 (the CM30 runs Android 11)
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}
kotlin { jvmToolchain(17) }

dependencies {
    api(project(":core"))                // Transport, Frame, DeviceError... are part of this module's API
    implementation(project(":cm30-aar")) // android.hardware.mdbSlave.MdbSlave
    testImplementation(kotlin("test"))
    testImplementation("org.jetbrains.kotlinx:kotlinx-coroutines-test:1.10.2")
    testImplementation("org.junit.jupiter:junit-jupiter:5.11.4")
    testRuntimeOnly("org.junit.platform:junit-platform-launcher:1.11.4")
}
tasks.withType<Test>().configureEach { useJUnitPlatform() }
