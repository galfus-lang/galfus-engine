# Galfus patch to usvg

This directory contains `usvg` 0.48.1 from crates.io, under the original Apache-2.0 OR MIT license.
The workspace patch makes this the single `usvg` used by `resvg` and Galfus.

The local changes:

1. Expose shaped cluster metrics from the existing text layout. Collection is disabled by default
   and enabled only for explicit layout queries. The shaping and rendering algorithms remain those
   of `usvg`. The changes are in `src/parser/options.rs`, `src/parser/mod.rs`,
   `src/parser/text_parts/`, `src/text/mod.rs`, and `src/text/layout_parts/`.
2. Support `<image textureId="<u32>">` for binding logical Galfus GPU textures directly to SVG
   `<image>` elements without filesystem or protocol resolution (`href` is ignored on `<image>`),
   preserving all standard `<image>` attributes (`x`, `y`, `width`, `height`,
   `preserveAspectRatio`, `image-rendering`, `visibility`, `opacity`, `transform`, `clip-path`,
   `id`). The changes are in `src/parser/svgtree/names_parts/`, `src/parser/image.rs`,
   `src/parser/filter_parts/filter_inputs.rs`, `src/tree/mod_parts/geometry_and_nodes.rs`, and
   `src/text/flatten.rs`.

Large upstream source files are split into `include!` fragments at Rust item boundaries; each
fragment remains in the original module and shares its scope. The crate retains the upstream
license, and the generated names remain unchanged.

When upgrading, rebase these changes onto the new upstream release and run the SVG text layout
tests, including bidirectional text, transforms, whitespace, and ligatures. Prefer the upstream
API and remove this patch if it provides equivalent cluster metrics in the future.
