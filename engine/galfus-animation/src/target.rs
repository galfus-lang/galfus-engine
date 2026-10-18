//! Targets identifying animatable entity properties across 3D, 2D, Multiverse, and Custom channels.

use serde::{Deserialize, Serialize};

/// Identifies the destination property animated by a transition.
#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(
    tag = "kind",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub enum AnimationTarget {
    // === Realm 3D Targets ===
    ModelTransform3D {
        realm_id: u32,
        model_id: u32,
    },
    ModelTintColor {
        realm_id: u32,
        model_id: u32,
    },
    Camera3DTransform {
        realm_id: u32,
        camera_id: u32,
    },
    Camera3DFov {
        realm_id: u32,
        camera_id: u32,
    },
    Material3DBaseColor {
        realm_id: u32,
        material_id: u32,
    },
    Material3DEmissive {
        realm_id: u32,
        material_id: u32,
    },
    Material3DRoughness {
        realm_id: u32,
        material_id: u32,
    },
    Material3DMetallic {
        realm_id: u32,
        material_id: u32,
    },
    Light3DColor {
        realm_id: u32,
        light_id: u32,
    },
    Light3DIntensity {
        realm_id: u32,
        light_id: u32,
    },
    Light3DTransform {
        realm_id: u32,
        light_id: u32,
    },
    EnvironmentSunColor {
        realm_id: u32,
    },
    EnvironmentSunIntensity {
        realm_id: u32,
    },
    EnvironmentAmbientColor {
        realm_id: u32,
    },
    Particle3DTransform {
        realm_id: u32,
        emitter_id: u32,
    },
    Particle3DSpeed {
        realm_id: u32,
        emitter_id: u32,
    },
    Particle3DColorStart {
        realm_id: u32,
        emitter_id: u32,
    },
    Particle3DColorEnd {
        realm_id: u32,
        emitter_id: u32,
    },

    // === Realm 2D Targets ===
    SpriteTransform2D {
        realm_id: u32,
        sprite_id: u32,
    },
    SpriteColor {
        realm_id: u32,
        sprite_id: u32,
    },
    SpriteSize {
        realm_id: u32,
        sprite_id: u32,
    },
    Camera2DTransform {
        realm_id: u32,
        camera_id: u32,
    },
    Camera2DZoom {
        realm_id: u32,
        camera_id: u32,
    },
    Material2DColor {
        realm_id: u32,
        material_id: u32,
    },
    ShapeTransform2D {
        realm_id: u32,
        shape_id: u32,
    },
    ShapeFillColor {
        realm_id: u32,
        shape_id: u32,
    },
    ShapeStrokeColor {
        realm_id: u32,
        shape_id: u32,
    },
    ShapeRadius {
        realm_id: u32,
        shape_id: u32,
    },
    ShapeDimensions {
        realm_id: u32,
        shape_id: u32,
    },
    Light2DTransform {
        realm_id: u32,
        light_id: u32,
    },
    Light2DColor {
        realm_id: u32,
        light_id: u32,
    },
    Light2DIntensity {
        realm_id: u32,
        light_id: u32,
    },
    Light2DRadius {
        realm_id: u32,
        light_id: u32,
    },
    Particle2DTransform {
        realm_id: u32,
        emitter_id: u32,
    },
    Particle2DColorStart {
        realm_id: u32,
        emitter_id: u32,
    },
    Particle2DColorEnd {
        realm_id: u32,
        emitter_id: u32,
    },
    SvgTransform2D {
        realm_id: u32,
        svg_id: u32,
    },
    SvgOpacity {
        realm_id: u32,
        svg_id: u32,
    },
    SvgAttributeColor {
        realm_id: u32,
        svg_id: u32,
        element_id: String,
        attribute: String,
    },
    SvgAttributeScalar {
        realm_id: u32,
        svg_id: u32,
        element_id: String,
        attribute: String,
    },
    SvgAttributeVec2 {
        realm_id: u32,
        svg_id: u32,
        element_id: String,
        attribute: String,
    },

    // === Multiverse Targets ===
    InvocationClearColor {
        invocation_id: u32,
    },
    InvocationZIndex {
        invocation_id: u32,
    },
    InvocationViewportOffset {
        invocation_id: u32,
    },
    InvocationViewportSize {
        invocation_id: u32,
    },

    // === Custom Channels ===
    CustomChannel {
        channel_id: u32,
    },
}
