// SPDX-License-Identifier: Apache-2.0 OR MIT

fn append_attribute<'input>(
    parent_id: NodeId,
    tag_name: EId,
    aid: AId,
    value: roxmltree::StringStorage<'input>,
    important: bool,
    doc: &mut Document<'input>,
) -> bool {
    match aid {
        // The `style` attribute will be split into attributes, so we don't need it.
        AId::Style |
        // No need to copy a `class` attribute since CSS were already resolved.
        AId::Class => return false,
        _ => {}
    }

    // Ignore `xlink:href` on `tspan` (which was originally `tref` or `a`),
    // because we will convert `tref` into `tspan` anyway.
    if tag_name == EId::Tspan && aid == AId::Href {
        return false;
    }

    if aid.allows_inherit_value() && &*value == "inherit" {
        return resolve_inherit(parent_id, aid, doc);
    }

    doc.append_attribute(aid, value, important);
    true
}

fn resolve_inherit(parent_id: NodeId, aid: AId, doc: &mut Document) -> bool {
    if aid.is_inheritable() {
        // Inheritable attributes can inherit a value from an any ancestor.
        let node_id = doc
            .get(parent_id)
            .ancestors()
            .find(|n| n.has_attribute(aid))
            .map(|n| n.id);
        if let Some(node_id) = node_id {
            if let Some(attr) = doc
                .get(node_id)
                .attributes()
                .iter()
                .find(|a| a.name == aid)
                .cloned()
            {
                doc.attrs.push(Attribute {
                    name: aid,
                    value: attr.value,
                    important: attr.important,
                });

                return true;
            }
        }
    } else {
        // Non-inheritable attributes can inherit a value only from a direct parent.
        if let Some(attr) = doc
            .get(parent_id)
            .attributes()
            .iter()
            .find(|a| a.name == aid)
            .cloned()
        {
            doc.attrs.push(Attribute {
                name: aid,
                value: attr.value,
                important: attr.important,
            });

            return true;
        }
    }

    // Fallback to a default value if possible.
    let value = match aid {
        AId::ImageRendering | AId::ShapeRendering | AId::TextRendering => "auto",

        AId::ClipPath
        | AId::Filter
        | AId::MarkerEnd
        | AId::MarkerMid
        | AId::MarkerStart
        | AId::Mask
        | AId::Stroke
        | AId::StrokeDasharray
        | AId::TextDecoration => "none",

        AId::FontStretch
        | AId::FontStyle
        | AId::FontVariant
        | AId::FontWeight
        | AId::LetterSpacing
        | AId::WordSpacing => "normal",

        AId::Fill | AId::FloodColor | AId::StopColor => "black",

        AId::FillOpacity
        | AId::FloodOpacity
        | AId::Opacity
        | AId::StopOpacity
        | AId::StrokeOpacity => "1",

        AId::ClipRule | AId::FillRule => "nonzero",

        AId::BaselineShift => "baseline",
        AId::ColorInterpolationFilters => "linearRGB",
        AId::Direction => "ltr",
        AId::Display => "inline",
        AId::FontSize => "medium",
        AId::Overflow => "visible",
        AId::StrokeDashoffset => "0",
        AId::StrokeLinecap => "butt",
        AId::StrokeLinejoin => "miter",
        AId::StrokeMiterlimit => "4",
        AId::StrokeWidth => "1",
        AId::TextAnchor => "start",
        AId::Visibility => "visible",
        AId::WritingMode => "lr-tb",
        _ => return false,
    };

    doc.append_attribute(aid, roxmltree::StringStorage::Borrowed(value), false);
    true
}

fn resolve_href<'a, 'input: 'a>(
    node: roxmltree::Node<'a, 'input>,
    id_map: &HashMap<&str, roxmltree::Node<'a, 'input>>,
) -> Option<roxmltree::Node<'a, 'input>> {
    // See the comment in `parse_svg_element` about `href` precedence.
    //
    // Note: `roxmltree::Node::attribute("href")` matches by local name only and
    // would return whichever `href`/`xlink:href` comes first, so we have to
    // filter by namespace explicitly.
    let link_value = node
        .attributes()
        .find(|a| a.name() == "href" && a.namespace().is_none())
        .or_else(|| {
            node.attributes()
                .find(|a| a.name() == "href" && a.namespace() == Some(XLINK_NS))
        })
        .map(|a| a.value())?;

    let link_id = svgtypes::IRI::from_str(link_value).ok()?.0;

    id_map.get(link_id).copied()
}

fn parse_svg_use_element<'input>(
    node: roxmltree::Node<'_, 'input>,
    origin: roxmltree::Node,
    parent_id: NodeId,
    style_sheet: &simplecss::StyleSheet,
    depth: u32,
    doc: &mut Document<'input>,
    id_map: &HashMap<&str, roxmltree::Node<'_, 'input>>,
) -> Result<(), Error> {
    let link = match resolve_href(node, id_map) {
        Some(v) => v,
        None => return Ok(()),
    };

    if link == node || link == origin {
        log::warn!(
            "Recursive 'use' detected. '{}' will be skipped.",
            node.attribute((SVG_NS, "id")).unwrap_or_default()
        );
        return Ok(());
    }

    // Make sure we're linked to an SVG element.
    if parse_tag_name(link).is_none() {
        return Ok(());
    }

    // Check that none of the linked node's children reference current `use` node
    // via other `use` node.
    //
    // Example:
    // <g id="g1">
    //     <use xlink:href="#use1" id="use2"/>
    // </g>
    // <use xlink:href="#g1" id="use1"/>
    //
    // `use2` should be removed.
    //
    // Also, child should not reference its parent:
    // <g id="g1">
    //     <use xlink:href="#g1" id="use1"/>
    // </g>
    //
    // `use1` should be removed.
    let mut is_recursive = false;
    for link_child in link
        .descendants()
        .skip(1)
        .filter(|n| n.has_tag_name((SVG_NS, "use")))
    {
        if let Some(link2) = resolve_href(link_child, id_map) {
            if link2 == node || link2 == link {
                is_recursive = true;
                break;
            }
        }
    }

    if is_recursive {
        log::warn!(
            "Recursive 'use' detected. '{}' will be skipped.",
            node.attribute((SVG_NS, "id")).unwrap_or_default()
        );
        return Ok(());
    }

    parse_xml_node(
        link,
        node,
        parent_id,
        style_sheet,
        true,
        depth + 1,
        doc,
        id_map,
    )
}

fn resolve_css<'a>(
    xml: &'a roxmltree::Document<'a>,
    style_sheet: Option<&'a str>,
) -> simplecss::StyleSheet<'a> {
    let mut sheet = simplecss::StyleSheet::new();

    // Injected style sheets do not override internal ones (we mimic the logic of rsvg-convert),
    // so we need to parse it first.
    if let Some(style_sheet) = style_sheet {
        sheet.parse_more(style_sheet);
    }

    for node in xml.descendants().filter(|n| n.has_tag_name("style")) {
        match node.attribute("type") {
            Some("text/css") => {}
            Some(_) => continue,
            None => {}
        }

        let text = match node.text() {
            Some(v) => v,
            None => continue,
        };

        sheet.parse_more(text);
    }

    sheet
}

struct XmlNode<'a, 'input: 'a>(roxmltree::Node<'a, 'input>);

impl simplecss::Element for XmlNode<'_, '_> {
    fn parent_element(&self) -> Option<Self> {
        self.0.parent_element().map(XmlNode)
    }

    fn prev_sibling_element(&self) -> Option<Self> {
        self.0.prev_sibling_element().map(XmlNode)
    }

    fn has_local_name(&self, local_name: &str) -> bool {
        self.0.tag_name().name() == local_name
    }

    fn attribute_matches(&self, local_name: &str, operator: simplecss::AttributeOperator) -> bool {
        match self.0.attribute(local_name) {
            Some(value) => operator.matches(value),
            None => false,
        }
    }

    fn pseudo_class_matches(&self, class: simplecss::PseudoClass) -> bool {
        match class {
            simplecss::PseudoClass::FirstChild => self.prev_sibling_element().is_none(),
            // TODO: lang
            _ => false, // Since we are querying a static SVG we can ignore other pseudo-classes.
        }
    }
}

fn fix_recursive_patterns(doc: &mut Document) {
    while let Some(node_id) = find_recursive_pattern(AId::Fill, doc) {
        let idx = doc.get(node_id).attribute_id(AId::Fill).unwrap();
        doc.attrs[idx].value = roxmltree::StringStorage::Borrowed("none");
    }

    while let Some(node_id) = find_recursive_pattern(AId::Stroke, doc) {
        let idx = doc.get(node_id).attribute_id(AId::Stroke).unwrap();
        doc.attrs[idx].value = roxmltree::StringStorage::Borrowed("none");
    }
}

fn find_recursive_pattern(aid: AId, doc: &mut Document) -> Option<NodeId> {
    for pattern_node in doc
        .root()
        .descendants()
        .filter(|n| n.tag_name() == Some(EId::Pattern))
    {
        for node in pattern_node.descendants() {
            let value = match node.attribute(aid) {
                Some(v) => v,
                None => continue,
            };

            if let Ok(svgtypes::Paint::FuncIRI(link_id, _)) = svgtypes::Paint::from_str(value) {
                if link_id == pattern_node.element_id() {
                    // If a pattern child has a link to the pattern itself
                    // then we have to replace it with `none`.
                    // Otherwise we will get endless loop/recursion and stack overflow.
                    return Some(node.id);
                } else {
                    // Check that linked node children doesn't link this pattern.
                    if let Some(linked_node) = doc.element_by_id(link_id) {
                        for node2 in linked_node.descendants() {
                            let value2 = match node2.attribute(aid) {
                                Some(v) => v,
                                None => continue,
                            };

                            if let Ok(svgtypes::Paint::FuncIRI(link_id2, _)) =
                                svgtypes::Paint::from_str(value2)
                            {
                                if link_id2 == pattern_node.element_id() {
                                    return Some(node2.id);
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    None
}

fn fix_recursive_links(eid: EId, aid: AId, doc: &mut Document) {
    while let Some(node_id) = find_recursive_link(eid, aid, doc) {
        let idx = doc.get(node_id).attribute_id(aid).unwrap();
        doc.attrs[idx].value = roxmltree::StringStorage::Borrowed("none");
    }
}

fn find_recursive_link(eid: EId, aid: AId, doc: &Document) -> Option<NodeId> {
    for node in doc
        .root()
        .descendants()
        .filter(|n| n.tag_name() == Some(eid))
    {
        for child in node.descendants() {
            if let Some(link) = child.node_attribute(aid) {
                if link == node {
                    // If an element child has a link to the element itself
                    // then we have to replace it with `none`.
                    // Otherwise we will get endless loop/recursion and stack overflow.
                    return Some(child.id);
                } else {
                    // Check that linked node children doesn't link this element.
                    for node2 in link.descendants() {
                        if let Some(link2) = node2.node_attribute(aid) {
                            if link2 == node {
                                return Some(node2.id);
                            }
                        }
                    }
                }
            }
        }
    }

    None
}

