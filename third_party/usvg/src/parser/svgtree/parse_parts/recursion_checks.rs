// SPDX-License-Identifier: Apache-2.0 OR MIT

/// Detects cases like:
///
/// ```xml
/// <filter id="filter1">
///   <feImage xlink:href="#rect1"/>
/// </filter>
/// <rect id="rect1" x="36" y="36" width="120" height="120" fill="green" filter="url(#filter1)"/>
/// ```
fn fix_recursive_fe_image(doc: &mut Document) {
    let mut ids = Vec::new();
    for fe_node in doc
        .root()
        .descendants()
        .filter(|n| n.tag_name() == Some(EId::FeImage))
    {
        if let Some(link) = fe_node.node_attribute(AId::Href) {
            if let Some(filter_uri) = link.attribute::<&str>(AId::Filter) {
                let filter_id = fe_node.parent().unwrap().element_id();
                for func in svgtypes::FilterValueListParser::from(filter_uri).flatten() {
                    if let svgtypes::FilterValue::Url(url) = func {
                        if url == filter_id {
                            ids.push(link.id);
                        }
                    }
                }
            }
        }
    }

    for id in ids {
        let idx = doc.get(id).attribute_id(AId::Filter).unwrap();
        doc.attrs[idx].value = roxmltree::StringStorage::Borrowed("none");
    }
}
