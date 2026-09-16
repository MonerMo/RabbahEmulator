plugins { kotlin("jvm") }

// Pure Kotlin: NO android.* imports allowed in this module (task rule).
dependencies {
    api("org.jetbrains.kotlinx:kotlinx-coroutines-core:1.10.2")   // api: modules that depend on core also see Flow/StateFlow
    testImplementation(kotlin("test"))
    testImplementation("org.jetbrains.kotlinx:kotlinx-coroutines-test:1.10.2")
    testImplementation("org.junit.jupiter:junit-jupiter:5.11.4")
    testRuntimeOnly("org.junit.platform:junit-platform-launcher:1.11.4")
}
kotlin { jvmToolchain(17) }
tasks.test { useJUnitPlatform() }
