//! Fixed-layout 128-byte platform event records with an inline UTF-8 text arena.

use std::cell::RefCell;
use std::collections::VecDeque;

use galfus_platform::{
    GamepadEvent, KeyboardEvent, PlatformEvent, PointerEvent, ScrollDelta, WindowEvent,
};

/// Inline UTF-8 byte capacity inside each `GalfusPlatformEvent`.
pub const EVENT_TEXT_CAPACITY: usize = 80;

/// One normalized 128-byte platform event record.
///
/// - `kind == 0` indicates that the event queue is empty.
/// - `has_more == 1` indicates that additional events remain queued for the current pump cycle.
/// - `text0`, `text1`, and `text2` are stored contiguously in `text_bytes`:
///   - `text0`: `text_bytes[0 .. text0_length]`
///   - `text1`: `text_bytes[text0_length .. text0_length + text1_length]`
///   - `text2`: `text_bytes[text0_length + text1_length .. text0_length + text1_length + text2_length]`
#[repr(C)]
#[derive(Clone, Copy, Debug)]
pub struct GalfusPlatformEvent {
    pub kind: u16,
    pub event_type: u16,
    pub flags: u32,
    pub window_id: u32,
    pub subject_id: u32,
    pub id: u64,
    pub values: [f32; 5],
    pub text0_length: u8,
    pub text1_length: u8,
    pub text2_length: u8,
    pub has_more: u8,
    pub text_bytes: [u8; EVENT_TEXT_CAPACITY],
}

impl Default for GalfusPlatformEvent {
    fn default() -> Self {
        Self {
            kind: 0,
            event_type: 0,
            flags: 0,
            window_id: 0,
            subject_id: 0,
            id: 0,
            values: [0.0; 5],
            text0_length: 0,
            text1_length: 0,
            text2_length: 0,
            has_more: 0,
            text_bytes: [0; EVENT_TEXT_CAPACITY],
        }
    }
}

thread_local! {
    static PENDING_EVENTS: RefCell<VecDeque<QueuedEvent>> = const { RefCell::new(VecDeque::new()) };
    static CURRENT_TEXT: RefCell<Option<[String; 3]>> = const { RefCell::new(None) };
}

struct QueuedEvent {
    record: GalfusPlatformEvent,
    full_text: Option<[String; 3]>,
}

const FLAG_TRUE: u32 = 1;
const FLAG_SHIFT: u32 = 1 << 1;
const FLAG_CTRL: u32 = 1 << 2;
const FLAG_ALT: u32 = 1 << 3;
const FLAG_SUPER: u32 = 1 << 4;
const FLAG_REPEAT: u32 = 1 << 5;
const FLAG_SCROLL_PIXELS: u32 = 1 << 6;
const FLAG_TEXT_PRESENT: u32 = 1 << 8;
/// One or more inline text fields were shortened; retrieve all text fields before pumping again.
pub const FLAG_TEXT_OVERFLOW: u32 = 1 << 9;

fn full_text_fields(event: &PlatformEvent) -> [String; 3] {
    let mut fields = [String::new(), String::new(), String::new()];
    match event {
        PlatformEvent::Keyboard(KeyboardEvent::Input {
            physical_key,
            logical_key,
            text,
            ..
        }) => {
            fields[0] = format!("{physical_key:?}");
            fields[1] = logical_key.as_str().to_owned();
            fields[2] = text.clone().unwrap_or_default();
        }
        PlatformEvent::Keyboard(
            KeyboardEvent::ImePreedit { text, .. }
            | KeyboardEvent::ImeCommit { text, .. }
            | KeyboardEvent::TextInput { text, .. },
        ) => fields[0] = text.clone(),
        PlatformEvent::Pointer(PointerEvent::Button { button, .. }) => {
            fields[0] = format!("{button:?}")
        }
        PlatformEvent::Gamepad(GamepadEvent::Connected { name, .. }) => fields[0] = name.clone(),
        PlatformEvent::Gamepad(GamepadEvent::Button { button, .. }) => {
            fields[0] = format!("{button:?}")
        }
        PlatformEvent::Gamepad(GamepadEvent::Axis { axis, .. }) => fields[0] = format!("{axis:?}"),
        _ => {}
    }
    fields
}

fn push_inline_text(buf: &mut [u8; EVENT_TEXT_CAPACITY], cursor: &mut usize, value: &str) -> u8 {
    let remaining = EVENT_TEXT_CAPACITY.saturating_sub(*cursor);
    if remaining == 0 || value.is_empty() {
        return 0;
    }
    let max_len = value.len().min(remaining);
    let valid_len = value.floor_char_boundary(max_len);
    buf[*cursor..*cursor + valid_len].copy_from_slice(&value.as_bytes()[..valid_len]);
    *cursor += valid_len;
    valid_len as u8
}

fn push_inline_debug<T: std::fmt::Debug>(
    buf: &mut [u8; EVENT_TEXT_CAPACITY],
    cursor: &mut usize,
    value: T,
) -> u8 {
    let formatted = format!("{value:?}");
    push_inline_text(buf, cursor, &formatted)
}

fn modifier_flags(modifiers: galfus_platform::ModifiersState) -> u32 {
    (u32::from(modifiers.shift) * FLAG_SHIFT)
        | (u32::from(modifiers.ctrl) * FLAG_CTRL)
        | (u32::from(modifiers.alt) * FLAG_ALT)
        | (u32::from(modifiers.super_key) * FLAG_SUPER)
}

pub(crate) fn encode_event(event: PlatformEvent) -> GalfusPlatformEvent {
    let mut output = GalfusPlatformEvent::default();
    let mut cursor = 0usize;
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
                    output.text0_length =
                        push_inline_debug(&mut output.text_bytes, &mut cursor, button);
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
                    output.text0_length =
                        push_inline_debug(&mut output.text_bytes, &mut cursor, physical_key);
                    output.text1_length =
                        push_inline_text(&mut output.text_bytes, &mut cursor, logical_key.as_str());
                    if let Some(value) = input_text {
                        output.flags |= FLAG_TEXT_PRESENT;
                        output.text2_length =
                            push_inline_text(&mut output.text_bytes, &mut cursor, &value);
                    }
                }
                KeyboardEvent::ModifiersChanged { .. } => output.event_type = 2,
                KeyboardEvent::ImeEnabled { .. } => output.event_type = 3,
                KeyboardEvent::ImePreedit {
                    text: value,
                    selection,
                    ..
                } => {
                    output.event_type = 4;
                    output.text0_length =
                        push_inline_text(&mut output.text_bytes, &mut cursor, &value);
                    if let Some([start, end]) = selection {
                        output.flags |= FLAG_TRUE;
                        output.subject_id = start;
                        output.id = u64::from(end);
                    }
                }
                KeyboardEvent::ImeCommit { text: value, .. } => {
                    output.event_type = 5;
                    output.text0_length =
                        push_inline_text(&mut output.text_bytes, &mut cursor, &value);
                }
                KeyboardEvent::ImeDisabled { .. } => output.event_type = 6,
                KeyboardEvent::TextInput { text: value, .. } => {
                    output.event_type = 7;
                    output.text0_length =
                        push_inline_text(&mut output.text_bytes, &mut cursor, &value);
                }
            }
        }
        PlatformEvent::Gamepad(event) => {
            output.kind = 4;
            output.subject_id = event.gamepad_id();
            match event {
                GamepadEvent::Connected { name, .. } => {
                    output.event_type = 1;
                    output.text0_length =
                        push_inline_text(&mut output.text_bytes, &mut cursor, &name);
                }
                GamepadEvent::Disconnected { .. } => output.event_type = 2,
                GamepadEvent::Button { button, state, .. } => {
                    output.event_type = 3;
                    output.flags = u32::from(state.is_pressed()) * FLAG_TRUE;
                    output.text0_length =
                        push_inline_debug(&mut output.text_bytes, &mut cursor, button);
                }
                GamepadEvent::Axis { axis, value, .. } => {
                    output.event_type = 4;
                    output.values[0] = value;
                    output.text0_length =
                        push_inline_debug(&mut output.text_bytes, &mut cursor, axis);
                }
            }
        }
    }
    output
}

/// Returns `true` if there are still unconsumed events queued from the current pump cycle.
pub fn has_pending_events() -> bool {
    PENDING_EVENTS.with(|q| !q.borrow().is_empty())
}

/// Enqueues a newly pumped list of platform events into the thread-local queue.
pub fn enqueue_events(events: Vec<PlatformEvent>) {
    PENDING_EVENTS.with(|q| {
        let mut q = q.borrow_mut();
        for ev in events {
            let fields = full_text_fields(&ev);
            let mut record = encode_event(ev);
            let truncated = fields
                .iter()
                .zip([
                    record.text0_length,
                    record.text1_length,
                    record.text2_length,
                ])
                .any(|(text, length)| text.len() != usize::from(length));
            if truncated {
                record.flags |= FLAG_TEXT_OVERFLOW;
            }
            q.push_back(QueuedEvent {
                record,
                full_text: truncated.then_some(fields),
            });
        }
    });
}

/// Pops the next encoded event from the thread-local queue, setting `has_more = 1` if more remain.
/// Returns a zeroed record (`kind == 0, has_more == 0`) if the queue is empty.
pub fn pop_next_event() -> GalfusPlatformEvent {
    PENDING_EVENTS.with(|q| {
        let mut q = q.borrow_mut();
        if let Some(mut ev) = q.pop_front() {
            ev.record.has_more = u8::from(!q.is_empty());
            CURRENT_TEXT.with(|text| *text.borrow_mut() = ev.full_text);
            ev.record
        } else {
            CURRENT_TEXT.with(|text| *text.borrow_mut() = None);
            GalfusPlatformEvent::default()
        }
    })
}

/// Clears all pending events on platform shutdown.
pub(crate) fn clear_pending_events() {
    PENDING_EVENTS.with(|q| q.borrow_mut().clear());
    CURRENT_TEXT.with(|text| *text.borrow_mut() = None);
}

/// The pointer is valid on the current thread until the next event is popped or shutdown.
pub(crate) fn current_text(slot: usize) -> Option<(*const u8, u32)> {
    CURRENT_TEXT.with(|current| {
        let current = current.borrow();
        let value = current.as_ref()?.get(slot)?;
        let pointer = if value.is_empty() {
            c"".as_ptr().cast::<u8>()
        } else {
            value.as_ptr()
        };
        Some((pointer, u32::try_from(value.len()).ok()?))
    })
}

#[cfg(test)]
pub(crate) fn pending_event_count() -> usize {
    PENDING_EVENTS.with(|q| q.borrow().len())
}

#[cfg(test)]
mod tests {
    use super::*;
    use galfus_platform::{KeyCode, KeyState, LogicalKey, ModifiersState};

    #[test]
    fn ffi_layout_is_128_bytes() {
        assert_eq!(std::mem::size_of::<GalfusPlatformEvent>(), 128);
    }

    #[test]
    fn inline_event_encoding_preserves_utf8_text_and_has_more() {
        clear_pending_events();
        enqueue_events(vec![
            PlatformEvent::Keyboard(KeyboardEvent::Input {
                window_id: 1,
                physical_key: KeyCode::KeyW,
                logical_key: LogicalKey::Character("w".into()),
                text: Some("w".into()),
                state: KeyState::Pressed,
                modifiers: ModifiersState::EMPTY,
                repeat: false,
            }),
            PlatformEvent::Window(WindowEvent::CloseRequested { window_id: 1 }),
        ]);

        let first = pop_next_event();
        assert_eq!(first.kind, 3);
        assert_eq!(first.event_type, 1);
        assert_eq!(first.has_more, 1);
        let t0_end = first.text0_length as usize;
        let t1_end = t0_end + first.text1_length as usize;
        let t2_end = t1_end + first.text2_length as usize;
        assert_eq!(
            std::str::from_utf8(&first.text_bytes[..t0_end]).unwrap(),
            "KeyW"
        );
        assert_eq!(
            std::str::from_utf8(&first.text_bytes[t0_end..t1_end]).unwrap(),
            "w"
        );
        assert_eq!(
            std::str::from_utf8(&first.text_bytes[t1_end..t2_end]).unwrap(),
            "w"
        );

        let second = pop_next_event();
        assert_eq!(second.kind, 1);
        assert_eq!(second.event_type, 3);
        assert_eq!(second.has_more, 0);

        let empty = pop_next_event();
        assert_eq!(empty.kind, 0);
        assert_eq!(empty.has_more, 0);
    }

    #[test]
    fn ime_event_encoding_preserves_text_and_utf16_selection() {
        let event = encode_event(PlatformEvent::Keyboard(KeyboardEvent::ImePreedit {
            window_id: 9,
            text: "あ😀".into(),
            selection: Some([1, 3]),
        }));
        assert_eq!((event.kind, event.event_type, event.window_id), (3, 4, 9));
        assert_eq!(
            (event.subject_id, event.id, event.flags & FLAG_TRUE),
            (1, 3, FLAG_TRUE)
        );
        assert_eq!(
            std::str::from_utf8(&event.text_bytes[..event.text0_length as usize]).unwrap(),
            "あ😀"
        );
        let commit = encode_event(PlatformEvent::Keyboard(KeyboardEvent::ImeCommit {
            window_id: 9,
            text: "漢字".into(),
        }));
        assert_eq!(commit.event_type, 5);
        assert_eq!(
            std::str::from_utf8(&commit.text_bytes[..commit.text0_length as usize]).unwrap(),
            "漢字"
        );
    }

    #[test]
    fn overflow_preserves_complete_text_selection_order_and_lifetime() {
        clear_pending_events();
        let text = format!("{}\0漢😀", "é".repeat(45));
        enqueue_events(vec![
            PlatformEvent::Keyboard(KeyboardEvent::ImePreedit {
                window_id: 9,
                text: text.clone(),
                selection: Some([40, 48]),
            }),
            PlatformEvent::Keyboard(KeyboardEvent::ImeCommit {
                window_id: 9,
                text: text.clone(),
            }),
            PlatformEvent::Keyboard(KeyboardEvent::TextInput {
                window_id: 9,
                text: text.clone(),
            }),
            PlatformEvent::Window(WindowEvent::CloseRequested { window_id: 9 }),
        ]);
        for event_type in [4, 5, 7] {
            let event = pop_next_event();
            assert_eq!(event.event_type, event_type);
            assert_ne!(event.flags & FLAG_TEXT_OVERFLOW, 0);
            assert_eq!(event.has_more, 1);
            if event_type == 4 {
                assert_eq!((event.subject_id, event.id), (40, 48));
            }
            let mut len = 0;
            let pointer = unsafe { crate::ffi::galfus_platform_event_text(0, &mut len) };
            assert!(!pointer.is_null());
            assert_eq!(
                unsafe { std::slice::from_raw_parts(pointer, len as usize) },
                text.as_bytes()
            );
            let empty = unsafe { crate::ffi::galfus_platform_event_text(1, &mut len) };
            assert!(!empty.is_null());
            assert_eq!(len, 0);
        }
        assert_eq!(pop_next_event().kind, 1);
        let mut len = 1;
        assert!(unsafe { crate::ffi::galfus_platform_event_text(0, &mut len) }.is_null());
        assert_eq!(len, 0);
    }

    #[test]
    fn key_event_overflow_preserves_individual_fields() {
        clear_pending_events();
        let long = "😀".repeat(50);
        enqueue_events(vec![PlatformEvent::Keyboard(KeyboardEvent::Input {
            window_id: 1,
            physical_key: KeyCode::KeyW,
            logical_key: LogicalKey::Character("é".into()),
            text: Some(long.clone()),
            state: KeyState::Pressed,
            modifiers: ModifiersState::EMPTY,
            repeat: false,
        })]);
        let event = pop_next_event();
        assert_ne!(event.flags & FLAG_TEXT_OVERFLOW, 0);
        let (pointer, len) = current_text(2).unwrap();
        assert_eq!(
            unsafe { std::slice::from_raw_parts(pointer, len as usize) },
            long.as_bytes()
        );
        clear_pending_events();
    }

    #[test]
    fn clearing_events_empties_pending_queue() {
        clear_pending_events();
        enqueue_events(vec![PlatformEvent::Window(WindowEvent::CloseRequested {
            window_id: 1,
        })]);
        assert_eq!(pending_event_count(), 1);
        clear_pending_events();
        assert_eq!(pending_event_count(), 0);
    }
}
