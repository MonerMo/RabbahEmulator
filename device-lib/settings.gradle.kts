pluginManagement {
    repositories { gradlePluginPortal(); google(); mavenCentral() }
}
dependencyResolutionManagement {
    repositories { google(); mavenCentral() }
}
rootProject.name = "device-lib"
include(":core", ":testing", ":cm30-aar", ":transport-mdb")
// ":rn-bridge" (the Turbo Module) is added in Module 4.
