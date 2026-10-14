use serde::Deserialize;
use std::os::raw::c_char;

use crate::ffi::{from_c_str, set_last_error};
use crate::state::with_multiverse_mut;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct TextureCreatePayload {
    desc: galfus_gpu_manager::GpuTextureDesc,
    data_base64: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct TextureUpdatePayload {
    x: u32,
    y: u32,
    width: u32,
    height: u32,
    data_base64: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct BufferCreatePayload {
    label: Option<String>,
    usages: galfus_gpu_manager::BufferUsageFlags,
    data_base64: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct BufferUpdatePayload {
    offset: u64,
    data_base64: String,
}

/// Decodes standard base64 byte contents.
pub(crate) fn decode_base64(input: &str) -> Result<Vec<u8>, String> {
    let input = input.trim();
    let mut out = Vec::with_capacity(input.len() * 3 / 4);
    let mut buf = 0u32;
    let mut bits = 0u32;
    for &b in input.as_bytes() {
        if b == b'=' {
            break;
        }
        if b.is_ascii_whitespace() {
            continue;
        }
        let val = match b {
            b'A'..=b'Z' => b - b'A',
            b'a'..=b'z' => b - b'a' + 26,
            b'0'..=b'9' => b - b'0' + 52,
            b'+' => 62,
            b'/' => 63,
            _ => return Err(format!("Invalid base64 character: {}", b as char)),
        };
        buf = (buf << 6) | (val as u32);
        bits += 6;
        if bits >= 8 {
            bits -= 8;
            out.push((buf >> bits) as u8);
        }
    }
    Ok(out)
}

/// Allocates and initializes a shared GPU texture under a host logical ID.
/// Returns 0 on success, -1 on failure.
///
/// # Safety
/// `payload_json` must be a valid, null-terminated UTF-8 C string pointer.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn galfus_resource_create_texture(
    texture_id: u32,
    payload_json: *const c_char,
) -> i32 {
    let json_str = match unsafe { from_c_str(payload_json) } {
        Ok(s) => s,
        Err(e) => {
            set_last_error(&e);
            return -1;
        }
    };

    let payload: TextureCreatePayload = match serde_json::from_str(json_str) {
        Ok(p) => p,
        Err(e) => {
            set_last_error(&format!("Invalid TextureCreatePayload JSON: {e}"));
            return -1;
        }
    };

    let bytes = match decode_base64(&payload.data_base64) {
        Ok(b) => b,
        Err(e) => {
            set_last_error(&format!("Failed to decode base64 texture data: {e}"));
            return -1;
        }
    };

    match with_multiverse_mut(|mv| {
        mv.create_texture(texture_id, &payload.desc, &bytes)
            .map_err(|e| e.to_string())
    }) {
        Ok(()) => 0,
        Err(e) => {
            set_last_error(&e);
            -1
        }
    }
}

/// Updates a sub-rectangle of an existing logical texture with base64 pixel data.
/// Returns 0 on success, -1 on failure.
///
/// # Safety
/// `payload_json` must be a valid, null-terminated UTF-8 C string pointer.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn galfus_resource_update_texture(
    texture_id: u32,
    payload_json: *const c_char,
) -> i32 {
    let json_str = match unsafe { from_c_str(payload_json) } {
        Ok(s) => s,
        Err(e) => {
            set_last_error(&e);
            return -1;
        }
    };

    let payload: TextureUpdatePayload = match serde_json::from_str(json_str) {
        Ok(p) => p,
        Err(e) => {
            set_last_error(&format!("Invalid TextureUpdatePayload JSON: {e}"));
            return -1;
        }
    };

    let bytes = match decode_base64(&payload.data_base64) {
        Ok(b) => b,
        Err(e) => {
            set_last_error(&format!("Failed to decode base64 texture data: {e}"));
            return -1;
        }
    };

    match with_multiverse_mut(|mv| {
        mv.write_texture(
            texture_id,
            payload.x,
            payload.y,
            payload.width,
            payload.height,
            &bytes,
        )
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

/// Allocates and initializes a shared GPU buffer under a host logical ID.
/// Returns 0 on success, -1 on failure.
///
/// # Safety
/// `payload_json` must be a valid, null-terminated UTF-8 C string pointer.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn galfus_resource_create_buffer(
    buffer_id: u32,
    payload_json: *const c_char,
) -> i32 {
    let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        let json_str = match unsafe { from_c_str(payload_json) } {
            Ok(s) => s,
            Err(e) => {
                set_last_error(&e);
                return -1;
            }
        };

        let payload: BufferCreatePayload = match serde_json::from_str(json_str) {
            Ok(p) => p,
            Err(e) => {
                set_last_error(&format!("Invalid BufferCreatePayload JSON: {e}"));
                return -1;
            }
        };

        let bytes = match decode_base64(&payload.data_base64) {
            Ok(b) => b,
            Err(e) => {
                set_last_error(&format!("Failed to decode base64 buffer contents: {e}"));
                return -1;
            }
        };

        match with_multiverse_mut(|mv| {
            mv.create_buffer(buffer_id, payload.label.as_deref(), &bytes, payload.usages)
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

/// Updates byte contents of an existing logical buffer at a given offset.
/// Returns 0 on success, -1 on failure.
///
/// # Safety
/// `payload_json` must be a valid, null-terminated UTF-8 C string pointer.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn galfus_resource_update_buffer(
    buffer_id: u32,
    payload_json: *const c_char,
) -> i32 {
    let json_str = match unsafe { from_c_str(payload_json) } {
        Ok(s) => s,
        Err(e) => {
            set_last_error(&e);
            return -1;
        }
    };

    let payload: BufferUpdatePayload = match serde_json::from_str(json_str) {
        Ok(p) => p,
        Err(e) => {
            set_last_error(&format!("Invalid BufferUpdatePayload JSON: {e}"));
            return -1;
        }
    };

    let bytes = match decode_base64(&payload.data_base64) {
        Ok(b) => b,
        Err(e) => {
            set_last_error(&format!("Failed to decode base64 buffer contents: {e}"));
            return -1;
        }
    };

    match with_multiverse_mut(|mv| {
        mv.write_buffer(buffer_id, payload.offset, &bytes)
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
    fn test_base64_decode() {
        assert_eq!(decode_base64("").unwrap(), Vec::<u8>::new());
        assert_eq!(decode_base64("AQID").unwrap(), vec![1, 2, 3]);
        assert_eq!(decode_base64("AP/+/w==").unwrap(), vec![0, 255, 254, 255]);
        assert!(decode_base64("invalid!").is_err());
    }

    #[test]
    fn test_ffi_resource_lifecycle() {
        assert_eq!(galfus_platform_init_headless(), 0);

        // 1. Create Texture (2x2 rgba8 = 16 bytes)
        let tex_payload = CString::new(
            r#"{"desc":{"label":"TestTexture","width":2,"height":2,"format":"rgba8Unorm"},"dataBase64":"/////////////////////w=="}"#,
        )
        .unwrap();
        assert_eq!(
            unsafe { galfus_resource_create_texture(10, tex_payload.as_ptr()) },
            0
        );

        // 2. Update Texture sub-rectangle
        let tex_update =
            CString::new(r#"{"x":0,"y":0,"width":1,"height":1,"dataBase64":"gICA/w=="}"#).unwrap();
        assert_eq!(
            unsafe { galfus_resource_update_texture(10, tex_update.as_ptr()) },
            0
        );

        // 3. Dispose Texture
        assert_eq!(galfus_resource_dispose_texture(10), 0);
        assert_eq!(galfus_resource_dispose_texture(10), -1);

        // 4. Create Buffer (8 bytes = multiple of 4)
        let buf_payload = CString::new(
            r#"{"label":"TestBuffer","usages":{"vertex":true,"copyDst":true},"dataBase64":"AQIDBAUGBwg="}"#,
        )
        .unwrap();
        assert_eq!(
            unsafe { galfus_resource_create_buffer(20, buf_payload.as_ptr()) },
            0
        );

        // 5. Update Buffer (4 bytes at offset 4)
        let buf_update = CString::new(r#"{"offset":4,"dataBase64":"c1hNQg=="}"#).unwrap();
        assert_eq!(
            unsafe { galfus_resource_update_buffer(20, buf_update.as_ptr()) },
            0
        );

        // 6. Dispose Buffer
        assert_eq!(galfus_resource_dispose_buffer(20), 0);
        assert_eq!(galfus_resource_dispose_buffer(20), -1);

        assert_eq!(galfus_platform_shutdown(), 0);
    }
}
