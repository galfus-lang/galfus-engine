use galfus_realm_2d_resources::{
    Camera2D, MAX_TILEMAP_TILES, TILE_FLAG_BLOCKS_LIGHT, TILE_FLAG_SOLID, TileCell2D, Tilemap2D,
    Transform2D,
};
use galfus_realm_core::Realm;
use glam::Vec2;

use crate::batch::BatchBuilder2D;
use crate::context::Realm2DContext;
use crate::culling::CameraViewportBounds2D;
use crate::tilemap::TilemapState2D;

#[test]
fn tilemap_dirty_chunk_invalidation_only_rebuilds_touched_chunk() {
    let desc = Tilemap2D {
        width: 64,
        height: 64,
        tile_size: Vec2::ONE,
        chunk_size: 32,
        atlas_columns: 4,
        atlas_rows: 4,
        ..Default::default()
    };
    let mut tm = TilemapState2D::new(desc, Transform2D::default()).unwrap();
    assert_eq!(tm.chunks.len(), 4);

    let initial = tm.rebuild_dirty_chunks();
    assert_eq!(initial.len(), 4);
    assert!(tm.rebuild_dirty_chunks().is_empty());

    // Edit single tile in chunk (1, 0) -> only 1 chunk should rebuild
    assert!(tm.set_tile(35, 4, TileCell2D::new(2, 0)));
    let rebuilt = tm.rebuild_dirty_chunks();
    assert_eq!(rebuilt, vec![1]);
    assert_eq!(tm.chunks[1].instances.len(), 1);
    assert!(tm.chunks[0].instances.is_empty());
}

#[test]
fn tilemap_chunk_culling_emits_only_visible_chunks() {
    let mut ctx = Realm2DContext::new(1);
    let desc = Tilemap2D {
        width: 64,
        height: 64,
        tile_size: Vec2::ONE,
        chunk_size: 32,
        atlas_columns: 4,
        atlas_rows: 4,
        ..Default::default()
    };
    ctx.create_tilemap(10, desc, Transform2D::default())
        .unwrap();
    // Place one tile in chunk (0,0) at (2,2) and one in chunk (1,1) at (50,50)
    ctx.set_tilemap_tile(10, 2, 2, 1, 0).unwrap();
    ctx.set_tilemap_tile(10, 50, 50, 2, 0).unwrap();
    ctx.prepare_tilemaps();

    // Camera looking only around (5, 5) with ortho_scale 12 -> sees chunk (0,0), culls chunk (1,1)
    let cam = Camera2D {
        ortho_scale: 12.0,
        ..Default::default()
    };
    let cam_tf = Transform2D::from_translation(Vec2::new(5.0, 5.0));
    let bounds = CameraViewportBounds2D::from_camera(&cam, &cam_tf, Vec2::new(800.0, 600.0));
    let mut bb = BatchBuilder2D::new();
    ctx.push_tilemap_batches(Some(&bounds), &mut bb);
    bb.build();
    assert_eq!(bb.instances().len(), 1);
}

#[test]
fn tilemap_greedy_colliders_shadows_and_cleanup() {
    let mut ctx = Realm2DContext::new(1);
    ctx.enable_physics_2d([0.0, 0.0]).unwrap();
    let desc = Tilemap2D {
        width: 16,
        height: 16,
        tile_size: Vec2::ONE,
        chunk_size: 16,
        atlas_columns: 2,
        atlas_rows: 2,
        cast_shadow: true,
        generate_colliders: true,
        ..Default::default()
    };
    ctx.create_tilemap(20, desc, Transform2D::default())
        .unwrap();

    // Fill a 4x4 solid light-blocking wall block -> greedy merges into 1 collider + 1 shadow rect
    let block = vec![TileCell2D::new(1, TILE_FLAG_SOLID | TILE_FLAG_BLOCKS_LIGHT); 16];
    ctx.set_tilemap_tiles(20, 4, 4, 4, 4, &block).unwrap();
    ctx.prepare_tilemaps();

    let tm = ctx.tilemaps.get(&20).unwrap();
    assert_eq!(tm.chunks[0].collider_rects.len(), 1);
    assert_eq!(tm.chunks[0].shadow_rects.len(), 1);
    assert_eq!(tm.chunks[0].physics_collider_ids.len(), 1);

    let mut occluders = Vec::new();
    ctx.append_tilemap_shadow_occluders(&mut occluders);
    assert_eq!(occluders.len(), 1);
    assert!(ctx.physics.as_ref().unwrap().has_rigid_body(20));

    // Destroy cleans up both tilemap and Rapier rigid body
    ctx.destroy_tilemap(20).unwrap();
    assert!(ctx.tilemaps.is_empty());
    assert!(!ctx.physics.as_ref().unwrap().has_rigid_body(20));
}

#[test]
fn tilemap_rejects_oversized_map_and_reserved_id_and_clears() {
    let mut ctx = Realm2DContext::new(1);
    let oversized = Tilemap2D {
        width: (MAX_TILEMAP_TILES as u32) + 1,
        height: 2,
        ..Default::default()
    };
    assert!(
        ctx.create_tilemap(1, oversized, Transform2D::default())
            .is_err()
    );
    assert!(
        ctx.create_tilemap(u32::MAX, Tilemap2D::default(), Transform2D::default())
            .is_err()
    );

    let valid = Tilemap2D {
        width: 8,
        height: 8,
        ..Default::default()
    };
    ctx.create_tilemap(5, valid, Transform2D::default())
        .unwrap();
    ctx.clear().unwrap();
    assert!(ctx.tilemaps.is_empty());
}
