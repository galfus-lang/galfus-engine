#![allow(clippy::missing_safety_doc)]

use std::ffi::c_char;

use crate::ffi::set_last_error;
use crate::ffi_native_structs::GalfusTransform2D;

const DECOUPLED_MSG: &str = "SVG has been decoupled from Realm2D into galfus-svg-realm";

#[allow(dead_code)]
pub(crate) fn svg_element_rect(
    _realm_id: u32,
    _svg_id: u32,
    _element_id: &str,
) -> Result<serde_json::Value, String> {
    Err(DECOUPLED_MSG.to_string())
}

#[allow(dead_code)]
pub(crate) fn svg_text_layout(
    _realm_id: u32,
    _svg_id: u32,
    _element_id: &str,
) -> Result<serde_json::Value, String> {
    Err(DECOUPLED_MSG.to_string())
}

/// Returns raw shaped text cluster metrics as JSON.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn galfus_realm_2d_get_svg_text_layout(
    _realm_id: u32,
    _svg_id: u32,
    _element_id: *const c_char,
) -> *mut c_char {
    set_last_error(DECOUPLED_MSG);
    std::ptr::null_mut()
}

/// Returns the SVG element bounds as JSON in viewport coordinates.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn galfus_realm_2d_get_svg_element_rect(
    _realm_id: u32,
    _svg_id: u32,
    _element_id: *const c_char,
) -> *mut c_char {
    set_last_error(DECOUPLED_MSG);
    std::ptr::null_mut()
}

/// Creates or updates a 2D SVG vector entity with an initial transform.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn galfus_realm_2d_create_svg(
    _realm_id: u32,
    _svg_id: u32,
    _svg_json: *const c_char,
    _transform_json: *const c_char,
) -> i32 {
    set_last_error(DECOUPLED_MSG);
    -1
}

/// Replaces the source XML markup string of an existing SVG entity.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn galfus_realm_2d_set_svg_source(
    _realm_id: u32,
    _svg_id: u32,
    _svg_xml: *const c_char,
) -> i32 {
    set_last_error(DECOUPLED_MSG);
    -1
}

/// Sets or overwrites an XML attribute on the matching element ID in the SVG.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn galfus_realm_2d_set_svg_attribute(
    _realm_id: u32,
    _svg_id: u32,
    _element_id: *const c_char,
    _attr_name: *const c_char,
    _attr_value: *const c_char,
) -> i32 {
    set_last_error(DECOUPLED_MSG);
    -1
}

/// Removes an XML attribute from the matching element ID in the SVG.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn galfus_realm_2d_remove_svg_attribute(
    _realm_id: u32,
    _svg_id: u32,
    _element_id: *const c_char,
    _attr_name: *const c_char,
) -> i32 {
    set_last_error(DECOUPLED_MSG);
    -1
}

/// Updates the inner text content of the matching element ID in the SVG.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn galfus_realm_2d_set_svg_text(
    _realm_id: u32,
    _svg_id: u32,
    _element_id: *const c_char,
    _text: *const c_char,
) -> i32 {
    set_last_error(DECOUPLED_MSG);
    -1
}

/// Updates the transform of an existing SVG entity via JSON descriptor.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn galfus_realm_2d_set_svg_transform(
    _realm_id: u32,
    _svg_id: u32,
    _transform_json: *const c_char,
) -> i32 {
    set_last_error(DECOUPLED_MSG);
    -1
}

/// Updates the transform of an existing SVG entity via direct float pointer [x, y, rotation, scale_x, scale_y, z_layer, draw_order].
#[unsafe(no_mangle)]
pub unsafe extern "C" fn galfus_realm_2d_set_svg_transform_fast(
    _realm_id: u32,
    _svg_id: u32,
    _ptr: *const f32,
) -> i32 {
    set_last_error(DECOUPLED_MSG);
    -1
}

/// Reads the transform of a 2D SVG entity into a caller-owned fixed-layout value.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn galfus_realm_2d_get_svg_transform(
    _realm_id: u32,
    _svg_id: u32,
    _out: *mut GalfusTransform2D,
) -> i32 {
    set_last_error(DECOUPLED_MSG);
    -1
}

/// Destroys a 2D SVG entity and frees its associated generational pool geometry.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn galfus_realm_2d_destroy_svg(_realm_id: u32, _svg_id: u32) -> i32 {
    set_last_error(DECOUPLED_MSG);
    -1
}
