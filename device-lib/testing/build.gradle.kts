plugins { kotlin("jvm") }

// The scriptable, hardware-free Transport. Every test that needs a Transport uses this.
dependencies {
    api(project(":core"))          // the fake IS a Transport, so whoever uses it needs core's types too
    testImplementation(kotlin("test"))
    testImplementation("org.jetbrains.kotlinx:kotlinx-coroutines-test:1.10.2")
    testImplementation("org.junit.jupiter:junit-jupiter:5.11.4")
    testRuntimeOnly("org.junit.platform:junit-platform-launcher:1.11.4")
}
kotlin { jvmToolchain(17) }
tasks.test { useJUnitPlatform() }
