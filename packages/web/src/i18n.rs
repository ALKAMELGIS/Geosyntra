use dioxus::prelude::*;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Default)]
pub enum Language {
    #[default]
    En,
    Ar,
}

impl Language {
    pub fn from_storage() -> Self {
        #[cfg(all(feature = "web", target_arch = "wasm32"))]
        {
            if let Some(window) = web_sys::window() {
                if let Ok(Some(storage)) = window.local_storage() {
                    if let Ok(Some(raw)) = storage.get_item("geosyntra.lang") {
                        if raw == "ar" {
                            return Language::Ar;
                        }
                    }
                }
            }
        }
        Language::En
    }

    pub fn persist(self) {
        #[cfg(all(feature = "web", target_arch = "wasm32"))]
        {
            let value = match self {
                Language::En => "en",
                Language::Ar => "ar",
            };
            if let Some(window) = web_sys::window() {
                if let Ok(Some(storage)) = window.local_storage() {
                    let _ = storage.set_item("geosyntra.lang", value);
                }
            }
        }
    }

    pub fn is_rtl(self) -> bool {
        matches!(self, Language::Ar)
    }
}

pub fn t(lang: Language, en: &str, ar: &str) -> String {
    match lang {
        Language::En => en.to_string(),
        Language::Ar => ar.to_string(),
    }
}

#[derive(Clone, Copy)]
pub struct I18nContext {
    pub language: Signal<Language>,
}

impl I18nContext {
    pub fn provide() -> Self {
        let ctx = Self {
            language: Signal::new(Language::from_storage()),
        };
        use_context_provider(|| ctx);
        ctx
    }

    pub fn use_i18n() -> Self {
        use_context::<I18nContext>()
    }

    pub fn toggle(self) {
        let next = match *self.language.read() {
            Language::En => Language::Ar,
            Language::Ar => Language::En,
        };
        next.persist();
        let mut language = self.language;
        language.set(next);
    }
}

#[component]
pub fn LanguageToggle() -> Element {
    let i18n = I18nContext::use_i18n();
    let label = match *i18n.language.read() {
        Language::En => "العربية",
        Language::Ar => "English",
    };
    rsx! {
        button {
            class: "gs-btn gs-btn--ghost gs-lang-toggle",
            r#type: "button",
            onclick: move |_| i18n.toggle(),
            "{label}"
        }
    }
}
