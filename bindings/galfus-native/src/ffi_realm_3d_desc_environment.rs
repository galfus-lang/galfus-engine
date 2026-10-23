//! Host descriptors for Realm 3D environment settings.

use galfus_realm_3d_resources::environment::{
    BloomConfig3D, EnvironmentRealm3D, FogMode3D, OutlineConfig3D, SkyboxConfig3D, SkyboxMode3D,
    SsaoConfig3D,
};
use glam::Vec4;
use serde::Deserialize;

#[derive(Debug, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct SkyboxConfig3DDesc {
    pub mode: Option<String>,
    pub sky_color: Option<[f32; 4]>,
    pub horizon_color: Option<[f32; 4]>,
    pub ground_color: Option<[f32; 4]>,
    pub sun_direction: Option<[f32; 4]>,
    pub sun_color: Option<[f32; 4]>,
    pub intensity: Option<f32>,
    pub sun_size: Option<f32>,
    pub rotation: Option<f32>,
    pub texture_id: Option<u32>,
}

impl From<SkyboxConfig3DDesc> for SkyboxConfig3D {
    fn from(d: SkyboxConfig3DDesc) -> Self {
        let mode = match d.mode.as_deref() {
            Some("procedural") => SkyboxMode3D::Procedural,
            Some("cubemap") | Some("panoramic") => SkyboxMode3D::Cubemap,
            _ => SkyboxMode3D::None,
        };
        Self {
            mode,
            sky_color: d
                .sky_color
                .map(|c| Vec4::new(c[0], c[1], c[2], c[3]))
                .unwrap_or(Vec4::new(0.2, 0.45, 0.8, 1.0)),
            horizon_color: d
                .horizon_color
                .map(|c| Vec4::new(c[0], c[1], c[2], c[3]))
                .unwrap_or(Vec4::new(0.65, 0.75, 0.85, 1.0)),
            ground_color: d
                .ground_color
                .map(|c| Vec4::new(c[0], c[1], c[2], c[3]))
                .unwrap_or(Vec4::new(0.08, 0.08, 0.1, 1.0)),
            sun_direction: d
                .sun_direction
                .map(|c| Vec4::new(c[0], c[1], c[2], c[3]))
                .unwrap_or(Vec4::new(0.5, 0.75, 0.4, 0.0)),
            sun_color: d
                .sun_color
                .map(|c| Vec4::new(c[0], c[1], c[2], c[3]))
                .unwrap_or(Vec4::new(1.0, 0.95, 0.8, 2.0)),
            rotation: d.rotation.unwrap_or(0.0),
            texture_id: d.texture_id,
            intensity: d.intensity.unwrap_or(1.0),
            sun_size: d.sun_size.unwrap_or(0.04),
        }
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OutlineConfig3DDesc {
    pub enabled: Option<bool>,
    pub width: Option<f32>,
    pub threshold: Option<f32>,
    pub strength: Option<f32>,
}

impl From<OutlineConfig3DDesc> for OutlineConfig3D {
    fn from(d: OutlineConfig3DDesc) -> Self {
        OutlineConfig3D {
            enabled: d.enabled.unwrap_or(true),
            width: d.width.unwrap_or(1.5),
            threshold: d.threshold.unwrap_or(0.2),
            strength: d.strength.unwrap_or(1.0),
        }
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SsaoConfig3DDesc {
    pub enabled: Option<bool>,
    pub radius: Option<f32>,
    pub bias: Option<f32>,
    pub power: Option<f32>,
    pub intensity: Option<f32>,
    pub blur_radius: Option<u32>,
}

impl From<SsaoConfig3DDesc> for SsaoConfig3D {
    fn from(d: SsaoConfig3DDesc) -> Self {
        Self {
            enabled: d.enabled.unwrap_or(false),
            radius: d.radius.unwrap_or(0.5),
            bias: d.bias.unwrap_or(0.025),
            power: d.power.unwrap_or(1.5),
            intensity: d.intensity.unwrap_or(1.0),
            blur_radius: d.blur_radius.unwrap_or(2),
        }
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BloomConfig3DDesc {
    pub enabled: Option<bool>,
    pub threshold: Option<f32>,
    pub knee: Option<f32>,
    pub intensity: Option<f32>,
    pub scatter: Option<f32>,
}

impl From<BloomConfig3DDesc> for BloomConfig3D {
    fn from(d: BloomConfig3DDesc) -> Self {
        Self {
            enabled: d.enabled.unwrap_or(false),
            threshold: d.threshold.unwrap_or(1.0),
            knee: d.knee.unwrap_or(0.5),
            intensity: d.intensity.unwrap_or(0.8),
            scatter: d.scatter.unwrap_or(0.7),
        }
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EnvironmentRealm3DDesc {
    pub ambient_color: Option<[f32; 4]>,
    pub clear_color: Option<[f32; 4]>,
    pub fog_color: Option<[f32; 4]>,
    pub fog_mode: Option<String>,
    pub fog_start: Option<f32>,
    pub fog_end: Option<f32>,
    pub fog_density: Option<f32>,
    pub exposure: Option<f32>,
    pub skybox: Option<SkyboxConfig3DDesc>,
    pub outline: Option<OutlineConfig3DDesc>,
    pub ssao: Option<SsaoConfig3DDesc>,
    pub bloom: Option<BloomConfig3DDesc>,
}

impl From<EnvironmentRealm3DDesc> for EnvironmentRealm3D {
    fn from(d: EnvironmentRealm3DDesc) -> Self {
        let fog_mode = match d.fog_mode.as_deref() {
            Some("linear") => FogMode3D::Linear,
            Some("exponential") => FogMode3D::Exponential,
            _ => FogMode3D::None,
        };
        EnvironmentRealm3D {
            ambient_color: d
                .ambient_color
                .map(|c| Vec4::new(c[0], c[1], c[2], c[3]))
                .unwrap_or(Vec4::new(0.05, 0.05, 0.05, 1.0)),
            clear_color: d
                .clear_color
                .map(|c| Vec4::new(c[0], c[1], c[2], c[3]))
                .unwrap_or(Vec4::new(0.01, 0.01, 0.02, 1.0)),
            fog_color: d
                .fog_color
                .map(|c| Vec4::new(c[0], c[1], c[2], c[3]))
                .unwrap_or(Vec4::new(0.5, 0.6, 0.7, 1.0)),
            fog_mode,
            fog_start: d.fog_start.unwrap_or(10.0),
            fog_end: d.fog_end.unwrap_or(100.0),
            fog_density: d.fog_density.unwrap_or(0.02),
            exposure: d.exposure.unwrap_or(1.0),
            skybox: d.skybox.map(Into::into).unwrap_or_default(),
            outline: d.outline.map(Into::into).unwrap_or_default(),
            ssao: d.ssao.map(Into::into).unwrap_or_default(),
            bloom: d.bloom.map(Into::into).unwrap_or_default(),
        }
    }
}
