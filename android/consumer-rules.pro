# ───────────────────────────────────────────────────────────────────────────
# react-native-live-activity-kit — consumer R8/ProGuard rules.
#
# Live Activities are an iOS-only feature, so the Android side is a no-op shim.
# Nitro's generated classes (the spec, the structs, the Func_* callbacks) are
# annotated @Keep / @DoNotStrip and survive R8 without rules here. The one entry
# point R8 cannot see is the HybridObject implementation, which Nitro creates
# from C++ by exact class name — so it must be kept explicitly.
# ───────────────────────────────────────────────────────────────────────────

# The Nitro HybridObject implementation is instantiated from C++ by exact class name.
-keep class com.margelo.nitro.liveactivitykit.HybridLiveActivityKit { *; }

-keepattributes *Annotation*
