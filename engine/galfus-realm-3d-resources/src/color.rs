//! Color transfer helpers for Realm3D public color inputs.

use glam::{Vec3, Vec4};

/// Converts one normalized sRGB channel to linear light.
///
/// Values outside the normalized `0.0..=1.0` range are already-linear HDR or signed values and
/// pass through unchanged. This preserves explicit intensity values without inventing an sRGB HDR
/// convention.
pub fn srgb_to_linear_channel(value: f32) -> f32 {
    if !(0.0..=1.0).contains(&value) {
        return value;
    }
    if value <= 0.04045 {
        value / 12.92
    } else {
        ((value + 0.055) / 1.055).powf(2.4)
    }
}

/// Converts an sRGB color triplet to linear light.
pub fn srgb_to_linear_rgb(color: Vec3) -> Vec3 {
    Vec3::new(
        srgb_to_linear_channel(color.x),
        srgb_to_linear_channel(color.y),
        srgb_to_linear_channel(color.z),
    )
}

/// Converts the RGB channels of an sRGB color to linear light and preserves alpha.
pub fn srgb_to_linear_rgba(color: Vec4) -> Vec4 {
    srgb_to_linear_rgb(color.truncate()).extend(color.w)
}

/// Converts one normalized linear-light channel to sRGB.
///
/// Values outside the normalized `0.0..=1.0` range pass through unchanged, matching
/// [`srgb_to_linear_channel`]'s HDR behavior.
pub fn linear_to_srgb_channel(value: f32) -> f32 {
    if !(0.0..=1.0).contains(&value) {
        return value;
    }
    if value <= 0.0031308 {
        value * 12.92
    } else {
        value.powf(1.0 / 2.4) * 1.055 - 0.055
    }
}

/// Converts a linear-light color triplet to sRGB.
pub fn linear_to_srgb_rgb(color: Vec3) -> Vec3 {
    Vec3::new(
        linear_to_srgb_channel(color.x),
        linear_to_srgb_channel(color.y),
        linear_to_srgb_channel(color.z),
    )
}

/// Converts the RGB channels of a linear-light color to sRGB and preserves alpha.
pub fn linear_to_srgb_rgba(color: Vec4) -> Vec4 {
    linear_to_srgb_rgb(color.truncate()).extend(color.w)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn srgb_conversion_preserves_alpha_and_hdr_values() {
        let converted = srgb_to_linear_rgba(Vec4::new(0.5, 0.04045, 1.5, 0.25));
        assert!((converted.x - 0.214_041_14).abs() < 1e-6);
        assert!((converted.y - 0.003_130_805).abs() < 1e-6);
        assert_eq!(converted.z, 1.5);
        assert_eq!(converted.w, 0.25);
    }

    #[test]
    fn linear_and_srgb_conversions_round_trip_normalized_values() {
        let input = Vec4::new(0.2, 0.5, 0.8, 0.4);
        let round_trip = srgb_to_linear_rgba(linear_to_srgb_rgba(input));
        assert!((round_trip - input).abs().max_element() < 1e-6);
    }
}
