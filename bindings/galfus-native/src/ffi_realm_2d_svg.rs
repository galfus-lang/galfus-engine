#![allow(clippy::missing_safety_doc)]

use std::ffi::c_char;

use galfus_realm_2d::Realm2DContext;
use galfus_realm_2d_resources::svg::Svg2DDesc;
use galfus_realm_2d_resources::transform::Transform2D;

use crate::ffi::{from_c_str, set_last_error, to_c_string};
use crate::ffi_native_structs::GalfusTransform2D;
use crate::ffi_realm_2d_desc::Transform2DDesc;
use crate::state::{with_multiverse, with_multiverse_mut};

unsafe fn parse_transform_2d(transform_json: *const c_char) -> Result<Transform2D, String> {
    if transform_json.is_null() {
        return Err("Transform JSON pointer is null".to_string());
    }
    let s = unsafe { from_c_str(transform_json) }.map_err(|e| e.to_string())?;
    let d: Transform2DDesc =
        serde_json::from_str(s).map_err(|e| format!("Invalid Transform2DDesc: {e}"))?;
    Ok(d.into())
}

/// Creates or updates a 2D SVG vector entity with an initial transform.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn galfus_realm_2d_create_svg(
    realm_id: u32,
    svg_id: u32,
    svg_json: *const c_char,
    transform_json: *const c_char,
) -> i32 {
    let svg_desc: Svg2DDesc = match serde_json::from_str(match unsafe { from_c_str(svg_json) } {
        Ok(s) => s,
        Err(e) => {
            set_last_error(&e);
            return -1;
        }
    }) {
        Ok(d) => d,
        Err(e) => {
            set_last_error(&format!("Invalid Svg2DDesc: {e}"));
            return -1;
        }
    };
    let trans = match unsafe { parse_transform_2d(transform_json) } {
        Ok(t) => t,
        Err(e) => {
            set_last_error(&e);
            return -1;
        }
    };

    match with_multiverse_mut(|mv| {
        let realm = mv
            .get_realm_mut::<Realm2DContext>(realm_id)
            .ok_or_else(|| format!("Realm2D #{realm_id} not found"))?;
        realm
            .set_svg(svg_id, svg_desc.into(), trans)
            .map_err(|e| e.to_string())?;
        Ok(())
    }) {
        Ok(()) => 0,
        Err(e) => {
            set_last_error(&e);
            -1
        }
    }
}

/// Replaces the source XML markup string of an existing SVG entity.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn galfus_realm_2d_set_svg_source(
    realm_id: u32,
    svg_id: u32,
    svg_xml: *const c_char,
) -> i32 {
    let xml = match unsafe { from_c_str(svg_xml) } {
        Ok(s) => s.to_string(),
        Err(e) => {
            set_last_error(&e);
            return -1;
        }
    };

    match with_multiverse_mut(|mv| {
        let realm = mv
            .get_realm_mut::<Realm2DContext>(realm_id)
            .ok_or_else(|| format!("Realm2D #{realm_id} not found"))?;
        realm
            .set_svg_source(svg_id, xml)
            .map_err(|e| e.to_string())?;
        Ok(())
    }) {
        Ok(()) => 0,
        Err(e) => {
            set_last_error(&e);
            -1
        }
    }
}

/// Sets or overwrites an XML attribute on the matching element ID in the SVG.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn galfus_realm_2d_set_svg_attribute(
    realm_id: u32,
    svg_id: u32,
    element_id: *const c_char,
    attr_name: *const c_char,
    attr_value: *const c_char,
) -> i32 {
    let elem_id = match unsafe { from_c_str(element_id) } {
        Ok(s) => s,
        Err(e) => {
            set_last_error(&e);
            return -1;
        }
    };
    let name = match unsafe { from_c_str(attr_name) } {
        Ok(s) => s,
        Err(e) => {
            set_last_error(&e);
            return -1;
        }
    };
    let val = match unsafe { from_c_str(attr_value) } {
        Ok(s) => s,
        Err(e) => {
            set_last_error(&e);
            return -1;
        }
    };

    match with_multiverse_mut(|mv| {
        let realm = mv
            .get_realm_mut::<Realm2DContext>(realm_id)
            .ok_or_else(|| format!("Realm2D #{realm_id} not found"))?;
        realm
            .set_svg_attribute(svg_id, elem_id, name, val)
            .map_err(|e| e.to_string())?;
        Ok(())
    }) {
        Ok(()) => 0,
        Err(e) => {
            set_last_error(&e);
            -1
        }
    }
}

/// Removes an XML attribute from the matching element ID in the SVG.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn galfus_realm_2d_remove_svg_attribute(
    realm_id: u32,
    svg_id: u32,
    element_id: *const c_char,
    attr_name: *const c_char,
) -> i32 {
    let elem_id = match unsafe { from_c_str(element_id) } {
        Ok(s) => s,
        Err(e) => {
            set_last_error(&e);
            return -1;
        }
    };
    let name = match unsafe { from_c_str(attr_name) } {
        Ok(s) => s,
        Err(e) => {
            set_last_error(&e);
            return -1;
        }
    };

    match with_multiverse_mut(|mv| {
        let realm = mv
            .get_realm_mut::<Realm2DContext>(realm_id)
            .ok_or_else(|| format!("Realm2D #{realm_id} not found"))?;
        realm
            .remove_svg_attribute(svg_id, elem_id, name)
            .map_err(|e| e.to_string())?;
        Ok(())
    }) {
        Ok(()) => 0,
        Err(e) => {
            set_last_error(&e);
            -1
        }
    }
}

/// Updates the inner text content of the matching element ID in the SVG.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn galfus_realm_2d_set_svg_text(
    realm_id: u32,
    svg_id: u32,
    element_id: *const c_char,
    text_content: *const c_char,
) -> i32 {
    let elem_id = match unsafe { from_c_str(element_id) } {
        Ok(s) => s,
        Err(e) => {
            set_last_error(&e);
            return -1;
        }
    };
    let text = match unsafe { from_c_str(text_content) } {
        Ok(s) => s,
        Err(e) => {
            set_last_error(&e);
            return -1;
        }
    };

    match with_multiverse_mut(|mv| {
        let realm = mv
            .get_realm_mut::<Realm2DContext>(realm_id)
            .ok_or_else(|| format!("Realm2D #{realm_id} not found"))?;
        realm
            .set_svg_text(svg_id, elem_id, text)
            .map_err(|e| e.to_string())?;
        Ok(())
    }) {
        Ok(()) => 0,
        Err(e) => {
            set_last_error(&e);
            -1
        }
    }
}

/// Updates the transform of an existing SVG entity via JSON descriptor.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn galfus_realm_2d_set_svg_transform(
    realm_id: u32,
    svg_id: u32,
    transform: *const GalfusTransform2D,
) -> i32 {
    if transform.is_null() {
        set_last_error("Null pointer passed to set_svg_transform");
        return -1;
    }
    // SAFETY: The pointer was checked above and copied before this function returns.
    let trans = unsafe { (*transform).into() };

    match with_multiverse_mut(|mv| {
        let realm = mv
            .get_realm_mut::<Realm2DContext>(realm_id)
            .ok_or_else(|| format!("Realm2D #{realm_id} not found"))?;
        realm
            .set_svg_transform(svg_id, trans)
            .map_err(|e| e.to_string())?;
        Ok(())
    }) {
        Ok(()) => 0,
        Err(e) => {
            set_last_error(&e);
            -1
        }
    }
}

/// Reads the transform of a 2D SVG entity into a caller-owned fixed-layout value.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn galfus_realm_2d_get_svg_transform(
    realm_id: u32,
    svg_id: u32,
    out_transform: *mut GalfusTransform2D,
) -> i32 {
    if out_transform.is_null() {
        set_last_error("Null pointer passed to get_svg_transform");
        return -1;
    }
    match with_multiverse(|mv| {
        let realm = mv
            .get_realm::<Realm2DContext>(realm_id)
            .ok_or_else(|| format!("Realm2D #{realm_id} not found"))?;
        let t = realm
            .get_svg_transform(svg_id)
            .ok_or_else(|| format!("SVG #{svg_id} not found in Realm2D #{realm_id}"))?;
        // SAFETY: The pointer was checked above and points to one caller-owned output struct.
        unsafe { *out_transform = t.into() };
        Ok(())
    }) {
        Ok(()) => 0,
        Err(e) => {
            set_last_error(&e);
            -1
        }
    }
}

/// Destroys an existing 2D SVG entity.
#[unsafe(no_mangle)]
pub extern "C" fn galfus_realm_2d_destroy_svg(realm_id: u32, svg_id: u32) -> i32 {
    match with_multiverse_mut(|mv| {
        let realm = mv
            .get_realm_mut::<Realm2DContext>(realm_id)
            .ok_or_else(|| format!("Realm2D #{realm_id} not found"))?;
        realm.destroy_svg(svg_id).map_err(|e| e.to_string())?;
        Ok(())
    }) {
        Ok(()) => 0,
        Err(e) => {
            set_last_error(&e);
            -1
        }
    }
}

/// Registers raw TTF/OTF font binary data from memory (zero filesystem access).
///
/// Accepts raw font buffer pointer and length, returning the detected font family name as a C string.
///
/// # Safety
/// `data_ptr` must be valid for reads of `data_len` bytes.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn galfus_realm_2d_load_font_data(
    realm_id: u32,
    data_ptr: *const u8,
    data_len: usize,
) -> *mut c_char {
    if data_ptr.is_null() || data_len == 0 {
        set_last_error("Null or empty font buffer");
        return std::ptr::null_mut();
    }
    let bytes = unsafe { std::slice::from_raw_parts(data_ptr, data_len) };

    match with_multiverse_mut(|mv| {
        let realm = mv
            .get_realm_mut::<Realm2DContext>(realm_id)
            .ok_or_else(|| format!("Realm2D #{realm_id} not found"))?;
        let family = realm.load_font_data(bytes).map_err(|e| e.to_string())?;
        Ok(family)
    }) {
        Ok(family) => to_c_string(&family),
        Err(e) => {
            set_last_error(&e);
            std::ptr::null_mut()
        }
    }
}
