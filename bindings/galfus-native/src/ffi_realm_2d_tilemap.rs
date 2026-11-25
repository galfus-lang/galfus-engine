#![allow(clippy::missing_safety_doc)]

use std::ffi::c_char;

use galfus_realm_2d::Realm2DContext;
use galfus_realm_2d_resources::{TileCell2D, Tilemap2D};

use crate::ffi::{from_c_str, set_last_error};
use crate::ffi_realm_2d_desc::parse_transform_2d;
use crate::state::with_multiverse_mut;

/// Creates or replaces a chunked `Tilemap2D` in the 2D Realm.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn galfus_realm_2d_create_tilemap(
    realm_id: u32,
    tilemap_id: u32,
    desc_json: *const c_char,
    transform_json: *const c_char,
) -> i32 {
    let desc_str = match unsafe { from_c_str(desc_json) } {
        Ok(s) => s,
        Err(e) => {
            set_last_error(&e);
            return -1;
        }
    };
    let desc: Tilemap2D = match serde_json::from_str(desc_str) {
        Ok(d) => d,
        Err(e) => {
            set_last_error(&format!("Invalid Tilemap2DDesc: {e}"));
            return -1;
        }
    };
    let transform = match unsafe { parse_transform_2d(transform_json) } {
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
            .create_tilemap(tilemap_id, desc, transform)
            .map_err(|e| e.to_string())
    }) {
        Ok(()) => 0,
        Err(e) => {
            set_last_error(&e);
            -1
        }
    }
}

/// Sets a single cell `(x, y)` of an existing `Tilemap2D` in O(1).
#[unsafe(no_mangle)]
pub extern "C" fn galfus_realm_2d_set_tilemap_tile(
    realm_id: u32,
    tilemap_id: u32,
    x: u32,
    y: u32,
    tile_id: u32,
    flags: u32,
) -> i32 {
    match with_multiverse_mut(|mv| {
        let realm = mv
            .get_realm_mut::<Realm2DContext>(realm_id)
            .ok_or_else(|| format!("Realm2D #{realm_id} not found"))?;
        realm
            .set_tilemap_tile(tilemap_id, x, y, tile_id as u16, flags as u8)
            .map_err(|e| e.to_string())
    }) {
        Ok(()) => 0,
        Err(e) => {
            set_last_error(&e);
            -1
        }
    }
}

/// Bulk-updates a rectangular region of cells in an existing `Tilemap2D` from packed 4-byte `TileCell2D` bytes.
#[allow(clippy::too_many_arguments)]
#[unsafe(no_mangle)]
pub unsafe extern "C" fn galfus_realm_2d_set_tilemap_tiles(
    realm_id: u32,
    tilemap_id: u32,
    x: u32,
    y: u32,
    width: u32,
    height: u32,
    data: *const u8,
    data_len: u64,
) -> i32 {
    if data.is_null() && data_len > 0 {
        set_last_error("Null pointer passed to set_tilemap_tiles");
        return -1;
    }
    let byte_len = data_len as usize;
    if !byte_len.is_multiple_of(std::mem::size_of::<TileCell2D>()) {
        set_last_error("Tilemap cell byte buffer length must be a multiple of 4 bytes");
        return -1;
    }
    let bytes = if byte_len == 0 {
        &[]
    } else {
        // SAFETY: Caller guarantees `data` is valid for `byte_len` bytes.
        unsafe { std::slice::from_raw_parts(data, byte_len) }
    };
    let mut cells = Vec::with_capacity(byte_len / 4);
    for chunk in bytes.as_chunks::<4>().0 {
        let tile_id = u16::from_le_bytes([chunk[0], chunk[1]]);
        cells.push(TileCell2D {
            tile_id,
            flags: chunk[2],
            variant: chunk[3],
        });
    }
    match with_multiverse_mut(|mv| {
        let realm = mv
            .get_realm_mut::<Realm2DContext>(realm_id)
            .ok_or_else(|| format!("Realm2D #{realm_id} not found"))?;
        realm
            .set_tilemap_tiles(tilemap_id, x, y, width, height, &cells)
            .map_err(|e| e.to_string())
    }) {
        Ok(()) => 0,
        Err(e) => {
            set_last_error(&e);
            -1
        }
    }
}

/// Destroys an existing `Tilemap2D` and releases its chunks and generated colliders.
#[unsafe(no_mangle)]
pub extern "C" fn galfus_realm_2d_destroy_tilemap(realm_id: u32, tilemap_id: u32) -> i32 {
    match with_multiverse_mut(|mv| {
        let realm = mv
            .get_realm_mut::<Realm2DContext>(realm_id)
            .ok_or_else(|| format!("Realm2D #{realm_id} not found"))?;
        realm.destroy_tilemap(tilemap_id).map_err(|e| e.to_string())
    }) {
        Ok(()) => 0,
        Err(e) => {
            set_last_error(&e);
            -1
        }
    }
}
