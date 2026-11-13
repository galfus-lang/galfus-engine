//! Texture fitting calculations for sprite panels.

use galfus_realm_2d_resources::ui::SpriteImageMode;

pub(super) fn fit_sprite(
    rect: [f32; 4],
    uv: [f32; 4],
    texture: [f32; 2],
    mode: SpriteImageMode,
) -> ([f32; 4], [f32; 4]) {
    let source_w = texture[0] * (uv[2] - uv[0]).abs();
    let source_h = texture[1] * (uv[3] - uv[1]).abs();
    if source_w <= 0.0 || source_h <= 0.0 || rect[2] <= 0.0 || rect[3] <= 0.0 {
        return (rect, uv);
    }
    let sx = rect[2] / source_w;
    let sy = rect[3] / source_h;
    match mode {
        SpriteImageMode::Contain => {
            let scale = sx.min(sy);
            let width = source_w * scale;
            let height = source_h * scale;
            (
                [
                    rect[0] + (rect[2] - width) * 0.5,
                    rect[1] + (rect[3] - height) * 0.5,
                    width,
                    height,
                ],
                uv,
            )
        }
        SpriteImageMode::Cover => {
            let scale = sx.max(sy);
            let crop_u = (1.0 - rect[2] / (source_w * scale)) * 0.5 * (uv[2] - uv[0]);
            let crop_v = (1.0 - rect[3] / (source_h * scale)) * 0.5 * (uv[3] - uv[1]);
            (
                rect,
                [
                    uv[0] + crop_u,
                    uv[1] + crop_v,
                    uv[2] - crop_u,
                    uv[3] - crop_v,
                ],
            )
        }
        _ => (rect, uv),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn contain_and_cover_preserve_source_aspect_ratio() {
        let rect = [0.0, 0.0, 100.0, 100.0];
        let uv = [0.0, 0.0, 1.0, 1.0];
        assert_eq!(
            fit_sprite(rect, uv, [200.0, 100.0], SpriteImageMode::Contain),
            ([0.0, 25.0, 100.0, 50.0], uv)
        );
        assert_eq!(
            fit_sprite(rect, uv, [200.0, 100.0], SpriteImageMode::Cover),
            (rect, [0.25, 0.0, 0.75, 1.0])
        );
    }
}
