// One place for plugin versions - the same way the React Native app does it, so both
// builds resolve the same, already-downloaded artifacts and work offline.
// Every module then says just `plugins { kotlin("jvm") }` or `id("com.android.library")`.
buildscript {
    repositories { google(); mavenCentral() }
    dependencies {
        classpath("com.android.tools.build:gradle:9.2.1")
        classpath("org.jetbrains.kotlin:kotlin-gradle-plugin:2.2.10")
    }
}
