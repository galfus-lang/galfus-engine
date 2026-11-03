// Copyright 2021 the Resvg Authors
// SPDX-License-Identifier: Apache-2.0 OR MIT

#[rustfmt::skip] mod names;
mod parse;
mod text;
include!("mod_parts/document_and_nodes.rs");
include!("mod_parts/iteration_and_attributes.rs");
include!("mod_parts/typed_attributes.rs");
