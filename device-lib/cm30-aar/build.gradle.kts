// Ciontek's binary (CM30-HardwareLibrary-1.0.9.aar) wrapped as a Gradle module.
// An Android library may not depend on a loose .aar file, but it may depend on a project
// whose only artifact is that file - this is the officially supported way.
configurations.maybeCreate("default")
artifacts.add("default", file("CM30-HardwareLibrary-1.0.9.aar"))
