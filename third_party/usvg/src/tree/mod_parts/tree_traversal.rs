// SPDX-License-Identifier: Apache-2.0 OR MIT

fn node_by_id<'a>(parent: &'a Group, id: &str) -> Option<&'a Node> {
    for child in &parent.children {
        if child.id() == id {
            return Some(child);
        }

        if let Node::Group(g) = child {
            if let Some(n) = node_by_id(g, id) {
                return Some(n);
            }
        }
    }

    None
}

fn has_text_nodes(root: &Group) -> bool {
    for node in &root.children {
        if let Node::Text(_) = node {
            return true;
        }

        let mut has_text = false;

        if let Node::Image(image) = node {
            if let ImageKind::SVG(tree) = &image.kind {
                if has_text_nodes(&tree.root) {
                    has_text = true;
                }
            }
        }

        node.subroots(|subroot| has_text |= has_text_nodes(subroot));

        if has_text {
            return true;
        }
    }

    false
}

fn loop_over_paint_servers(parent: &Group, f: &mut dyn FnMut(&Paint)) {
    fn push(paint: Option<&Paint>, f: &mut dyn FnMut(&Paint)) {
        if let Some(paint) = paint {
            f(paint);
        }
    }

    for node in &parent.children {
        match node {
            Node::Group(group) => loop_over_paint_servers(group, f),
            Node::Path(path) => {
                push(path.fill.as_ref().map(|f| &f.paint), f);
                push(path.stroke.as_ref().map(|f| &f.paint), f);
            }
            Node::Image(_) => {}
            // Flattened text would be used instead.
            Node::Text(_) => {}
        }

        node.subroots(|subroot| loop_over_paint_servers(subroot, f));
    }
}

impl Group {
    pub(crate) fn collect_clip_paths(&self, clip_paths: &mut Vec<Arc<ClipPath>>) {
        for node in self.children() {
            if let Node::Group(g) = node {
                if let Some(clip) = &g.clip_path {
                    if !clip_paths.iter().any(|other| Arc::ptr_eq(clip, other)) {
                        clip_paths.push(clip.clone());
                    }

                    if let Some(sub_clip) = &clip.clip_path {
                        if !clip_paths.iter().any(|other| Arc::ptr_eq(sub_clip, other)) {
                            clip_paths.push(sub_clip.clone());
                        }
                    }
                }
            }

            node.subroots(|subroot| subroot.collect_clip_paths(clip_paths));

            if let Node::Group(g) = node {
                g.collect_clip_paths(clip_paths);
            }
        }
    }

    pub(crate) fn collect_masks(&self, masks: &mut Vec<Arc<Mask>>) {
        for node in self.children() {
            if let Node::Group(g) = node {
                if let Some(mask) = &g.mask {
                    if !masks.iter().any(|other| Arc::ptr_eq(mask, other)) {
                        masks.push(mask.clone());
                    }

                    if let Some(sub_mask) = &mask.mask {
                        if !masks.iter().any(|other| Arc::ptr_eq(sub_mask, other)) {
                            masks.push(sub_mask.clone());
                        }
                    }
                }
            }

            node.subroots(|subroot| subroot.collect_masks(masks));

            if let Node::Group(g) = node {
                g.collect_masks(masks);
            }
        }
    }

    pub(crate) fn collect_filters(&self, filters: &mut Vec<Arc<filter::Filter>>) {
        for node in self.children() {
            if let Node::Group(g) = node {
                for filter in g.filters() {
                    if !filters.iter().any(|other| Arc::ptr_eq(filter, other)) {
                        filters.push(filter.clone());
                    }
                }
            }

            node.subroots(|subroot| subroot.collect_filters(filters));

            if let Node::Group(g) = node {
                g.collect_filters(filters);
            }
        }
    }

    pub(crate) fn calculate_object_bbox(&mut self) -> Option<NonZeroRect> {
        let mut bbox = BBox::default();
        for child in &self.children {
            let mut c_bbox = child.bounding_box();
            if let Node::Group(group) = child {
                if let Some(r) = c_bbox.transform(group.transform) {
                    c_bbox = r;
                }
            }

            bbox = bbox.expand(c_bbox);
        }

        bbox.to_non_zero_rect()
    }

    pub(crate) fn calculate_bounding_boxes(&mut self) -> Option<()> {
        let mut bbox = BBox::default();
        let mut abs_bbox = BBox::default();
        let mut stroke_bbox = BBox::default();
        let mut abs_stroke_bbox = BBox::default();
        let mut layer_bbox = BBox::default();
        for child in &self.children {
            {
                let mut c_bbox = child.bounding_box();
                if let Node::Group(group) = child {
                    if let Some(r) = c_bbox.transform(group.transform) {
                        c_bbox = r;
                    }
                }

                bbox = bbox.expand(c_bbox);
            }

            abs_bbox = abs_bbox.expand(child.abs_bounding_box());

            {
                let mut c_bbox = child.stroke_bounding_box();
                if let Node::Group(group) = child {
                    if let Some(r) = c_bbox.transform(group.transform) {
                        c_bbox = r;
                    }
                }

                stroke_bbox = stroke_bbox.expand(c_bbox);
            }

            abs_stroke_bbox = abs_stroke_bbox.expand(child.abs_stroke_bounding_box());

            if let Node::Group(group) = child {
                let r = group.layer_bounding_box;
                if let Some(r) = r.transform(group.transform) {
                    layer_bbox = layer_bbox.expand(r);
                }
            } else {
                // Not a group - no need to transform.
                layer_bbox = layer_bbox.expand(child.stroke_bounding_box());
            }
        }

        // `bbox` can be None for empty groups, but we still have to
        // calculate `layer_bounding_box after` it.
        if let Some(bbox) = bbox.to_rect() {
            self.bounding_box = bbox;
            self.abs_bounding_box = abs_bbox.to_rect()?;
            self.stroke_bounding_box = stroke_bbox.to_rect()?;
            self.abs_stroke_bounding_box = abs_stroke_bbox.to_rect()?;
        }

        // Filter bbox has a higher priority than layers bbox.
        if let Some(filter_bbox) = self.filters_bounding_box() {
            self.layer_bounding_box = filter_bbox;
        } else {
            self.layer_bounding_box = layer_bbox.to_non_zero_rect()?;
        }

        self.abs_layer_bounding_box = self.layer_bounding_box.transform(self.abs_transform)?;

        Some(())
    }
}
