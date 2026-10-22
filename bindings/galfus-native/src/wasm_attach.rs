//! Hand-written asynchronous browser entry points that cannot be derived from the Node-API layer.

use wasm_bindgen::JsCast;
use wasm_bindgen::prelude::*;

use galfus_gpu_manager::GpuShared;

use crate::state::{with_context, with_multiverse_mut};

fn canvas_by_id(canvas_id: &str) -> Result<web_sys::HtmlCanvasElement, JsValue> {
    web_sys::window()
        .and_then(|window| window.document())
        .and_then(|document| document.get_element_by_id(canvas_id))
        .ok_or_else(|| JsValue::from_str(&format!("Canvas '{canvas_id}' was not found")))?
        .dyn_into::<web_sys::HtmlCanvasElement>()
        .map_err(|_| JsValue::from_str(&format!("Element '{canvas_id}' is not a canvas")))
}

fn js_err(error: impl ToString) -> JsValue {
    JsValue::from_str(&error.to_string())
}

/// Attaches a browser canvas window to the Multiverse, initializing WebGPU/WebGL asynchronously.
#[wasm_bindgen(js_name = "multiverseAttachWindow")]
pub async fn multiverse_attach_window(window_id: u32) -> Result<(), JsValue> {
    let (canvas_id, size) = with_context(|ctx| {
        let win = ctx.get_window(window_id).map_err(|e| e.to_string())?;
        Ok((win.canvas_id().to_string(), win.inner_size()))
    })
    .map_err(js_err)?;
    let canvas = canvas_by_id(&canvas_id)?;
    let (width, height) = (size.x.max(1), size.y.max(1));

    let existing_instance =
        with_multiverse_mut(|mv| Ok(mv.gpu_manager().map(|gpu| gpu.context.instance().clone())))
            .map_err(js_err)?;

    if let Some(instance) = existing_instance {
        let surface = instance
            .create_surface(wgpu::SurfaceTarget::Canvas(canvas))
            .map_err(js_err)?;
        return with_multiverse_mut(|mv| {
            mv.attach_prepared_surface(window_id, None, surface, width, height)
                .map_err(|e| e.to_string())
        })
        .map_err(js_err);
    }

    let instance = GpuShared::new(wgpu::Instance::new(&wgpu::InstanceDescriptor::default()));
    let surface = instance
        .create_surface(wgpu::SurfaceTarget::Canvas(canvas))
        .map_err(js_err)?;
    let gpu = galfus_gpu_manager::GpuManager::with_instance_async(
        GpuShared::clone(&instance),
        Some(&surface),
    )
    .await
    .map_err(js_err)?;
    with_multiverse_mut(|mv| {
        mv.attach_prepared_surface(window_id, Some(gpu), surface, width, height)
            .map_err(|e| e.to_string())
    })
    .map_err(js_err)
}
