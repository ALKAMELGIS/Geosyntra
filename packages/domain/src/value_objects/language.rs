use std::{ops::Deref, str::FromStr};

use crate::{error::DomainResult, DomainError, SharedStr};

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct Language(SharedStr);

impl Language {
    pub fn new(language: &str) -> DomainResult<Self> {
        let language = language.trim();

        if language.len() < 3 {
            return Err(DomainError::ValidationError(
                "Language must be at least 3 characters".into(),
            ));
        }

        Ok(Self(language.into()))
    }
    pub fn language(&self) -> &str {
        &self.0
    }
}

impl Deref for Language {
    type Target = str;

    fn deref(&self) -> &Self::Target {
        &self.0
    }
}

impl std::fmt::Display for Language {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.0)
    }
}

impl FromStr for Language {
    type Err = DomainError;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        Self::new(s)
    }
}
