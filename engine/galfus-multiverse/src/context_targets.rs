//! Target lifecycle methods for the multiverse context.

use super::*;

impl MultiverseContext {
    /// Registers a new Target (Window or Texture) under a host logical ID.
    pub fn create_target(&mut self, target_id: u32, desc: TargetDesc) -> MultiverseResult<()> {
        validate_host_logical_id(target_id)?;
        if self.targets.contains_key(&target_id) {
            return Err(MultiverseError::TargetAlreadyExists(target_id));
        }

        if let TargetKind::Texture {
            width,
            height,
            format,
        } = &desc.kind
        {
            let gpu = self.ensure_gpu_manager()?;
            let norm_format = NormalizedTextureFormat::parse_str(format).ok_or_else(|| {
                MultiverseError::InvalidConfig(format!(
                    "Unsupported render target texture format: '{format}'"
                ))
            })?;
            let wgpu_format = norm_format.to_wgpu();
            let usages = TextureUsageFlags {
                copy_src: true,
                ..Default::default()
            };
            let tex_desc = GpuTextureDesc {
                label: Some(format!("Multiverse Target {target_id}")),
                width: *width,
                height: *height,
                depth_or_layers: 1,
                mip_levels: 1,
                sample_count: 1,
                dimension: TextureDimension::D2,
                format: norm_format,
                usages,
            };
            let device = gpu.context.device_arc();
            let tex_handle = gpu
                .textures
                .create_texture(&device, &tex_desc)
                .map_err(|e| MultiverseError::InvalidConfig(e.to_string()))?;
            let view_handle = gpu
                .textures
                .get_texture(tex_handle)
                .map_err(|e| MultiverseError::InvalidConfig(e.to_string()))?
                .default_view();
            self.target_textures
                .insert(target_id, (tex_handle, view_handle, wgpu_format));
        }

        self.targets.insert(target_id, desc);
        self.dirty = true;
        Ok(())
    }

    /// Destroys a Target and removes associated invocations, connectors, bindings, and GPU resources.
    pub fn destroy_target(&mut self, target_id: u32) -> MultiverseResult<()> {
        if self.targets.remove(&target_id).is_none() {
            return Err(MultiverseError::TargetNotFound(target_id));
        }
        if let (Some((tex_handle, _, _)), Some(gpu)) = (
            self.target_textures.remove(&target_id),
            &mut self.gpu_manager,
        ) {
            let _ = gpu.textures.destroy_texture(tex_handle);
        }
        if let (Some((hist_handle, _, _)), Some(gpu)) = (
            self.target_history_textures.remove(&target_id),
            &mut self.gpu_manager,
        ) {
            let _ = gpu.textures.destroy_texture(hist_handle);
        }
        let removed_invs: Vec<u32> = self
            .invocations
            .iter()
            .filter(|(_, inv)| inv.target_id == target_id)
            .map(|(&id, _)| id)
            .collect();
        for inv_id in removed_invs {
            self.invocations.remove(&inv_id);
            if let (Some((tex_h, _, _)), Some(gpu)) =
                (self.scratch_textures.remove(&inv_id), &mut self.gpu_manager)
            {
                let _ = gpu.textures.destroy_texture(tex_h);
            }
            if let (Some(entry), Some(gpu)) =
                (self.taa_history.remove(&inv_id), &mut self.gpu_manager)
            {
                let _ = gpu.textures.destroy_texture(entry.tex_a);
                let _ = gpu.textures.destroy_texture(entry.tex_b);
            }
        }
        self.bindings.retain(|b| b.source_target_id != target_id);
        self.dirty = true;
        Ok(())
    }
}
