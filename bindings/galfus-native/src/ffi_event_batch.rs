//! Fixed-layout platform event batches with a shared UTF-8 text arena.

use std::cell::RefCell;
use std::collections::HashMap;

use galfus_platform::{
    GamepadEvent, KeyboardEvent, PlatformEvent, PointerEvent, ScrollDelta, WindowEvent,
};

/// One normalized platform event. Text fields are byte ranges inside `GalfusEventBatch::text_data`.
#[repr(C)]
#[derive(Clone, Copy, Debug, Default)]
pub struct GalfusPlatformEvent {
    pub kind: u16,
    pub event_type: u16,
    pub flags: u32,
    pub window_id: u32,
    pub subject_id: u32,
    pub id: u64,
    pub values: [f32; 5],
    pub text0_offset: u32,
    pub text0_length: u32,
    pub text1_offset: u32,
    pub text1_length: u32,
    pub text2_offset: u32,
    pub text2_length: u32,
}

/// Caller-visible view of an event batch.
///
/// It remains valid until `galfus_platform_release_event_batch` or platform shutdown, whichever
/// happens first.
#[repr(C)]
#[derive(Clone, Copy, Debug)]
pub struct GalfusEventBatch {
    pub batch_id: u64,
    pub events: *const GalfusPlatformEvent,
    pub event_count: u32,
    pub text_data: *const u8,
    pub text_length: u32,
}

struct EventBatchStorage {
    events: Vec<GalfusPlatformEvent>,
    text: Vec<u8>,
}

thread_local! {
    static EVENT_BATCHES: RefCell<HashMap<u64, Box<EventBatchStorage>>> = RefCell::new(HashMap::new());
    static NEXT_BATCH_ID: RefCell<u64> = const { RefCell::new(1) };
}

const FLAG_TRUE: u32 = 1;
const FLAG_SHIFT: u32 = 1 << 1;
const FLAG_CTRL: u32 = 1 << 2;
const FLAG_ALT: u32 = 1 << 3;
const FLAG_SUPER: u32 = 1 << 4;
const FLAG_REPEAT: u32 = 1 << 5;
const FLAG_SCROLL_PIXELS: u32 = 1 << 6;
const FLAG_TEXT_PRESENT: u32 = 1 << 8;

fn push_text(text: &mut Vec<u8>, value: &str) -> (u32, u32) {
    let offset = u32::try_from(text.len()).expect("event text arena exceeds u32 length");
    text.extend_from_slice(value.as_bytes());
    let length = u32::try_from(value.len()).expect("event text value exceeds u32 length");
    (offset, length)
}

fn push_debug<T: std::fmt::Debug>(text: &mut Vec<u8>, value: T) -> (u32, u32) {
    use std::io::Write;
    let offset = u32::try_from(text.len()).expect("event text arena exceeds u32 length");
    let _ = write!(text, "{value:?}");
    let length =
        u32::try_from(text.len() - offset as usize).expect("event text value exceeds u32 length");
    (offset, length)
}

fn modifier_flags(modifiers: galfus_platform::ModifiersState) -> u32 {
    (u32::from(modifiers.shift) * FLAG_SHIFT)
        | (u32::from(modifiers.ctrl) * FLAG_CTRL)
        | (u32::from(modifiers.alt) * FLAG_ALT)
        | (u32::from(modifiers.super_key) * FLAG_SUPER)
}

fn encode_event(event: PlatformEvent, text: &mut Vec<u8>) -> GalfusPlatformEvent {
    let mut output = GalfusPlatformEvent::default();
    match event {
        PlatformEvent::Window(event) => {
            output.kind = 1;
            match event {
                WindowEvent::Resized {
                    window_id,
                    width,
                    height,
                    scale_factor,
                } => {
                    output.event_type = 1;
                    output.window_id = window_id;
                    output.values = [width as f32, height as f32, scale_factor as f32, 0.0, 0.0];
                }
                WindowEvent::Moved { window_id, x, y } => {
                    output.event_type = 2;
                    output.window_id = window_id;
                    output.values = [x as f32, y as f32, 0.0, 0.0, 0.0];
                }
                WindowEvent::CloseRequested { window_id } => {
                    output.event_type = 3;
                    output.window_id = window_id;
                }
                WindowEvent::FocusChanged { window_id, focused } => {
                    output.event_type = 4;
                    output.window_id = window_id;
                    output.flags = u32::from(focused) * FLAG_TRUE;
                }
                WindowEvent::Occluded {
                    window_id,
                    occluded,
                } => {
                    output.event_type = 5;
                    output.window_id = window_id;
                    output.flags = u32::from(occluded) * FLAG_TRUE;
                }
                WindowEvent::ScaleFactorChanged {
                    window_id,
                    scale_factor,
                } => {
                    output.event_type = 6;
                    output.window_id = window_id;
                    output.values[0] = scale_factor as f32;
                }
                WindowEvent::RedrawRequested { window_id } => {
                    output.event_type = 7;
                    output.window_id = window_id;
                }
            }
        }
        PlatformEvent::Pointer(event) => {
            output.kind = 2;
            let (window_id, pointer_id, pointer_type, position) = (
                event.window_id(),
                event.pointer_id(),
                event.pointer_type(),
                event.position(),
            );
            output.window_id = window_id;
            output.id = pointer_id;
            output.subject_id = match pointer_type {
                galfus_platform::PointerType::Mouse => 1,
                galfus_platform::PointerType::Touch => 2,
                galfus_platform::PointerType::Pen => 3,
            };
            output.values[0] = position.x;
            output.values[1] = position.y;
            match event {
                PointerEvent::Move {
                    delta, pressure, ..
                } => {
                    output.event_type = 1;
                    output.values[2] = delta.x;
                    output.values[3] = delta.y;
                    output.id = pointer_id;
                    output.values[4] = pressure;
                }
                PointerEvent::Button {
                    button,
                    state,
                    pressure,
                    ..
                } => {
                    output.event_type = 2;
                    output.values[2] = pressure;
                    output.flags = u32::from(state.is_pressed()) * FLAG_TRUE;
                    (output.text0_offset, output.text0_length) = push_debug(text, button);
                }
                PointerEvent::Enter { .. } => output.event_type = 3,
                PointerEvent::Leave { .. } => output.event_type = 4,
                PointerEvent::Cancel { .. } => output.event_type = 5,
                PointerEvent::Scroll { delta, .. } => {
                    output.event_type = 6;
                    let (value, pixels) = match delta {
                        ScrollDelta::Lines(value) => (value, false),
                        ScrollDelta::Pixels(value) => (value, true),
                    };
                    output.values[2] = value.x;
                    output.values[3] = value.y;
                    output.flags = u32::from(pixels) * FLAG_SCROLL_PIXELS;
                }
            }
        }
        PlatformEvent::Keyboard(event) => {
            output.kind = 3;
            output.window_id = event.window_id();
            output.flags = modifier_flags(event.modifiers());
            match event {
                KeyboardEvent::Input {
                    physical_key,
                    logical_key,
                    text: input_text,
                    state,
                    repeat,
                    ..
                } => {
                    output.event_type = 1;
                    output.flags |= u32::from(state.is_pressed()) * FLAG_TRUE;
                    output.flags |= u32::from(repeat) * FLAG_REPEAT;
                    (output.text0_offset, output.text0_length) = push_debug(text, physical_key);
                    (output.text1_offset, output.text1_length) =
                        push_text(text, logical_key.as_str());
                    if let Some(value) = input_text {
                        output.flags |= FLAG_TEXT_PRESENT;
                        (output.text2_offset, output.text2_length) = push_text(text, &value);
                    }
                }
                KeyboardEvent::ModifiersChanged { .. } => output.event_type = 2,
            }
        }
        PlatformEvent::Gamepad(event) => {
            output.kind = 4;
            output.subject_id = event.gamepad_id();
            match event {
                GamepadEvent::Connected { name, .. } => {
                    output.event_type = 1;
                    (output.text0_offset, output.text0_length) = push_text(text, &name);
                }
                GamepadEvent::Disconnected { .. } => output.event_type = 2,
                GamepadEvent::Button { button, state, .. } => {
                    output.event_type = 3;
                    output.flags = u32::from(state.is_pressed()) * FLAG_TRUE;
                    (output.text0_offset, output.text0_length) = push_debug(text, button);
                }
                GamepadEvent::Axis { axis, value, .. } => {
                    output.event_type = 4;
                    output.values[0] = value;
                    (output.text0_offset, output.text0_length) = push_debug(text, axis);
                }
            }
        }
    }
    output
}

/// Stores a converted event batch and returns its stable ABI view.
pub fn store_event_batch(events: Vec<PlatformEvent>) -> GalfusEventBatch {
    let mut text = Vec::new();
    let events = events
        .into_iter()
        .map(|event| encode_event(event, &mut text))
        .collect::<Vec<_>>();
    let batch_id = NEXT_BATCH_ID.with(|next| {
        let mut next = next.borrow_mut();
        let id = *next;
        *next = next.wrapping_add(1).max(1);
        id
    });
    EVENT_BATCHES.with(|batches| {
        let mut batches = batches.borrow_mut();
        batches.insert(batch_id, Box::new(EventBatchStorage { events, text }));
        let storage = batches
            .get(&batch_id)
            .expect("inserted event batch is missing");
        GalfusEventBatch {
            batch_id,
            events: storage.events.as_ptr(),
            event_count: u32::try_from(storage.events.len())
                .expect("event count exceeds u32 length"),
            text_data: storage.text.as_ptr(),
            text_length: u32::try_from(storage.text.len())
                .expect("event text arena exceeds u32 length"),
        }
    })
}

/// Releases one event batch. The pointer ranges returned for it become invalid immediately.
pub fn release_event_batch(batch_id: u64) -> Result<(), String> {
    EVENT_BATCHES.with(|batches| {
        batches
            .borrow_mut()
            .remove(&batch_id)
            .map(|_| ())
            .ok_or_else(|| format!("Event batch #{batch_id} not found or already released"))
    })
}

/// Releases all event batches owned by the current native binding thread.
///
/// This invalidates every event and text pointer previously exposed through the C ABI.
pub(crate) fn clear_event_batches() {
    EVENT_BATCHES.with(|batches| batches.borrow_mut().clear());
    NEXT_BATCH_ID.with(|next| *next.borrow_mut() = 1);
}

#[cfg(test)]
pub(crate) fn event_batch_count() -> usize {
    EVENT_BATCHES.with(|batches| batches.borrow().len())
}

#[cfg(test)]
mod tests {
    use super::*;
    use galfus_platform::{KeyCode, KeyState, LogicalKey, ModifiersState};

    #[test]
    fn ffi_layout_is_stable_on_64_bit_targets() {
        assert_eq!(std::mem::size_of::<GalfusPlatformEvent>(), 72);
        #[cfg(target_pointer_width = "64")]
        assert_eq!(std::mem::size_of::<GalfusEventBatch>(), 40);
    }

    #[test]
    fn event_batches_preserve_utf8_text() {
        let batch = store_event_batch(vec![PlatformEvent::Keyboard(KeyboardEvent::Input {
            window_id: 1,
            physical_key: KeyCode::KeyW,
            logical_key: LogicalKey::Character("w".into()),
            text: Some("w".into()),
            state: KeyState::Pressed,
            modifiers: ModifiersState::EMPTY,
            repeat: false,
        })]);
        assert_eq!(batch.event_count, 1);
        assert!(batch.text_length > 0);
        // SAFETY: The batch has not been released and stores exactly one event.
        let event = unsafe { *batch.events };
        assert_eq!(event.kind, 3);
        assert_eq!(event.event_type, 1);
        // SAFETY: The text range was generated from the batch's owned UTF-8 arena.
        let physical_key = unsafe {
            std::str::from_utf8(std::slice::from_raw_parts(
                batch.text_data.add(event.text0_offset as usize),
                event.text0_length as usize,
            ))
        }
        .unwrap();
        assert_eq!(physical_key, "KeyW");

        let logical_key = unsafe {
            std::str::from_utf8(std::slice::from_raw_parts(
                batch.text_data.add(event.text1_offset as usize),
                event.text1_length as usize,
            ))
        }
        .unwrap();
        assert_eq!(logical_key, "w");
        release_event_batch(batch.batch_id).unwrap();
    }

    #[test]
    fn clearing_event_batches_reclaims_every_pending_batch() {
        let first = store_event_batch(Vec::new());
        let second = store_event_batch(Vec::new());
        assert_eq!(event_batch_count(), 2);

        clear_event_batches();

        assert_eq!(event_batch_count(), 0);
        assert!(release_event_batch(first.batch_id).is_err());
        assert!(release_event_batch(second.batch_id).is_err());
    }
}
