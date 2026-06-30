use crate::value_objects::Language;

#[derive(Debug, Clone)]
pub struct UserPreferences {
    email_notifications: bool,
    push_notifications: bool,
    two_factor_auth: bool,
    language: Language,
}
#[derive(Debug, Clone)]
pub struct UserPreferencesParts {
    pub email_notifications: bool,
    pub push_notifications: bool,
    pub two_factor_auth: bool,
    pub language: Language,
}

impl UserPreferences {
    pub fn new(
        email_notifications: bool,
        push_notifications: bool,
        two_factor_auth: bool,
        language: Language,
    ) -> Self {
        Self {
            email_notifications,
            push_notifications,
            two_factor_auth,
            language,
        }
    }
    // into parts
    pub fn into_parts(self) -> UserPreferencesParts {
        let Self {
            email_notifications,
            push_notifications,
            two_factor_auth,
            language,
        } = self;
        UserPreferencesParts {
            email_notifications,
            push_notifications,
            two_factor_auth,
            language,
        }
    }
    pub fn email_notifications(&self) -> bool {
        self.email_notifications
    }

    pub fn push_notifications(&self) -> bool {
        self.push_notifications
    }

    pub fn two_factor_auth(&self) -> bool {
        self.two_factor_auth
    }

    pub fn language(&self) -> &Language {
        &self.language
    }
}

impl Default for UserPreferences {
    fn default() -> Self {
        Self {
            email_notifications: true,
            push_notifications: true,
            two_factor_auth: false,
            language: Language::new("english").unwrap(),
        }
    }
}
