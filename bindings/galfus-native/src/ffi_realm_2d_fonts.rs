#![allow(clippy::missing_safety_doc)]

//! C ABI for realm-local font groups and families.

use crate::ffi::{from_c_str, set_last_error};
use crate::state::with_multiverse_mut;
use galfus_realm_2d::{Realm2DContext, UiFontFamily};
use serde::Deserialize;
use std::collections::BTreeMap;
use std::ffi::{c_char, c_int};

fn unpack_faces(data: &[u8]) -> Result<Vec<&[u8]>, String> {
    fn read_u32(data: &[u8], offset: &mut usize) -> Result<u32, String> {
        let end = offset
            .checked_add(4)
            .ok_or("Font package length overflow")?;
        let bytes: [u8; 4] = data
            .get(*offset..end)
            .ok_or("Truncated font package")?
            .try_into()
            .unwrap();
        *offset = end;
        Ok(u32::from_le_bytes(bytes))
    }
    let mut offset = 0;
    let count = read_u32(data, &mut offset)? as usize;
    if count == 0 || count > (data.len().saturating_sub(4) / 4) {
        return Err("Invalid font package face count".into());
    }
    let mut lengths = Vec::with_capacity(count);
    for _ in 0..count {
        lengths.push(read_u32(data, &mut offset)? as usize);
    }
    let mut faces = Vec::with_capacity(count);
    for len in lengths {
        let end = offset
            .checked_add(len)
            .ok_or("Font package length overflow")?;
        faces.push(data.get(offset..end).ok_or("Truncated font package")?);
        offset = end;
    }
    if offset != data.len() {
        return Err("Unexpected trailing font package data".into());
    }
    Ok(faces)
}

/// Registers an atomic group; data contains a little-endian count, lengths and font bytes.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn galfus_realm_2d_register_font_group(
    realm_id: u32,
    name: *const c_char,
    data: *const u8,
    data_len: u64,
) -> c_int {
    let result = (|| {
        let name = unsafe { from_c_str(name) }?;
        let len = usize::try_from(data_len).map_err(|_| "Font package too large")?;
        if data.is_null() || len == 0 || len > isize::MAX as usize {
            return Err("Invalid font package".into());
        }
        let data = unsafe { std::slice::from_raw_parts(data, len) };
        let faces = unpack_faces(data)?;
        with_multiverse_mut(|mv| {
            let realm = mv
                .get_realm_mut::<Realm2DContext>(realm_id)
                .ok_or_else(|| format!("Realm2D #{realm_id} not found"))?;
            realm
                .register_font_group(name, &faces)
                .map_err(|e| e.to_string())
        })
    })();
    match result {
        Ok(()) => 0,
        Err(error) => {
            set_last_error(&error);
            -1
        }
    }
}

#[derive(Deserialize)]
struct FamilyDescriptor {
    name: String,
    groups: Vec<String>,
    #[serde(default)]
    axes: BTreeMap<String, f32>,
}

/// Creates or replaces a family from a UTF-8 JSON descriptor.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn galfus_realm_2d_set_font_family(
    realm_id: u32,
    json: *const c_char,
) -> c_int {
    let result = (|| {
        let json = unsafe { from_c_str(json) }?;
        let desc: FamilyDescriptor =
            serde_json::from_str(json).map_err(|e| format!("Invalid font family: {e}"))?;
        with_multiverse_mut(|mv| {
            let realm = mv
                .get_realm_mut::<Realm2DContext>(realm_id)
                .ok_or_else(|| format!("Realm2D #{realm_id} not found"))?;
            realm
                .set_font_family(
                    &desc.name,
                    UiFontFamily {
                        groups: desc.groups,
                        axes: desc.axes,
                    },
                )
                .map_err(|e| e.to_string())
        })
    })();
    match result {
        Ok(()) => 0,
        Err(error) => {
            set_last_error(&error);
            -1
        }
    }
}

unsafe fn remove_font(realm_id: u32, name: *const c_char, family: bool) -> c_int {
    let result = (|| {
        let name = unsafe { from_c_str(name) }?;
        with_multiverse_mut(|mv| {
            let realm = mv
                .get_realm_mut::<Realm2DContext>(realm_id)
                .ok_or_else(|| format!("Realm2D #{realm_id} not found"))?;
            if family {
                realm.remove_font_family(name)
            } else {
                realm.remove_font_group(name)
            }
            .map_err(|error| error.to_string())
        })
    })();
    match result {
        Ok(()) => 0,
        Err(error) => {
            set_last_error(&error);
            -1
        }
    }
}

/// Removes a family that is not referenced by any UI node.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn galfus_realm_2d_remove_font_family(
    realm_id: u32,
    name: *const c_char,
) -> c_int {
    unsafe { remove_font(realm_id, name, true) }
}

/// Removes a group that is not referenced by any font family.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn galfus_realm_2d_remove_font_group(
    realm_id: u32,
    name: *const c_char,
) -> c_int {
    unsafe { remove_font(realm_id, name, false) }
}

#[cfg(test)]
mod tests {
    use super::unpack_faces;
    #[test]
    fn rejects_invalid_packages_and_preserves_file_boundaries() {
        assert!(unpack_faces(&[]).is_err());
        assert!(unpack_faces(&[1, 0, 0, 0]).is_err());
        assert!(unpack_faces(&[1, 0, 0, 0, 3, 0, 0, 0, 1]).is_err());
        assert!(unpack_faces(&[0, 0, 0, 0]).is_err());
        assert_eq!(
            unpack_faces(&[2, 0, 0, 0, 2, 0, 0, 0, 1, 0, 0, 0, 7, 8, 9]).unwrap(),
            [&[7, 8][..], &[9][..]]
        );
        assert!(unpack_faces(&[1, 0, 0, 0, 1, 0, 0, 0, 7, 8]).is_err());
    }
}
