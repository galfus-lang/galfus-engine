use bytemuck::{Pod, Zeroable};
use glam::{UVec4, Vec4};
use serde::{Deserialize, Serialize};

/// Rendering classification of a 3D surface material.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum SurfaceType3D {
    /// Fully solid geometry writing to depth.
    #[default]
    Opaque,
    /// Alpha-blended semi-transparent surface.
    Transparent,
    /// Alpha-tested punch-through surface (foliage, fences).
    Masked,
    /// Additive blending without depth write (particles, energy, glow).
    Additive,
    /// Screen-space optical refraction with background distortion (glass, water, crystals).
    Refractive,
    /// Planar reflection mirror.
    Mirror,
    /// Visual teleportation gateway.
    Portal,
}

/// Selects which triangle faces a material renders.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum MaterialSide3D {
    /// Render front-facing triangles and cull back-facing triangles.
    #[default]
    Front,
    /// Render back-facing triangles and cull front-facing triangles.
    Back,
    /// Render both triangle faces without culling.
    Double,
}

impl MaterialSide3D {
    /// Every supported triangle-face selection.
    pub const ALL: [Self; 3] = [Self::Front, Self::Back, Self::Double];
}

/// Selects one of the shared filtering and addressing presets for a material texture slot.
///
/// Each selector uses two bits in [`Material3DUniform::flags`], allowing all eight texture
/// slots to select a sampler without increasing the material uniform size.
#[repr(u8)]
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum TextureSampler3D {
    /// Linear filtering with repeat addressing.
    #[default]
    LinearRepeat = 0,
    /// Linear filtering with clamp-to-edge addressing.
    LinearClamp = 1,
    /// Nearest filtering with repeat addressing.
    NearestRepeat = 2,
    /// Nearest filtering with clamp-to-edge addressing.
    NearestClamp = 3,
}

impl TextureSampler3D {
    const BITS_PER_SLOT: u32 = 2;

    /// Packs the sampler selectors for all eight texture slots into a single `u32`.
    pub const fn pack_slots(slots: [Self; 8]) -> u32 {
        let mut packed = 0;
        let mut index = 0;
        while index < slots.len() {
            packed |= (slots[index] as u32) << (index as u32 * Self::BITS_PER_SLOT);
            index += 1;
        }
        packed
    }
}

/// Selects which canonical vertex UV set a material texture slot samples.
///
/// Each selector uses one bit in [`Material3DUniform::flags`].
#[repr(u8)]
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum TextureUvSet3D {
    /// The primary vertex texture coordinates.
    #[default]
    Uv0 = 0,
    /// The secondary vertex texture coordinates.
    Uv1 = 1,
}

impl TextureUvSet3D {
    /// Packs the UV-set selectors for all eight texture slots into a single `u32`.
    pub const fn pack_slots(slots: [Self; 8]) -> u32 {
        let mut packed = 0;
        let mut index = 0;
        while index < slots.len() {
            packed |= (slots[index] as u32) << index;
            index += 1;
        }
        packed
    }
}

/// 3D material properties for PBR or standard forward shading.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Material3D {
    /// Optional human-readable debug label.
    pub label: Option<String>,
    /// Alpha / depth writing behavior.
    pub surface_type: SurfaceType3D,
    /// Alpha threshold used by [`SurfaceType3D::Masked`] materials.
    #[serde(default = "default_alpha_cutoff")]
    pub alpha_cutoff: f32,
    /// Triangle faces rendered by this material. Defaults to [`MaterialSide3D::Front`].
    #[serde(default)]
    pub side: MaterialSide3D,
    /// Base surface RGBA albedo color tint.
    pub base_color: Vec4,
    /// RGB emissive glow color.
    pub emissive_color: Vec4,
    /// Surface micro-roughness `0.0` (smooth) to `1.0` (rough).
    pub roughness: f32,
    /// Metallic factor `0.0` (dielectric) to `1.0` (metal).
    pub metallic: f32,
    /// Specular reflectance scalar (typically `0.5` for common dielectrics).
    pub reflectance: f32,
    /// Index of Refraction (e.g. 1.33 for water, 1.52 for crown glass, 2.42 for diamond).
    #[serde(default = "default_refraction_index")]
    pub refraction_index: f32,
    /// Optical distortion strength for screen-space background displacement.
    #[serde(default = "default_refraction_distortion")]
    pub refraction_distortion: f32,
    /// Optional logical texture ID for diffuse/albedo map (Slot 0).
    pub albedo_texture_id: Option<u32>,
    /// Optional logical texture ID for tangent-space normal map (Slot 1).
    pub normal_texture_id: Option<u32>,
    /// Tangent-space normal map XY strength. Matches glTF `normalTexture.scale`.
    #[serde(default = "default_normal_scale")]
    pub normal_scale: f32,
    /// Optional logical texture ID for metallic/roughness map (Slot 2).
    pub metallic_roughness_texture_id: Option<u32>,
    /// Optional logical texture ID for ambient occlusion map (Slot 3).
    pub occlusion_texture_id: Option<u32>,
    /// Optional logical texture ID for emissive glow map (Slot 4).
    pub emissive_texture_id: Option<u32>,
    /// Universal 8-slot texture array `[Slot 0 .. Slot 7]`.
    #[serde(default = "default_texture_slots")]
    pub texture_slots: [Option<u32>; 8],
    /// Optional shared sampler selection for each texture slot.
    ///
    /// The slot selector is packed as two bits into the material GPU uniform. A surface effect
    /// never needs to observe this implementation detail: internal sampling helpers select the
    /// corresponding sampler for each texture slot.
    #[serde(default)]
    pub texture_samplers: [Option<TextureSampler3D>; 8],
    /// Canonical vertex UV set selected independently by each texture slot.
    #[serde(default = "default_texture_uv_sets")]
    pub texture_uv_sets: [TextureUvSet3D; 8],
    /// Optional custom WGSL snippet implementing `fn surface_effect(in: SurfaceInput) -> SurfaceOutput`.
    pub shader_effect: Option<String>,
    /// Custom parameter vectors `[v0, v1, v2, v3]` passed to `in.custom.v0..v3`.
    #[serde(default = "default_custom_params")]
    pub custom_params: [Vec4; 4],
}

fn default_texture_slots() -> [Option<u32>; 8] {
    [None; 8]
}

fn default_texture_uv_sets() -> [TextureUvSet3D; 8] {
    [TextureUvSet3D::Uv0; 8]
}

fn default_refraction_index() -> f32 {
    1.5
}

fn default_alpha_cutoff() -> f32 {
    0.5
}

fn default_refraction_distortion() -> f32 {
    0.05
}

fn default_normal_scale() -> f32 {
    1.0
}

fn default_custom_params() -> [Vec4; 4] {
    [Vec4::ZERO; 4]
}

impl Default for Material3D {
    fn default() -> Self {
        Self {
            label: None,
            surface_type: SurfaceType3D::Opaque,
            alpha_cutoff: default_alpha_cutoff(),
            side: MaterialSide3D::Front,
            base_color: Vec4::ONE,
            emissive_color: Vec4::ZERO,
            roughness: 0.5,
            metallic: 0.0,
            reflectance: 0.5,
            refraction_index: 1.5,
            refraction_distortion: 0.05,
            albedo_texture_id: None,
            normal_texture_id: None,
            normal_scale: default_normal_scale(),
            metallic_roughness_texture_id: None,
            occlusion_texture_id: None,
            emissive_texture_id: None,
            texture_slots: [None; 8],
            texture_samplers: [None; 8],
            texture_uv_sets: default_texture_uv_sets(),
            shader_effect: None,
            custom_params: [Vec4::ZERO; 4],
        }
    }
}

impl Material3D {
    /// Resolves the effective 8 texture slots, merging specific semantic IDs into the array.
    pub fn resolved_texture_slots(&self) -> [Option<u32>; 8] {
        let mut slots = self.texture_slots;
        if slots[0].is_none() {
            slots[0] = self.albedo_texture_id;
        }
        if slots[1].is_none() {
            slots[1] = self.normal_texture_id;
        }
        if slots[2].is_none() {
            slots[2] = self.metallic_roughness_texture_id;
        }
        if slots[3].is_none() {
            slots[3] = self.occlusion_texture_id;
        }
        if slots[4].is_none() {
            slots[4] = self.emissive_texture_id;
        }
        slots
    }

    /// Returns the compact two-bit sampler selector set consumed by the material shader.
    pub fn packed_texture_samplers(&self) -> u32 {
        TextureSampler3D::pack_slots(
            self.texture_samplers
                .map(|sampler| sampler.unwrap_or_default()),
        )
    }

    /// Returns the compact one-bit UV-set selector set consumed by the material shader.
    pub fn packed_texture_uv_sets(&self) -> u32 {
        TextureUvSet3D::pack_slots(self.texture_uv_sets)
    }

    /// Creates a simple solid color material.
    pub fn solid_color(base_color: Vec4) -> Self {
        Self {
            base_color,
            ..Default::default()
        }
    }

    /// Converts material parameters into a GPU-ready uniform buffer struct.
    pub fn build_uniform(&self) -> Material3DUniform {
        let mut flags = match self.surface_type {
            SurfaceType3D::Opaque => 0u32,
            SurfaceType3D::Transparent => 1u32,
            SurfaceType3D::Masked => 2u32,
            SurfaceType3D::Additive => 3u32,
            SurfaceType3D::Refractive => 4u32,
            SurfaceType3D::Mirror => 5u32,
            SurfaceType3D::Portal => 6u32,
        };

        let slots = self.resolved_texture_slots();
        if slots[0].is_some() {
            flags |= 1 << 4;
        }
        if slots[1].is_some() {
            flags |= 1 << 5;
        }
        if slots[2].is_some() {
            flags |= 1 << 6;
        }
        if slots[3].is_some() {
            flags |= 1 << 7;
        }
        if slots[4].is_some() {
            flags |= 1 << 8;
        }
        if self.shader_effect.is_some() {
            flags |= 1 << 9;
        }

        Material3DUniform {
            base_color: self.base_color,
            emissive_color: self.emissive_color,
            pbr_params: Vec4::new(
                self.roughness,
                self.metallic,
                self.reflectance,
                self.alpha_cutoff.clamp(0.0, 1.0),
            ),
            flags: UVec4::new(
                flags,
                self.packed_texture_samplers(),
                self.packed_texture_uv_sets(),
                0,
            ),
            refraction_params: Vec4::new(
                self.refraction_index,
                self.refraction_distortion,
                self.normal_scale,
                0.0,
            ),
            custom_v0: self.custom_params[0],
            custom_v1: self.custom_params[1],
            custom_v2: self.custom_params[2],
            custom_v3: self.custom_params[3],
        }
    }
}

/// GPU layout of Material3D aligned to 16-byte boundaries (144 bytes total).
#[derive(Debug, Clone, Copy, Pod, Zeroable)]
#[repr(C)]
pub struct Material3DUniform {
    /// Linear base albedo color `[r, g, b, a]`.
    pub base_color: Vec4,
    /// Linear emissive emission `[r, g, b, 1.0]`.
    pub emissive_color: Vec4,
    /// Surface parameters: `[roughness, metallic, reflectance, alpha_cutoff]`.
    pub pbr_params: Vec4,
    /// Surface flags (`x`), eight 2-bit sampler selectors (`y`), and eight UV-set selectors (`z`).
    pub flags: UVec4,
    /// Refraction and normal-map parameters: `[index_of_refraction, distortion_strength, normal_scale, 0.0]`.
    pub refraction_params: Vec4,
    /// Custom parameter vectors v0, v1, v2, v3 (64 bytes).
    pub custom_v0: Vec4,
    pub custom_v1: Vec4,
    pub custom_v2: Vec4,
    pub custom_v3: Vec4,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_material_uniform_alignment() {
        assert_eq!(std::mem::size_of::<Material3DUniform>() % 16, 0);
        let u = Material3DUniform::zeroed();
        let bytes = bytemuck::bytes_of(&u);
        assert_eq!(bytes.len(), std::mem::size_of::<Material3DUniform>());
    }

    #[test]
    fn test_texture_sampler_selectors_are_packed_per_slot() {
        let material = Material3D {
            texture_samplers: [
                None,
                Some(TextureSampler3D::LinearClamp),
                Some(TextureSampler3D::NearestRepeat),
                Some(TextureSampler3D::NearestClamp),
                None,
                None,
                None,
                None,
            ],
            ..Default::default()
        };

        assert_eq!(material.packed_texture_samplers(), 0xE4);
        assert_eq!(material.build_uniform().flags.y, 0xE4);
    }

    #[test]
    fn texture_uv_sets_are_packed_per_slot() {
        let material = Material3D {
            texture_uv_sets: [
                TextureUvSet3D::Uv0,
                TextureUvSet3D::Uv1,
                TextureUvSet3D::Uv0,
                TextureUvSet3D::Uv1,
                TextureUvSet3D::Uv0,
                TextureUvSet3D::Uv0,
                TextureUvSet3D::Uv0,
                TextureUvSet3D::Uv1,
            ],
            ..Default::default()
        };

        assert_eq!(material.packed_texture_uv_sets(), 0x8A);
        assert_eq!(material.build_uniform().flags.z, 0x8A);
        assert_eq!(Material3D::default().build_uniform().flags.z, 0);
    }

    #[test]
    fn alpha_cutoff_is_stable_and_clamped_in_the_uniform() {
        let default_material = Material3D::default();
        assert_eq!(default_material.alpha_cutoff, 0.5);
        assert_eq!(default_material.build_uniform().pbr_params.w, 0.5);

        let material = Material3D {
            surface_type: SurfaceType3D::Masked,
            alpha_cutoff: 2.0,
            ..Default::default()
        };
        let uniform = material.build_uniform();
        assert_eq!(uniform.pbr_params.w, 1.0);
        assert_eq!(uniform.flags.x & 7, 2);
    }

    #[test]
    fn material_side_defaults_to_front() {
        assert_eq!(Material3D::default().side, MaterialSide3D::Front);
    }

    #[test]
    fn normal_scale_defaults_to_one_and_reaches_the_uniform() {
        assert_eq!(Material3D::default().normal_scale, 1.0);

        let material = Material3D {
            normal_scale: 0.35,
            ..Default::default()
        };
        assert_eq!(material.build_uniform().refraction_params.z, 0.35);
    }
}
