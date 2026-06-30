//! Timeline crossfade — React `useSiWmsTimelineCrossfade.ts` (Task 32.5c).

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
pub enum TimelineTransitionMode {
    #[default]
    Step,
    Smooth,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct CrossfadeFrame {
    pub from_url: String,
    pub to_url: String,
    pub blend: f64,
}

pub fn crossfade_frames(
    urls: &[String],
    active_index: usize,
    mode: TimelineTransitionMode,
    blend_t: f64,
) -> CrossfadeFrame {
    let idx = active_index.min(urls.len().saturating_sub(1));
    let from = urls.get(idx).cloned().unwrap_or_default();
    let to = urls.get(idx + 1).cloned().unwrap_or_else(|| from.clone());
    let blend = match mode {
        TimelineTransitionMode::Step => 0.0,
        TimelineTransitionMode::Smooth => blend_t.clamp(0.0, 1.0),
    };
    CrossfadeFrame {
        from_url: from,
        to_url: to,
        blend,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn step_mode_zero_blend() {
        let urls = vec!["a".into(), "b".into()];
        let f = crossfade_frames(&urls, 0, TimelineTransitionMode::Step, 0.5);
        assert_eq!(f.blend, 0.0);
    }
}
