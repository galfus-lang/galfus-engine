//! Unit tests for Realm 3D pipeline state and culling selection.

use super::*;

#[test]
fn surface_types_select_the_expected_raster_state() {
    assert_eq!(
        SurfacePipelineState::from_surface_type(SurfaceType3D::Opaque),
        SurfacePipelineState::Opaque
    );
    assert_eq!(
        SurfacePipelineState::from_surface_type(SurfaceType3D::Masked),
        SurfacePipelineState::Masked
    );
    assert_eq!(
        SurfacePipelineState::from_surface_type(SurfaceType3D::Transparent),
        SurfacePipelineState::AlphaBlend
    );
    assert_eq!(
        SurfacePipelineState::from_surface_type(SurfaceType3D::Additive),
        SurfacePipelineState::Additive
    );
    assert!(SurfacePipelineState::Opaque.depth_write_enabled());
    assert!(!SurfacePipelineState::AlphaBlend.depth_write_enabled());
    assert!(!SurfacePipelineState::Additive.depth_write_enabled());
}

#[test]
fn material_sides_select_the_expected_culling() {
    assert_eq!(
        cull_mode(PrimitiveTopology3D::Triangles, MaterialSide3D::Front),
        Some(wgpu::Face::Back)
    );
    assert_eq!(
        cull_mode(PrimitiveTopology3D::Triangles, MaterialSide3D::Back),
        Some(wgpu::Face::Front)
    );
    assert_eq!(
        cull_mode(PrimitiveTopology3D::Triangles, MaterialSide3D::Double),
        None
    );
    assert_eq!(
        cull_mode(PrimitiveTopology3D::Lines, MaterialSide3D::Back),
        None
    );
}
