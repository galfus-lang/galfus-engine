use glam::Vec2;
use serde::{Deserialize, Serialize};

use crate::transform::Transform2D;

/// Document model wrapping a mutable XML tree for SVG inspection and dynamic attribute updates.
#[derive(Debug, Clone)]
pub struct SvgDocument {
    /// Root element of the parsed SVG document.
    pub root: xmltree::Element,
}

impl SvgDocument {
    /// Parses an SVG XML string into a mutable document tree.
    pub fn parse(xml: &str) -> Result<Self, String> {
        let root = xmltree::Element::parse(xml.as_bytes())
            .map_err(|e| format!("Failed to parse SVG XML: {e}"))?;
        Ok(Self { root })
    }

    /// Sets or overwrites an attribute on the XML element matching `element_id`.
    ///
    /// Returns `true` if the element was found and updated, `false` otherwise.
    pub fn set_attribute(&mut self, element_id: &str, name: &str, value: &str) -> bool {
        Self::set_attr_recursive(&mut self.root, element_id, name, value)
    }

    fn set_attr_recursive(
        elem: &mut xmltree::Element,
        target_id: &str,
        name: &str,
        value: &str,
    ) -> bool {
        if elem.attributes.get("id").map(|s| s.as_str()) == Some(target_id) {
            elem.attributes.insert(name.to_string(), value.to_string());
            return true;
        }
        for child in &mut elem.children {
            if let xmltree::XMLNode::Element(child_elem) = child
                && Self::set_attr_recursive(child_elem, target_id, name, value)
            {
                return true;
            }
        }
        false
    }

    /// Removes an attribute from the XML element matching `element_id`.
    ///
    /// Returns `true` if the element and attribute were found and removed.
    pub fn remove_attribute(&mut self, element_id: &str, name: &str) -> bool {
        Self::remove_attr_recursive(&mut self.root, element_id, name)
    }

    fn remove_attr_recursive(elem: &mut xmltree::Element, target_id: &str, name: &str) -> bool {
        if elem.attributes.get("id").map(|s| s.as_str()) == Some(target_id) {
            return elem.attributes.remove(name).is_some();
        }
        for child in &mut elem.children {
            if let xmltree::XMLNode::Element(child_elem) = child
                && Self::remove_attr_recursive(child_elem, target_id, name)
            {
                return true;
            }
        }
        false
    }

    /// Sets the text content of the element matching `element_id`.
    ///
    /// Replaces all child nodes with a single Text node.
    pub fn set_text(&mut self, element_id: &str, text: &str) -> bool {
        Self::set_text_recursive(&mut self.root, element_id, text)
    }

    fn set_text_recursive(elem: &mut xmltree::Element, target_id: &str, text: &str) -> bool {
        if elem.attributes.get("id").map(|s| s.as_str()) == Some(target_id) {
            elem.children.clear();
            if text.contains('\n') && elem.name == "text" {
                let x_coord = elem
                    .attributes
                    .get("x")
                    .cloned()
                    .unwrap_or_else(|| "0".to_string());
                for (idx, line) in text.lines().enumerate() {
                    let mut tspan = xmltree::Element::new("tspan");
                    tspan.attributes.insert("x".to_string(), x_coord.clone());
                    if idx > 0 {
                        tspan
                            .attributes
                            .insert("dy".to_string(), "1.25em".to_string());
                    }
                    tspan
                        .children
                        .push(xmltree::XMLNode::Text(line.to_string()));
                    elem.children.push(xmltree::XMLNode::Element(tspan));
                }
            } else {
                elem.children.push(xmltree::XMLNode::Text(text.to_string()));
            }
            return true;
        }
        for child in &mut elem.children {
            if let xmltree::XMLNode::Element(child_elem) = child
                && Self::set_text_recursive(child_elem, target_id, text)
            {
                return true;
            }
        }
        false
    }

    /// Serializes the document tree back into an XML string.
    pub fn to_xml_string(&self) -> Result<String, String> {
        let mut buf = Vec::new();
        self.root
            .write(&mut buf)
            .map_err(|e| format!("Failed to write SVG XML: {e}"))?;
        String::from_utf8(buf).map_err(|e| format!("Invalid UTF-8 in serialized SVG XML: {e}"))
    }
}

/// Serializable descriptor for creating or configuring a 2D SVG entity.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Svg2DDesc {
    /// Optional human-readable debug label.
    pub label: Option<String>,
    /// Source SVG XML markup string.
    pub source: String,
    /// Explicit target rasterization dimensions (width, height) in world/pixel units.
    pub dimensions: Option<Vec2>,
    /// DPI/retina resolution multiplier. Defaults to 1.0.
    #[serde(default = "default_scale_factor")]
    pub scale_factor: f32,
    /// Optional logical material ID for custom surface shader effects.
    pub material_id: Option<u32>,
    /// Whether this SVG entity blocks light and casts 2D shadows.
    #[serde(default = "default_true")]
    pub cast_shadow: bool,
    /// Whether this SVG entity receives 2D shadow illumination.
    #[serde(default = "default_true")]
    pub receive_shadow: bool,
    /// Shadow projection height scalar.
    #[serde(default = "default_shadow_height")]
    pub shadow_height: f32,
    /// Shadow layer filter mask.
    #[serde(default = "default_shadow_layer_mask")]
    pub shadow_layer_mask: u32,
    /// Optional vertical height interval [min_z, max_z] where this occluder blocks light.
    #[serde(default)]
    pub height_range: Option<[f32; 2]>,
    /// If true, the SVG is invisible and serves purely as occluder geometry.
    #[serde(default)]
    pub occluder_only: bool,
    /// Optional explicit draw order override within the same Z layer.
    #[serde(default)]
    pub draw_order: Option<i32>,
}

fn default_scale_factor() -> f32 {
    1.0
}

fn default_true() -> bool {
    true
}

fn default_shadow_height() -> f32 {
    1.0
}

fn default_shadow_layer_mask() -> u32 {
    u32::MAX
}

/// 2D SVG vector entity with mutable DOM and GPU rasterization synchronization.
#[derive(Debug, Clone)]
pub struct Svg2D {
    /// Optional debug label.
    pub label: Option<String>,
    /// Raw source XML markup string.
    pub source: String,
    /// Parsed mutable SVG XML document.
    pub doc: Option<SvgDocument>,
    /// Target raster dimensions in pixels (if None, derived from SVG viewBox/width/height).
    pub dimensions: Option<Vec2>,
    /// DPI/retina scale factor.
    pub scale_factor: f32,
    /// Optional logical material ID.
    pub material_id: Option<u32>,
    /// Whether this SVG casts 2D shadows.
    pub cast_shadow: bool,
    /// Whether this SVG receives 2D shadows.
    pub receive_shadow: bool,
    /// Shadow projection height scalar.
    pub shadow_height: f32,
    /// Shadow layer filter mask.
    pub shadow_layer_mask: u32,
    /// Optional vertical height interval [min_z, max_z] where this occluder blocks light.
    pub height_range: Option<[f32; 2]>,
    /// If true, the SVG is invisible and serves purely as occluder geometry.
    pub occluder_only: bool,
    /// Optional explicit draw order override within the same Z layer.
    pub draw_order: Option<i32>,
    /// Dirty flag indicating the GPU texture needs re-rasterization.
    pub dirty: bool,
}

impl Default for Svg2D {
    fn default() -> Self {
        Self {
            label: None,
            source: String::new(),
            doc: None,
            dimensions: None,
            scale_factor: 1.0,
            material_id: None,
            cast_shadow: true,
            receive_shadow: true,
            shadow_height: 1.0,
            shadow_layer_mask: u32::MAX,
            height_range: None,
            occluder_only: false,
            draw_order: None,
            dirty: true,
        }
    }
}

impl Svg2D {
    /// Creates a new SVG entity from a source XML string.
    pub fn new(source: String, dimensions: Option<Vec2>) -> Self {
        let doc = SvgDocument::parse(&source).ok();
        Self {
            source,
            doc,
            dimensions,
            dirty: true,
            ..Default::default()
        }
    }

    /// Replaces the source XML string and reparses the document.
    pub fn set_source(&mut self, source: String) {
        self.doc = SvgDocument::parse(&source).ok();
        self.source = source;
        self.dirty = true;
    }

    /// Sets or overwrites an attribute on the element matching `element_id`.
    pub fn set_attribute(&mut self, element_id: &str, name: &str, value: &str) -> bool {
        if let Some(ref mut doc) = self.doc
            && doc.set_attribute(element_id, name, value)
        {
            if let Ok(updated) = doc.to_xml_string() {
                self.source = updated;
            }
            self.dirty = true;
            return true;
        }
        false
    }

    /// Removes an attribute from the element matching `element_id`.
    pub fn remove_attribute(&mut self, element_id: &str, name: &str) -> bool {
        if let Some(ref mut doc) = self.doc
            && doc.remove_attribute(element_id, name)
        {
            if let Ok(updated) = doc.to_xml_string() {
                self.source = updated;
            }
            self.dirty = true;
            return true;
        }
        false
    }

    /// Sets the text content of the element matching `element_id`.
    pub fn set_text(&mut self, element_id: &str, text: &str) -> bool {
        if let Some(ref mut doc) = self.doc
            && doc.set_text(element_id, text)
        {
            if let Ok(updated) = doc.to_xml_string() {
                self.source = updated;
            }
            self.dirty = true;
            return true;
        }
        false
    }

    /// Returns the current serialized XML string of the SVG.
    pub fn current_xml(&self) -> &str {
        &self.source
    }

    /// Computes world-space bounding corners for 2D polar shadow occlusion.
    pub fn compute_world_corners(&self, transform: &Transform2D, fallback_size: Vec2) -> [Vec2; 4] {
        let base_size = self.dimensions.unwrap_or(fallback_size);
        let half = base_size * 0.5;
        [
            transform.transform_point(Vec2::new(-half.x, -half.y)),
            transform.transform_point(Vec2::new(half.x, -half.y)),
            transform.transform_point(Vec2::new(half.x, half.y)),
            transform.transform_point(Vec2::new(-half.x, half.y)),
        ]
    }

    /// Computes the GPU model matrix transforming the [-0.5, 0.5] unit quad to the SVG's dimensions and world transform.
    pub fn compute_model_matrix(&self, transform: &Transform2D, fallback_size: Vec2) -> glam::Mat4 {
        let base_size = self.dimensions.unwrap_or(fallback_size);
        let size = base_size * transform.scale;
        glam::Mat4::from_scale_rotation_translation(
            glam::Vec3::new(size.x, size.y, 1.0),
            glam::Quat::from_rotation_z(transform.rotation),
            glam::Vec3::new(
                transform.position.x,
                transform.position.y,
                transform.z_layer as f32,
            ),
        )
    }
}

impl From<Svg2DDesc> for Svg2D {
    fn from(desc: Svg2DDesc) -> Self {
        let doc = SvgDocument::parse(&desc.source).ok();
        Self {
            label: desc.label,
            source: desc.source,
            doc,
            dimensions: desc.dimensions,
            scale_factor: if desc.scale_factor <= 0.0 {
                1.0
            } else {
                desc.scale_factor
            },
            material_id: desc.material_id,
            cast_shadow: desc.cast_shadow,
            receive_shadow: desc.receive_shadow,
            shadow_height: desc.shadow_height,
            shadow_layer_mask: desc.shadow_layer_mask,
            height_range: desc.height_range,
            occluder_only: desc.occluder_only,
            draw_order: desc.draw_order,
            dirty: true,
        }
    }
}

impl Serialize for Svg2D {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        Svg2DDesc {
            label: self.label.clone(),
            source: self.source.clone(),
            dimensions: self.dimensions,
            scale_factor: self.scale_factor,
            material_id: self.material_id,
            cast_shadow: self.cast_shadow,
            receive_shadow: self.receive_shadow,
            shadow_height: self.shadow_height,
            shadow_layer_mask: self.shadow_layer_mask,
            height_range: self.height_range,
            occluder_only: self.occluder_only,
            draw_order: self.draw_order,
        }
        .serialize(serializer)
    }
}

impl<'de> Deserialize<'de> for Svg2D {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        Svg2DDesc::deserialize(deserializer).map(Into::into)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const TEST_SVG: &str = r##"<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
        <rect id="bg" x="0" y="0" width="100" height="100" fill="red" />
        <use id="icon" href="#idle" />
        <text id="counter">0</text>
    </svg>"##;

    #[test]
    fn test_svg_document_parse_and_serialize() {
        let doc = SvgDocument::parse(TEST_SVG).expect("parse failed");
        let xml = doc.to_xml_string().expect("serialize failed");
        assert!(xml.contains(r#"id="bg""#));
        assert!(xml.contains(r#"id="icon""#));
    }

    #[test]
    fn test_svg_set_and_remove_attribute() {
        let mut svg = Svg2D::new(TEST_SVG.to_string(), None);
        // Overwrite fill attribute
        let updated = svg.set_attribute("bg", "fill", "blue");
        assert!(updated);
        assert!(svg.current_xml().contains(r#"fill="blue""#));
        assert!(!svg.current_xml().contains(r#"fill="red""#));

        // Switch <use> state
        let updated_use = svg.set_attribute("icon", "href", "#hover");
        assert!(updated_use);
        assert!(svg.current_xml().contains(r##"href="#hover""##));

        // Remove attribute
        let removed = svg.remove_attribute("bg", "fill");
        assert!(removed);
        assert!(!svg.current_xml().contains("fill="));
    }

    #[test]
    fn test_svg_set_text() {
        let mut svg = Svg2D::new(TEST_SVG.to_string(), None);
        let updated_text = svg.set_text("counter", "999");
        assert!(updated_text);
        assert!(svg.current_xml().contains(">999<"));
    }

    #[test]
    fn test_svg_serde_roundtrip() {
        let svg = Svg2D::new(TEST_SVG.to_string(), Some(Vec2::new(200.0, 200.0)));
        let json = serde_json::to_string(&svg).expect("serialize json");
        let restored: Svg2D = serde_json::from_str(&json).expect("deserialize json");
        assert_eq!(restored.dimensions, Some(Vec2::new(200.0, 200.0)));
        assert!(restored.doc.is_some());
    }
}
