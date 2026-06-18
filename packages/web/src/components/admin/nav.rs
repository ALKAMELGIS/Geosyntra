use dioxus::prelude::*;

#[derive(Clone, Copy)]
pub struct AdminNav {
    pub refresh_badge: EventHandler<()>,
}

impl AdminNav {
    pub fn use_nav() -> Self {
        use_context::<AdminNav>()
    }
}
