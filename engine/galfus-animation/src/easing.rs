//! Mathematical easing curves and spring dynamics for property transitions.

use serde::{Deserialize, Serialize};
use std::f32::consts::PI;

/// Animation easing curve classification.
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub enum Easing {
    #[default]
    Linear,
    EaseInQuad,
    EaseOutQuad,
    EaseInOutQuad,
    EaseInCubic,
    EaseOutCubic,
    EaseInOutCubic,
    EaseInQuart,
    EaseOutQuart,
    EaseInOutQuart,
    EaseInQuint,
    EaseOutQuint,
    EaseInOutQuint,
    EaseInSine,
    EaseOutSine,
    EaseInOutSine,
    EaseInExpo,
    EaseOutExpo,
    EaseInOutExpo,
    EaseInCirc,
    EaseOutCirc,
    EaseInOutCirc,
    EaseInBack,
    EaseOutBack,
    EaseInOutBack,
    EaseInElastic,
    EaseOutElastic,
    EaseInOutElastic,
    EaseInBounce,
    EaseOutBounce,
    EaseInOutBounce,
    Spring {
        stiffness: f32,
        damping: f32,
        mass: f32,
    },
}

impl Easing {
    /// Evaluates the easing function for a normalized time `t` in `[0.0, 1.0]`.
    pub fn evaluate(&self, t: f32) -> f32 {
        let t = t.clamp(0.0, 1.0);
        match self {
            Self::Linear => t,
            Self::EaseInQuad => t * t,
            Self::EaseOutQuad => t * (2.0 - t),
            Self::EaseInOutQuad => {
                if t < 0.5 {
                    2.0 * t * t
                } else {
                    -1.0 + (4.0 - 2.0 * t) * t
                }
            }
            Self::EaseInCubic => t * t * t,
            Self::EaseOutCubic => {
                let f = t - 1.0;
                f * f * f + 1.0
            }
            Self::EaseInOutCubic => {
                if t < 0.5 {
                    4.0 * t * t * t
                } else {
                    let f = 2.0 * t - 2.0;
                    0.5 * f * f * f + 1.0
                }
            }
            Self::EaseInQuart => t * t * t * t,
            Self::EaseOutQuart => {
                let f = t - 1.0;
                f * f * f * (1.0 - t) + 1.0
            }
            Self::EaseInOutQuart => {
                if t < 0.5 {
                    8.0 * t * t * t * t
                } else {
                    let f = t - 1.0;
                    -8.0 * f * f * f * f + 1.0
                }
            }
            Self::EaseInQuint => t * t * t * t * t,
            Self::EaseOutQuint => {
                let f = t - 1.0;
                f * f * f * f * f + 1.0
            }
            Self::EaseInOutQuint => {
                if t < 0.5 {
                    16.0 * t * t * t * t * t
                } else {
                    let f = 2.0 * t - 2.0;
                    0.5 * f * f * f * f * f + 1.0
                }
            }
            Self::EaseInSine => 1.0 - (t * PI * 0.5).cos(),
            Self::EaseOutSine => (t * PI * 0.5).sin(),
            Self::EaseInOutSine => 0.5 * (1.0 - (PI * t).cos()),
            Self::EaseInExpo => {
                if t == 0.0 {
                    0.0
                } else {
                    2.0_f32.powf(10.0 * (t - 1.0))
                }
            }
            Self::EaseOutExpo => {
                if t == 1.0 {
                    1.0
                } else {
                    1.0 - 2.0_f32.powf(-10.0 * t)
                }
            }
            Self::EaseInOutExpo => {
                if t == 0.0 {
                    0.0
                } else if t == 1.0 {
                    1.0
                } else if t < 0.5 {
                    0.5 * 2.0_f32.powf(20.0 * t - 10.0)
                } else {
                    1.0 - 0.5 * 2.0_f32.powf(-20.0 * t + 10.0)
                }
            }
            Self::EaseInCirc => 1.0 - (1.0 - t * t).sqrt(),
            Self::EaseOutCirc => (1.0 - (t - 1.0) * (t - 1.0)).sqrt(),
            Self::EaseInOutCirc => {
                if t < 0.5 {
                    0.5 * (1.0 - (1.0 - 4.0 * t * t).sqrt())
                } else {
                    0.5 * ((1.0 - (2.0 * t - 2.0).powi(2)).sqrt() + 1.0)
                }
            }
            Self::EaseInBack => {
                let c1 = 1.70158;
                let c3 = c1 + 1.0;
                c3 * t * t * t - c1 * t * t
            }
            Self::EaseOutBack => {
                let c1 = 1.70158;
                let c3 = c1 + 1.0;
                let f = t - 1.0;
                1.0 + c3 * f * f * f + c1 * f * f
            }
            Self::EaseInOutBack => {
                let c1 = 1.70158 * 1.525;
                if t < 0.5 {
                    0.5 * (4.0 * t * t * ((c1 + 1.0) * 2.0 * t - c1))
                } else {
                    let f = 2.0 * t - 2.0;
                    0.5 * (f * f * ((c1 + 1.0) * f + c1) + 2.0)
                }
            }
            Self::EaseInElastic => {
                if t == 0.0 {
                    0.0
                } else if t == 1.0 {
                    1.0
                } else {
                    let c4 = (2.0 * PI) / 3.0;
                    -2.0_f32.powf(10.0 * t - 10.0) * ((t * 10.0 - 10.75) * c4).sin()
                }
            }
            Self::EaseOutElastic => {
                if t == 0.0 {
                    0.0
                } else if t == 1.0 {
                    1.0
                } else {
                    let c4 = (2.0 * PI) / 3.0;
                    2.0_f32.powf(-10.0 * t) * ((t * 10.0 - 0.75) * c4).sin() + 1.0
                }
            }
            Self::EaseInOutElastic => {
                if t == 0.0 {
                    0.0
                } else if t == 1.0 {
                    1.0
                } else {
                    let c5 = (2.0 * PI) / 4.5;
                    if t < 0.5 {
                        -0.5 * (2.0_f32.powf(20.0 * t - 10.0) * ((20.0 * t - 11.125) * c5).sin())
                    } else {
                        0.5 * (2.0_f32.powf(-20.0 * t + 10.0) * ((20.0 * t - 11.125) * c5).sin())
                            + 1.0
                    }
                }
            }
            Self::EaseInBounce => 1.0 - Self::EaseOutBounce.evaluate(1.0 - t),
            Self::EaseOutBounce => {
                let n1 = 7.5625;
                let d1 = 2.75;
                if t < 1.0 / d1 {
                    n1 * t * t
                } else if t < 2.0 / d1 {
                    let f = t - 1.5 / d1;
                    n1 * f * f + 0.75
                } else if t < 2.5 / d1 {
                    let f = t - 2.25 / d1;
                    n1 * f * f + 0.9375
                } else {
                    let f = t - 2.625 / d1;
                    n1 * f * f + 0.984375
                }
            }
            Self::EaseInOutBounce => {
                if t < 0.5 {
                    0.5 * (1.0 - Self::EaseOutBounce.evaluate(1.0 - 2.0 * t))
                } else {
                    0.5 * (1.0 + Self::EaseOutBounce.evaluate(2.0 * t - 1.0))
                }
            }
            Self::Spring {
                stiffness,
                damping,
                mass,
            } => {
                let omega = (stiffness / mass.max(0.001)).sqrt();
                let zeta = damping / (2.0 * (stiffness * mass.max(0.001)).sqrt());
                let envelope = (-zeta * omega * t).exp();
                1.0 - envelope * ((1.0 - zeta * zeta).max(0.0).sqrt() * omega * t).cos()
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_endpoints() {
        let easings = [
            Easing::Linear,
            Easing::EaseInQuad,
            Easing::EaseOutCubic,
            Easing::EaseInOutSine,
            Easing::EaseOutBounce,
            Easing::EaseOutElastic,
        ];
        for e in &easings {
            assert!((e.evaluate(0.0)).abs() < 1e-4);
            assert!((e.evaluate(1.0) - 1.0).abs() < 1e-4);
        }
    }
}
