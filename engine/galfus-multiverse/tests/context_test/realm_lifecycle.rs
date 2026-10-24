use std::sync::{Arc, Mutex};

use super::*;

#[derive(Default)]
struct SpyState {
    destroy_calls: u32,
}

struct SpyRealm {
    id: u32,
    fail_destroy: bool,
    state: Arc<Mutex<SpyState>>,
}

impl SpyRealm {
    fn new(id: u32, fail_destroy: bool, state: Arc<Mutex<SpyState>>) -> Self {
        Self {
            id,
            fail_destroy,
            state,
        }
    }
}

impl Realm for SpyRealm {
    fn id(&self) -> u32 {
        self.id
    }

    fn kind(&self) -> RealmKind {
        RealmKind::Custom
    }

    fn prepare(&mut self, _context: &RealmPrepareContext<'_>) -> RealmResult<()> {
        Ok(())
    }

    fn render(&mut self, _context: &RealmInvocationContext<'_>) -> RealmResult<()> {
        Ok(())
    }

    fn destroy(&mut self) -> RealmResult<()> {
        self.state.lock().unwrap().destroy_calls += 1;
        if self.fail_destroy {
            return Err(RealmError::Internal("intentional destroy failure".into()));
        }
        Ok(())
    }

    fn as_any(&self) -> &dyn std::any::Any {
        self
    }

    fn as_any_mut(&mut self) -> &mut dyn std::any::Any {
        self
    }
}

fn create_window_target(mv: &mut MultiverseContext) {
    mv.create_target(
        1,
        TargetDesc {
            kind: TargetKind::Window { window_id: 1 },
            size: Some(UVec2::new(64, 64)),
        },
    )
    .unwrap();
}

fn create_invocation(mv: &mut MultiverseContext, realm_id: u32) {
    mv.create_invocation(
        100,
        InvocationDesc {
            realm_id,
            target_id: 1,
            ..Default::default()
        },
    )
    .unwrap();
}

#[test]
fn unregister_destroys_realm_before_removing_its_graph() {
    let mut mv = MultiverseContext::new();
    let state = Arc::new(Mutex::new(SpyState::default()));
    create_window_target(&mut mv);
    mv.register_realm(Box::new(SpyRealm::new(10, false, Arc::clone(&state))))
        .unwrap();
    create_invocation(&mut mv, 10);

    mv.unregister_realm(10).unwrap();

    assert_eq!(state.lock().unwrap().destroy_calls, 1);
    assert!(mv.get_realm::<SpyRealm>(10).is_none());
    assert!(mv.get_invocation(100).is_none());
}

#[test]
fn unregister_preserves_the_graph_when_realm_destroy_fails() {
    let mut mv = MultiverseContext::new();
    let state = Arc::new(Mutex::new(SpyState::default()));
    create_window_target(&mut mv);
    mv.register_realm(Box::new(SpyRealm::new(10, true, Arc::clone(&state))))
        .unwrap();
    create_invocation(&mut mv, 10);

    let error = mv.unregister_realm(10).unwrap_err();

    assert!(matches!(error, MultiverseError::RealmError(10, _)));
    assert_eq!(state.lock().unwrap().destroy_calls, 1);
    assert!(mv.get_realm::<SpyRealm>(10).is_some());
    assert!(mv.get_invocation(100).is_some());
}

#[test]
fn shutdown_destroys_every_registered_realm() {
    let mut mv = MultiverseContext::new();
    let first = Arc::new(Mutex::new(SpyState::default()));
    let second = Arc::new(Mutex::new(SpyState::default()));
    create_window_target(&mut mv);
    mv.register_realm(Box::new(SpyRealm::new(10, false, Arc::clone(&first))))
        .unwrap();
    mv.register_realm(Box::new(SpyRealm::new(20, false, Arc::clone(&second))))
        .unwrap();
    create_invocation(&mut mv, 10);

    mv.shutdown().unwrap();
    mv.shutdown().unwrap();

    assert_eq!(first.lock().unwrap().destroy_calls, 1);
    assert_eq!(second.lock().unwrap().destroy_calls, 1);
    assert!(mv.get_realm::<SpyRealm>(10).is_none());
    assert!(mv.get_realm::<SpyRealm>(20).is_none());
    assert!(mv.get_invocation(100).is_none());
    assert!(mv.target_size(1).is_none());
}

#[test]
fn shutdown_preserves_the_graph_when_a_realm_destroy_fails() {
    let mut mv = MultiverseContext::new();
    let first = Arc::new(Mutex::new(SpyState::default()));
    let failing = Arc::new(Mutex::new(SpyState::default()));
    create_window_target(&mut mv);
    mv.register_realm(Box::new(SpyRealm::new(10, false, Arc::clone(&first))))
        .unwrap();
    mv.register_realm(Box::new(SpyRealm::new(20, true, Arc::clone(&failing))))
        .unwrap();
    create_invocation(&mut mv, 10);

    let error = mv.shutdown().unwrap_err();

    assert!(matches!(error, MultiverseError::RealmError(20, _)));
    assert_eq!(first.lock().unwrap().destroy_calls, 1);
    assert_eq!(failing.lock().unwrap().destroy_calls, 1);
    assert!(mv.get_realm::<SpyRealm>(10).is_some());
    assert!(mv.get_realm::<SpyRealm>(20).is_some());
    assert!(mv.get_invocation(100).is_some());
    assert!(mv.target_size(1).is_some());
}

#[test]
fn window_targets_cannot_be_bound_as_sampled_textures() {
    let mut mv = MultiverseContext::new();
    create_window_target(&mut mv);
    let state = Arc::new(Mutex::new(SpyState::default()));
    mv.register_realm(Box::new(SpyRealm::new(10, false, state)))
        .unwrap();

    let error = mv
        .bind_target_texture(TargetTextureBinding {
            source_target_id: 1,
            realm_id: 10,
            slot: "invalid_window_source".into(),
        })
        .unwrap_err();

    assert!(matches!(error, MultiverseError::InvalidConfig(_)));
}
