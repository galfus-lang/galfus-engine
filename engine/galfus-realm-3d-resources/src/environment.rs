use bytemuck::{Pod, Zeroable};
use glam::Vec4;
use serde::{Deserialize, Serialize};

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

/// Global environment lighting, clear, fog, and exposure settings for a `Realm3DContext`.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EnvironmentRealm3D {
    /// Ambient illumination baseline `[r, g, b, intensity]`.
    pub ambient_color: Vec4,
    /// Background clear color `[r, g, b, a]`.
    pub clear_color: Vec4,
    /// Atmospheric fog color `[r, g, b, 1.0]`.
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
}

impl Default for EnvironmentRealm3D {
    fn default() -> Self {
        Self {
            ambient_color: Vec4::new(0.05, 0.05, 0.08, 1.0),
            clear_color: Vec4::new(0.02, 0.02, 0.03, 1.0),
            fog_color: Vec4::new(0.5, 0.6, 0.7, 1.0),
            fog_mode: FogMode3D::None,
            fog_start: 10.0,
            fog_end: 200.0,
            fog_density: 0.01,
            exposure: 1.0,
        }
    }
}

impl EnvironmentRealm3D {
    /// Builds a GPU-ready uniform buffer representation.
    pub fn build_uniform(&self, time: f32) -> Environment3DUniform {
        Environment3DUniform {
            ambient_color: self.ambient_color,
            fog_color: self.fog_color,
            fog_params: Vec4::new(
                self.fog_start,
                self.fog_end,
                self.fog_density,
                self.fog_mode.to_code() as f32,
            ),
            misc_params: Vec4::new(self.exposure, 2.2, time, 0.0),
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
}
