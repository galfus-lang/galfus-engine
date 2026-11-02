// Copyright 2019 the Resvg Authors
// SPDX-License-Identifier: Apache-2.0 OR MIT

pub mod filter;
mod geom;
mod text;
include!("mod_parts/core_types_and_gradients.rs");
include!("mod_parts/stops_and_patterns.rs");
include!("mod_parts/clipping_and_masks.rs");
include!("mod_parts/geometry_and_nodes.rs");
include!("mod_parts/tree_traversal.rs");
