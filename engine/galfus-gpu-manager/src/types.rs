use serde::{Deserialize, Serialize};

/// Transfer function encoded by a GPU texture format.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum TextureColorSpace {
    /// Texture samples are already linear data.
    #[default]
    Linear,
    /// Texture samples are decoded from sRGB to linear by the GPU.
    Srgb,
}

/// Normalized texture pixel format.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum NormalizedTextureFormat {
    R8Unorm,
    Rg8Unorm,
    Rgba8Unorm,
    Rgba8UnormSrgb,
    Bgra8Unorm,
    Bgra8UnormSrgb,
    R16Float,
    Rg16Float,
    Rgba16Float,
    R32Float,
    Rg32Float,
    Rgba32Float,
    Depth32Float,
    Depth24Plus,
    Depth24PlusStencil8,
}

impl NormalizedTextureFormat {
    /// Returns the transfer function associated with this texture format.
    pub const fn color_space(self) -> TextureColorSpace {
        match self {
            Self::Rgba8UnormSrgb | Self::Bgra8UnormSrgb => TextureColorSpace::Srgb,
            _ => TextureColorSpace::Linear,
        }
    }

    /// Converts to the corresponding `wgpu::TextureFormat`.
    pub fn to_wgpu(self) -> wgpu::TextureFormat {
        match self {
            Self::R8Unorm => wgpu::TextureFormat::R8Unorm,
            Self::Rg8Unorm => wgpu::TextureFormat::Rg8Unorm,
            Self::Rgba8Unorm => wgpu::TextureFormat::Rgba8Unorm,
            Self::Rgba8UnormSrgb => wgpu::TextureFormat::Rgba8UnormSrgb,
            Self::Bgra8Unorm => wgpu::TextureFormat::Bgra8Unorm,
            Self::Bgra8UnormSrgb => wgpu::TextureFormat::Bgra8UnormSrgb,
            Self::R16Float => wgpu::TextureFormat::R16Float,
            Self::Rg16Float => wgpu::TextureFormat::Rg16Float,
            Self::Rgba16Float => wgpu::TextureFormat::Rgba16Float,
            Self::R32Float => wgpu::TextureFormat::R32Float,
            Self::Rg32Float => wgpu::TextureFormat::Rg32Float,
            Self::Rgba32Float => wgpu::TextureFormat::Rgba32Float,
            Self::Depth32Float => wgpu::TextureFormat::Depth32Float,
            Self::Depth24Plus => wgpu::TextureFormat::Depth24Plus,
            Self::Depth24PlusStencil8 => wgpu::TextureFormat::Depth24PlusStencil8,
        }
    }

    /// Tries to parse from standard format names.
    pub fn parse_str(s: &str) -> Option<Self> {
        match s.to_ascii_lowercase().replace(['-', '_'], "").as_str() {
            "r8unorm" => Some(Self::R8Unorm),
            "rg8unorm" => Some(Self::Rg8Unorm),
            "rgba8unorm" => Some(Self::Rgba8Unorm),
            "rgba8unormsrgb" => Some(Self::Rgba8UnormSrgb),
            "bgra8unorm" => Some(Self::Bgra8Unorm),
            "bgra8unormsrgb" => Some(Self::Bgra8UnormSrgb),
            "r16float" => Some(Self::R16Float),
            "rg16float" => Some(Self::Rg16Float),
            "rgba16float" => Some(Self::Rgba16Float),
            "r32float" => Some(Self::R32Float),
            "rg32float" => Some(Self::Rg32Float),
            "rgba32float" => Some(Self::Rgba32Float),
            "depth32float" | "depth32" => Some(Self::Depth32Float),
            "depth24plus" | "depth24" => Some(Self::Depth24Plus),
            "depth24plusstencil8" => Some(Self::Depth24PlusStencil8),
            _ => None,
        }
    }
}

/// Normalized texture dimension.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum TextureDimension {
    D1,
    #[default]
    D2,
    D3,
}

impl TextureDimension {
    pub fn to_wgpu(self) -> wgpu::TextureDimension {
        match self {
            Self::D1 => wgpu::TextureDimension::D1,
            Self::D2 => wgpu::TextureDimension::D2,
            Self::D3 => wgpu::TextureDimension::D3,
        }
    }
}

/// Normalized texture usage flags.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TextureUsageFlags {
    #[serde(default)]
    pub copy_src: bool,
    #[serde(default)]
    pub copy_dst: bool,
    #[serde(default)]
    pub texture_binding: bool,
    #[serde(default)]
    pub storage_binding: bool,
    #[serde(default)]
    pub render_attachment: bool,
}

impl Default for TextureUsageFlags {
    fn default() -> Self {
        Self {
            copy_src: false,
            copy_dst: true,
            texture_binding: true,
            storage_binding: false,
            render_attachment: true,
        }
    }
}

impl TextureUsageFlags {
    pub fn to_wgpu(self) -> wgpu::TextureUsages {
        let mut usages = wgpu::TextureUsages::empty();
        if self.copy_src {
            usages |= wgpu::TextureUsages::COPY_SRC;
        }
        if self.copy_dst {
            usages |= wgpu::TextureUsages::COPY_DST;
        }
        if self.texture_binding {
            usages |= wgpu::TextureUsages::TEXTURE_BINDING;
        }
        if self.storage_binding {
            usages |= wgpu::TextureUsages::STORAGE_BINDING;
        }
        if self.render_attachment {
            usages |= wgpu::TextureUsages::RENDER_ATTACHMENT;
        }
        usages
    }
}

/// Description for creating a GPU texture.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GpuTextureDesc {
    pub label: Option<String>,
    pub width: u32,
    pub height: u32,
    #[serde(default = "default_depth")]
    pub depth_or_layers: u32,
    #[serde(default)]
    pub mip_levels: u32,
    #[serde(default = "default_sample_count")]
    pub sample_count: u32,
    #[serde(default)]
    pub dimension: TextureDimension,
    pub format: NormalizedTextureFormat,
    #[serde(default)]
    pub usages: TextureUsageFlags,
}

impl GpuTextureDesc {
    /// Returns the color space encoded by this texture's pixel format.
    pub const fn color_space(&self) -> TextureColorSpace {
        self.format.color_space()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn texture_format_is_the_color_space_source_of_truth() {
        assert_eq!(
            NormalizedTextureFormat::Rgba8Unorm.color_space(),
            TextureColorSpace::Linear
        );
        assert_eq!(
            NormalizedTextureFormat::Rgba8UnormSrgb.color_space(),
            TextureColorSpace::Srgb
        );
        assert_eq!(
            NormalizedTextureFormat::Bgra8UnormSrgb.color_space(),
            TextureColorSpace::Srgb
        );
    }
}

fn default_depth() -> u32 {
    1
}

fn default_sample_count() -> u32 {
    1
}

/// Normalized buffer usage flags.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BufferUsageFlags {
    #[serde(default)]
    pub vertex: bool,
    #[serde(default)]
    pub index: bool,
    #[serde(default)]
    pub uniform: bool,
    #[serde(default)]
    pub storage: bool,
    #[serde(default)]
    pub copy_src: bool,
    #[serde(default)]
    pub copy_dst: bool,
}

impl BufferUsageFlags {
    pub const VERTEX: Self = Self {
        vertex: true,
        index: false,
        uniform: false,
        storage: false,
        copy_src: false,
        copy_dst: true,
    };

    pub const INDEX: Self = Self {
        vertex: false,
        index: true,
        uniform: false,
        storage: false,
        copy_src: false,
        copy_dst: true,
    };

    pub const UNIFORM: Self = Self {
        vertex: false,
        index: false,
        uniform: true,
        storage: false,
        copy_src: false,
        copy_dst: true,
    };

    pub const STORAGE: Self = Self {
        vertex: false,
        index: false,
        uniform: false,
        storage: true,
        copy_src: false,
        copy_dst: true,
    };

    pub fn to_wgpu(self) -> wgpu::BufferUsages {
        let mut usages = wgpu::BufferUsages::empty();
        if self.vertex {
            usages |= wgpu::BufferUsages::VERTEX;
        }
        if self.index {
            usages |= wgpu::BufferUsages::INDEX;
        }
        if self.uniform {
            usages |= wgpu::BufferUsages::UNIFORM;
        }
        if self.storage {
            usages |= wgpu::BufferUsages::STORAGE;
        }
        if self.copy_src {
            usages |= wgpu::BufferUsages::COPY_SRC;
        }
        if self.copy_dst {
            usages |= wgpu::BufferUsages::COPY_DST;
        }
        usages
    }
}

/// Description for creating a GPU buffer.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GpuBufferDesc {
    pub label: Option<String>,
    pub size: u64,
    pub usages: BufferUsageFlags,
    #[serde(default)]
    pub mapped_at_creation: bool,
}

/// Texture filtering mode.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum FilterMode {
    #[default]
    Nearest,
    Linear,
}

impl FilterMode {
    pub fn to_wgpu(self) -> wgpu::FilterMode {
        match self {
            Self::Nearest => wgpu::FilterMode::Nearest,
            Self::Linear => wgpu::FilterMode::Linear,
        }
    }

    pub fn to_wgpu_mipmap(self) -> wgpu::MipmapFilterMode {
        match self {
            Self::Nearest => wgpu::MipmapFilterMode::Nearest,
            Self::Linear => wgpu::MipmapFilterMode::Linear,
        }
    }
}

/// Texture address / wrap mode.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum AddressMode {
    #[default]
    ClampToEdge,
    Repeat,
    MirrorRepeat,
}

impl AddressMode {
    pub fn to_wgpu(self) -> wgpu::AddressMode {
        match self {
            Self::ClampToEdge => wgpu::AddressMode::ClampToEdge,
            Self::Repeat => wgpu::AddressMode::Repeat,
            Self::MirrorRepeat => wgpu::AddressMode::MirrorRepeat,
        }
    }
}

/// Sampler comparison function for shadow mapping.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum CompareFunction {
    Never,
    Less,
    Equal,
    LessEqual,
    Greater,
    NotEqual,
    GreaterEqual,
    Always,
}

impl CompareFunction {
    pub fn to_wgpu(self) -> wgpu::CompareFunction {
        match self {
            Self::Never => wgpu::CompareFunction::Never,
            Self::Less => wgpu::CompareFunction::Less,
            Self::Equal => wgpu::CompareFunction::Equal,
            Self::LessEqual => wgpu::CompareFunction::LessEqual,
            Self::Greater => wgpu::CompareFunction::Greater,
            Self::NotEqual => wgpu::CompareFunction::NotEqual,
            Self::GreaterEqual => wgpu::CompareFunction::GreaterEqual,
            Self::Always => wgpu::CompareFunction::Always,
        }
    }
}

/// Description for creating a GPU sampler.
#[derive(Debug, Clone, PartialEq, Eq, Hash, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GpuSamplerDesc {
    pub label: Option<String>,
    #[serde(default)]
    pub address_mode_u: AddressMode,
    #[serde(default)]
    pub address_mode_v: AddressMode,
    #[serde(default)]
    pub address_mode_w: AddressMode,
    #[serde(default)]
    pub mag_filter: FilterMode,
    #[serde(default)]
    pub min_filter: FilterMode,
    #[serde(default)]
    pub mipmap_filter: FilterMode,
    pub compare: Option<CompareFunction>,
}

/// Normalized surface presentation mode.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum GpuPresentMode {
    #[default]
    AutoVsync,
    AutoNoVsync,
    Immediate,
    Mailbox,
    Fifo,
}

impl GpuPresentMode {
    pub fn to_wgpu(self) -> wgpu::PresentMode {
        match self {
            Self::AutoVsync => wgpu::PresentMode::AutoVsync,
            Self::AutoNoVsync => wgpu::PresentMode::AutoNoVsync,
            Self::Immediate => wgpu::PresentMode::Immediate,
            Self::Mailbox => wgpu::PresentMode::Mailbox,
            Self::Fifo => wgpu::PresentMode::Fifo,
        }
    }
}
