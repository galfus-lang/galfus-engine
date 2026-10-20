use serde::Deserialize;
use std::os::raw::c_char;

use crate::ffi::{from_c_str, set_last_error};
use crate::state::with_multiverse_mut;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TextureUpdateDesc {
    pub x: u32,
    pub y: u32,
    pub width: u32,
    pub height: u32,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BufferDesc {
    pub label: Option<String>,
    pub usages: galfus_gpu_manager::BufferUsageFlags,
}

/// Allocates and initializes a shared GPU texture under a host logical ID with raw pixel bytes.
/// Returns 0 on success, -1 on failure.
///
/// # Safety
/// `desc_json` must be a valid, null-terminated UTF-8 C string pointer.
/// `data_ptr` must be valid for reads of `data_len` bytes.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn galfus_resource_create_texture(
    texture_id: u32,
    desc_json: *const c_char,
    data_ptr: *const u8,
    data_len: usize,
) -> i32 {
    let json_str = match unsafe { from_c_str(desc_json) } {
        Ok(s) => s,
        Err(e) => {
            set_last_error(&e);
            return -1;
        }
    };

    let desc: galfus_gpu_manager::GpuTextureDesc = match serde_json::from_str(json_str) {
        Ok(d) => d,
        Err(e) => {
            set_last_error(&format!("Invalid GpuTextureDesc JSON: {e}"));
            return -1;
        }
    };

    if data_ptr.is_null() || data_len == 0 {
        set_last_error("Null or empty texture data buffer");
        return -1;
    }
    let bytes = unsafe { std::slice::from_raw_parts(data_ptr, data_len) };

    match with_multiverse_mut(|mv| {
        mv.create_texture(texture_id, &desc, bytes)
            .map_err(|e| e.to_string())
    }) {
        Ok(()) => 0,
        Err(e) => {
            set_last_error(&e);
            -1
        }
    }
}

/// Updates a sub-rectangle of an existing logical texture with raw pixel bytes.
/// Returns 0 on success, -1 on failure.
///
/// # Safety
/// `rect_json` must be a valid, null-terminated UTF-8 C string pointer.
/// `data_ptr` must be valid for reads of `data_len` bytes.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn galfus_resource_update_texture(
    texture_id: u32,
    rect_json: *const c_char,
    data_ptr: *const u8,
    data_len: usize,
) -> i32 {
    let json_str = match unsafe { from_c_str(rect_json) } {
        Ok(s) => s,
        Err(e) => {
            set_last_error(&e);
            return -1;
        }
    };

    let rect: TextureUpdateDesc = match serde_json::from_str(json_str) {
        Ok(r) => r,
        Err(e) => {
            set_last_error(&format!("Invalid TextureUpdateDesc JSON: {e}"));
            return -1;
        }
    };

    if data_ptr.is_null() || data_len == 0 {
        set_last_error("Null or empty texture update buffer");
        return -1;
    }
    let bytes = unsafe { std::slice::from_raw_parts(data_ptr, data_len) };

    match with_multiverse_mut(|mv| {
        mv.write_texture(texture_id, rect.x, rect.y, rect.width, rect.height, bytes)
            .map_err(|e| e.to_string())
    }) {
        Ok(()) => 0,
        Err(e) => {
            set_last_error(&e);
            -1
        }
    }
}

/// Disposes a shared logical texture from GPU memory. Returns 0 on success, -1 on failure.
#[unsafe(no_mangle)]
pub extern "C" fn galfus_resource_dispose_texture(texture_id: u32) -> i32 {
    match with_multiverse_mut(|mv| mv.dispose_texture(texture_id).map_err(|e| e.to_string())) {
        Ok(()) => 0,
        Err(e) => {
            set_last_error(&e);
            -1
        }
    }
}

/// Allocates and initializes a shared GPU buffer under a host logical ID with raw byte contents.
/// Returns 0 on success, -1 on failure.
///
/// # Safety
/// `desc_json` must be a valid, null-terminated UTF-8 C string pointer.
/// `data_ptr` must be valid for reads of `data_len` bytes.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn galfus_resource_create_buffer(
    buffer_id: u32,
    desc_json: *const c_char,
    data_ptr: *const u8,
    data_len: usize,
) -> i32 {
    let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        let json_str = match unsafe { from_c_str(desc_json) } {
            Ok(s) => s,
            Err(e) => {
                set_last_error(&e);
                return -1;
            }
        };

        let desc: BufferDesc = match serde_json::from_str(json_str) {
            Ok(d) => d,
            Err(e) => {
                set_last_error(&format!("Invalid BufferDesc JSON: {e}"));
                return -1;
            }
        };

        if data_ptr.is_null() || data_len == 0 {
            set_last_error("Null or empty buffer data");
            return -1;
        }
        let bytes = unsafe { std::slice::from_raw_parts(data_ptr, data_len) };

        match with_multiverse_mut(|mv| {
            mv.create_buffer(buffer_id, desc.label.as_deref(), bytes, desc.usages)
                .map_err(|e| e.to_string())
        }) {
            Ok(()) => 0,
            Err(e) => {
                set_last_error(&e);
                -1
            }
        }
    }));

    match result {
        Ok(code) => code,
        Err(payload) => {
            let msg = if let Some(s) = payload.downcast_ref::<&str>() {
                s.to_string()
            } else if let Some(s) = payload.downcast_ref::<String>() {
                s.clone()
            } else {
                "Unknown panic".to_string()
            };
            set_last_error(&msg);
            -1
        }
    }
}

/// Updates byte contents of an existing logical buffer at a given offset with raw byte contents.
/// Returns 0 on success, -1 on failure.
///
/// # Safety
/// `data_ptr` must be valid for reads of `data_len` bytes.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn galfus_resource_update_buffer(
    buffer_id: u32,
    offset: u64,
    data_ptr: *const u8,
    data_len: usize,
) -> i32 {
    if data_ptr.is_null() || data_len == 0 {
        set_last_error("Null or empty buffer update data");
        return -1;
    }
    let bytes = unsafe { std::slice::from_raw_parts(data_ptr, data_len) };

    match with_multiverse_mut(|mv| {
        mv.write_buffer(buffer_id, offset, bytes)
            .map_err(|e| e.to_string())
    }) {
        Ok(()) => 0,
        Err(e) => {
            set_last_error(&e);
            -1
        }
    }
}

/// Disposes a shared logical buffer from GPU memory. Returns 0 on success, -1 on failure.
#[unsafe(no_mangle)]
pub extern "C" fn galfus_resource_dispose_buffer(buffer_id: u32) -> i32 {
    match with_multiverse_mut(|mv| mv.dispose_buffer(buffer_id).map_err(|e| e.to_string())) {
        Ok(()) => 0,
        Err(e) => {
            set_last_error(&e);
            -1
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ffi::{galfus_platform_init_headless, galfus_platform_shutdown};
    use std::ffi::CString;

    #[test]
    fn test_ffi_resource_lifecycle() {
        assert_eq!(galfus_platform_init_headless(), 0);

        // 1. Create Texture (2x2 rgba8 = 16 bytes)
        let tex_desc =
            CString::new(r#"{"label":"TestTexture","width":2,"height":2,"format":"rgba8Unorm"}"#)
                .unwrap();
        let tex_data = [255u8; 16];
        assert_eq!(
            unsafe {
                galfus_resource_create_texture(
                    10,
                    tex_desc.as_ptr(),
                    tex_data.as_ptr(),
                    tex_data.len(),
                )
            },
            0
        );

        // 2. Update Texture sub-rectangle
        let tex_update = CString::new(r#"{"x":0,"y":0,"width":1,"height":1}"#).unwrap();
        let tex_pixel = [128u8, 128, 0, 255];
        assert_eq!(
            unsafe {
                galfus_resource_update_texture(
                    10,
                    tex_update.as_ptr(),
                    tex_pixel.as_ptr(),
                    tex_pixel.len(),
                )
            },
            0
        );

        // 3. Dispose Texture
        assert_eq!(galfus_resource_dispose_texture(10), 0);
        assert_eq!(galfus_resource_dispose_texture(10), -1);

        // 4. Create Buffer (8 bytes = multiple of 4)
        let buf_desc =
            CString::new(r#"{"label":"TestBuffer","usages":{"vertex":true,"copyDst":true}}"#)
                .unwrap();
        let buf_data = [1u8, 2, 3, 4, 5, 6, 7, 8];
        assert_eq!(
            unsafe {
                galfus_resource_create_buffer(
                    20,
                    buf_desc.as_ptr(),
                    buf_data.as_ptr(),
                    buf_data.len(),
                )
            },
            0
        );

        // 5. Update Buffer (4 bytes at offset 4)
        let buf_update_data = [115u8, 88, 77, 66];
        assert_eq!(
            unsafe {
                galfus_resource_update_buffer(
                    20,
                    4,
                    buf_update_data.as_ptr(),
                    buf_update_data.len(),
                )
            },
            0
        );

        // 6. Dispose Buffer
        assert_eq!(galfus_resource_dispose_buffer(20), 0);
        assert_eq!(galfus_resource_dispose_buffer(20), -1);

        assert_eq!(galfus_platform_shutdown(), 0);
    }
}
