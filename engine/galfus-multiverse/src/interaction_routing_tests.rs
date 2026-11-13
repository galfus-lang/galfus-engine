use super::*;
use crate::types::ViewportRect;
use galfus_realm_core::{HitResult2D, RealmInvocationContext, RealmPrepareContext, RealmResult};

struct FixedRealm(u32);
impl Realm for FixedRealm {
    fn id(&self) -> u32 {
        self.0
    }
    fn kind(&self) -> RealmKind {
        RealmKind::TwoD
    }
    fn prepare(&mut self, _: &RealmPrepareContext<'_>) -> RealmResult<()> {
        Ok(())
    }
    fn render(&mut self, _: &RealmInvocationContext<'_>) -> RealmResult<()> {
        Ok(())
    }
    fn as_any(&self) -> &dyn std::any::Any {
        self
    }
    fn as_any_mut(&mut self) -> &mut dyn std::any::Any {
        self
    }
    fn viewport_point_2d(&self, _: Option<u32>, position: Vec2, _: Vec2) -> Option<Vec2> {
        Some(position)
    }
    fn pick_2d(&self, _: Option<u32>, point: Vec2) -> Option<HitResult2D> {
        Some(HitResult2D {
            model_id: self.0 * 10,
            collider_id: self.0 * 100,
            point,
            normal: Vec2::Y,
            uv: Vec2::splat(0.5),
            z_layer: 0.0,
            element_id: None,
        })
    }
    fn has_interactive_collider(&self, model: u32, collider: u32) -> bool {
        model == self.0 * 10 && collider == self.0 * 100
    }
}

fn invocation(realm_id: u32, target_id: u32) -> InvocationDesc {
    InvocationDesc {
        realm_id,
        target_id,
        camera_slot: None,
        viewport: ViewportRect::full(),
        filters: vec![],
        z_index: 0,
        enabled: true,
        clear_color: None,
        anti_aliasing: None,
    }
}

#[test]
fn routing_obeys_cut_edges_and_stops_at_cycles() {
    let window_sizes = HashMap::from([(7, UVec2::splat(100))]);
    let targets = HashMap::from([
        (1, TargetDesc::window(7)),
        (2, TargetDesc::texture(100, 100)),
    ]);
    let invocations = HashMap::from([(1, invocation(2, 1)), (2, invocation(3, 2))]);
    let realms: HashMap<u32, Box<dyn Realm>> = HashMap::from([
        (2, Box::new(FixedRealm(2)) as Box<dyn Realm>),
        (3, Box::new(FixedRealm(3)) as Box<dyn Realm>),
    ]);
    let bindings = vec![
        TargetTextureBinding {
            source_target_id: 2,
            realm_id: 2,
            slot: "screen".into(),
        },
        TargetTextureBinding {
            source_target_id: 2,
            realm_id: 3,
            slot: "cycle".into(),
        },
    ];
    let surfaces = HashMap::from([
        (
            (2, 200),
            InteractionSurface {
                realm_id: 2,
                model_id: 20,
                collider_id: 200,
                slot: "screen".into(),
                flip_y: false,
            },
        ),
        (
            (3, 300),
            InteractionSurface {
                realm_id: 3,
                model_id: 30,
                collider_id: 300,
                slot: "cycle".into(),
                flip_y: false,
            },
        ),
    ]);
    let routing = InteractionRouting {
        window_sizes: &window_sizes,
        targets: &targets,
        invocations: &invocations,
        realms: &realms,
        bindings: &bindings,
        surfaces: &surfaces,
        cut_edges: &[],
    };
    assert_eq!(
        routing.pick_window(7, Vec2::splat(50.0)).unwrap().realm_id,
        3
    );
    assert!(routing.realm_is_presented(7, 3, 2));
    let blocked = InteractionRouting {
        cut_edges: &[(2, 1)],
        ..routing
    };
    assert_eq!(
        blocked.pick_window(7, Vec2::splat(50.0)).unwrap().realm_id,
        2
    );
    assert!(!blocked.realm_is_presented(7, 3, 2));
}

#[test]
fn routing_and_visibility_stop_at_the_third_level() {
    let window_sizes = HashMap::from([(7, UVec2::splat(100))]);
    let targets = HashMap::from([
        (1, TargetDesc::window(7)),
        (2, TargetDesc::texture(100, 100)),
        (3, TargetDesc::texture(100, 100)),
        (4, TargetDesc::texture(100, 100)),
    ]);
    let invocations = HashMap::from([
        (1, invocation(2, 1)),
        (2, invocation(3, 2)),
        (3, invocation(4, 3)),
        (4, invocation(5, 4)),
    ]);
    let realms: HashMap<u32, Box<dyn Realm>> = (2..=5)
        .map(|id| (id, Box::new(FixedRealm(id)) as Box<dyn Realm>))
        .collect();
    let bindings: Vec<_> = (2..=4)
        .map(|realm_id| TargetTextureBinding {
            source_target_id: realm_id,
            realm_id,
            slot: "screen".into(),
        })
        .collect();
    let surfaces = (2..=4)
        .map(|realm_id| {
            (
                (realm_id, realm_id * 100),
                InteractionSurface {
                    realm_id,
                    model_id: realm_id * 10,
                    collider_id: realm_id * 100,
                    slot: "screen".into(),
                    flip_y: false,
                },
            )
        })
        .collect();
    let routing = InteractionRouting {
        window_sizes: &window_sizes,
        targets: &targets,
        invocations: &invocations,
        realms: &realms,
        bindings: &bindings,
        surfaces: &surfaces,
        cut_edges: &[],
    };
    assert_eq!(
        routing.pick_window(7, Vec2::splat(50.0)).unwrap().realm_id,
        4
    );
    assert!(routing.realm_is_presented(7, 4, 3));
    assert!(!routing.realm_is_presented(7, 5, 4));
}
