use bytemuck::{Pod, Zeroable};
use glam::Vec4;
use serde::{Deserialize, Serialize};

use crate::color::{linear_to_srgb_rgba, srgb_to_linear_rgba};

/// Fog attenuation mode in the 3D environment.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum FogMode3D {
    /// No atmospheric distance fog.
    #[default]
    None,
    /// Linear interpolation between fog start and fog end distances.
    Linear,
    /// Exponential density falloff.
    Exponential,
}

impl FogMode3D {
    pub const fn to_code(self) -> u32 {
        match self {
            Self::None => 0,
            Self::Linear => 1,
            Self::Exponential => 2,
        }
    }
}

/// Skybox rendering mode.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum SkyboxMode3D {
    /// No skybox rendering (clear color background only).
    #[default]
    None,
    /// Procedural hemispherical sky with ground, horizon, sky gradient and sun disc.
    Procedural,
    /// Cubemap textured skybox.
    Cubemap,
}

impl SkyboxMode3D {
    pub const fn to_code(self) -> u32 {
        match self {
            Self::None => 0,
            Self::Procedural => 1,
            Self::Cubemap => 2,
        }
    }
}

/// Atmospheric skybox settings.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SkyboxConfig3D {
    /// Skybox mode.
    pub mode: SkyboxMode3D,
    /// sRGB zenith sky tint `[r, g, b, 1.0]`.
    pub sky_color: Vec4,
    /// sRGB horizon transition tint `[r, g, b, 1.0]`.
    pub horizon_color: Vec4,
    /// sRGB ground hemisphere tint `[r, g, b, 1.0]`.
    pub ground_color: Vec4,
    /// Normalized direction towards the main sun `[x, y, z, 0.0]`.
    pub sun_direction: Vec4,
    /// sRGB sun-disc tint and linear intensity multiplier `[r, g, b, intensity]`.
    pub sun_color: Vec4,
    /// Rotation around the vertical Y-axis in radians.
    pub rotation: f32,
    /// Optional logical texture ID for an equirectangular 360° panoramic HDR/LDR skybox texture.
    pub texture_id: Option<u32>,
    /// Overall skybox intensity factor.
    pub intensity: f32,
    /// Angular radius for procedural sun disc.
    pub sun_size: f32,
}

impl Default for SkyboxConfig3D {
    fn default() -> Self {
        Self {
            mode: SkyboxMode3D::None,
            sky_color: linear_to_srgb_rgba(Vec4::new(0.2, 0.45, 0.8, 1.0)),
            horizon_color: linear_to_srgb_rgba(Vec4::new(0.65, 0.75, 0.85, 1.0)),
            ground_color: linear_to_srgb_rgba(Vec4::new(0.08, 0.08, 0.1, 1.0)),
            sun_direction: Vec4::new(0.5, 0.75, 0.4, 0.0),
            sun_color: linear_to_srgb_rgba(Vec4::new(1.0, 0.95, 0.8, 2.0)),
            rotation: 0.0,
            texture_id: None,
            intensity: 1.0,
            sun_size: 0.04,
        }
    }
}

/// Outline post-processing settings for the 3D environment.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OutlineConfig3D {
    /// Whether outline rendering is globally enabled for the realm.
    pub enabled: bool,
    /// Edge dilation width in screen pixels (default: 1.5).
    pub width: f32,
    /// Alpha threshold for edge step (default: 0.2).
    pub threshold: f32,
    /// Blending opacity/strength (default: 1.0).
    pub strength: f32,
}

impl Default for OutlineConfig3D {
    fn default() -> Self {
        Self {
            enabled: true,
            width: 1.5,
            threshold: 0.2,
            strength: 1.0,
        }
    }
}

/// Screen-Space Ambient Occlusion (SSAO) settings.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SsaoConfig3D {
    /// Whether SSAO is enabled.
    pub enabled: bool,
    /// Sampling hemisphere world-space radius (default: 0.5).
    pub radius: f32,
    /// Depth bias to prevent self-occlusion artifacts (default: 0.025).
    pub bias: f32,
    /// Occlusion exponent power (default: 1.5).
    pub power: f32,
    /// Occlusion darkening multiplier (default: 1.0).
    pub intensity: f32,
    /// Bilateral blur kernel radius in pixels (default: 2).
    pub blur_radius: u32,
}

impl Default for SsaoConfig3D {
    fn default() -> Self {
        Self {
            enabled: false,
            radius: 0.45,
            bias: 0.025,
            power: 1.0,
            intensity: 0.65,
            blur_radius: 2,
        }
    }
}

/// Bloom HDR glow configuration.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BloomConfig3D {
    /// Whether Bloom HDR glow is active.
    pub enabled: bool,
    /// Minimum luminance threshold to trigger glow (default: 1.0).
    pub threshold: f32,
    /// Soft knee transition curve width (default: 0.5).
    pub knee: f32,
    /// Blending intensity of the bloom halo (default: 0.8).
    pub intensity: f32,
    /// Dispersion/diffusion factor across blur steps (default: 0.7).
    pub scatter: f32,
}

impl Default for BloomConfig3D {
    fn default() -> Self {
        Self {
            enabled: false,
            threshold: 1.0,
            knee: 0.5,
            intensity: 0.8,
            scatter: 0.7,
        }
    }
}

/// Global environment lighting, clear, fog, and exposure settings for a `Realm3DContext`.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EnvironmentRealm3D {
    /// sRGB ambient illumination baseline `[r, g, b, intensity]`.
    pub ambient_color: Vec4,
    /// sRGB background clear color `[r, g, b, a]`.
    pub clear_color: Vec4,
    /// sRGB atmospheric fog color `[r, g, b, 1.0]`.
    pub fog_color: Vec4,
    /// Distance fog mode.
    pub fog_mode: FogMode3D,
    /// Fog near start distance.
    pub fog_start: f32,
    /// Fog far complete obscurity distance.
    pub fog_end: f32,
    /// Fog exponential density factor.
    pub fog_density: f32,
    /// Camera exposure multiplier.
    pub exposure: f32,
    /// Skybox configuration.
    #[serde(default)]
    pub skybox: SkyboxConfig3D,
    /// Outline configuration.
    #[serde(default)]
    pub outline: OutlineConfig3D,
    /// SSAO configuration.
    #[serde(default)]
    pub ssao: SsaoConfig3D,
    /// Bloom configuration.
    #[serde(default)]
    pub bloom: BloomConfig3D,
}

impl Default for EnvironmentRealm3D {
    fn default() -> Self {
        Self {
            ambient_color: linear_to_srgb_rgba(Vec4::new(0.05, 0.05, 0.08, 1.0)),
            clear_color: linear_to_srgb_rgba(Vec4::new(0.02, 0.02, 0.03, 1.0)),
            fog_color: linear_to_srgb_rgba(Vec4::new(0.5, 0.6, 0.7, 1.0)),
            fog_mode: FogMode3D::None,
            fog_start: 10.0,
            fog_end: 200.0,
            fog_density: 0.01,
            exposure: 1.0,
            skybox: SkyboxConfig3D::default(),
            outline: OutlineConfig3D::default(),
            ssao: SsaoConfig3D::default(),
            bloom: BloomConfig3D::default(),
        }
    }
}

impl EnvironmentRealm3D {
    /// Returns the background clear color converted from public sRGB input to linear light.
    pub fn linear_clear_color(&self) -> Vec4 {
        srgb_to_linear_rgba(self.clear_color)
    }

    /// Builds a GPU-ready uniform buffer representation.
    pub fn build_uniform(&self, time: f32) -> Environment3DUniform {
        Environment3DUniform {
            ambient_color: srgb_to_linear_rgba(self.ambient_color),
            fog_color: srgb_to_linear_rgba(self.fog_color),
            fog_params: Vec4::new(
                self.fog_start,
                self.fog_end,
                self.fog_density,
                self.fog_mode.to_code() as f32,
            ),
            misc_params: Vec4::new(self.exposure, 2.2, time, self.skybox.mode.to_code() as f32),
        }
    }
}

/// GPU layout for 3D environment settings aligned to 16 bytes.
#[derive(Debug, Clone, Copy, Pod, Zeroable)]
#[repr(C)]
pub struct Environment3DUniform {
    /// Ambient light `[r, g, b, intensity]`.
    pub ambient_color: Vec4,
    /// Fog color `[r, g, b, 1.0]`.
    pub fog_color: Vec4,
    /// Fog params `[start, end, density, mode_code]`.
    pub fog_params: Vec4,
    /// Tone mapping params `[exposure, gamma, time, unused]`.
    pub misc_params: Vec4,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_environment_uniform_alignment() {
        assert_eq!(std::mem::size_of::<Environment3DUniform>() % 16, 0);
        let u = Environment3DUniform::zeroed();
        let bytes = bytemuck::bytes_of(&u);
        assert_eq!(bytes.len(), std::mem::size_of::<Environment3DUniform>());
    }

    #[test]
    fn environment_colors_are_converted_from_srgb_for_the_gpu() {
        let environment = EnvironmentRealm3D {
            ambient_color: Vec4::new(0.5, 0.5, 0.5, 2.0),
            fog_color: Vec4::new(0.5, 0.5, 0.5, 0.75),
            ..Default::default()
        };
        let uniform = environment.build_uniform(0.0);
        assert!((uniform.ambient_color.x - 0.214_041_14).abs() < 1e-6);
        assert_eq!(uniform.ambient_color.w, 2.0);
        assert!((uniform.fog_color.x - 0.214_041_14).abs() < 1e-6);
        assert_eq!(uniform.fog_color.w, 0.75);
    }
}
