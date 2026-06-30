use std::ops::Deref;

use crate::{error::DomainResult, DomainError, SharedStr};

#[derive(Debug, Default, Clone, PartialEq, Eq, Hash)]
pub struct Title(SharedStr);

impl Title {
    pub fn new(title: &str) -> DomainResult<Self> {
        let title = title.trim();

        if title.len() < 3 {
            return Err(DomainError::ValidationError(
                "Title must be at least 3 characters".into(),
            ));
        }

        if title.len() > 30 {
            return Err(DomainError::ValidationError(
                "Title must be less than 30 characters".into(),
            ));
        }

        if !title
            .chars()
            .all(|c| c.is_alphanumeric() || c == '_' || c == '-')
        {
            return Err(DomainError::ValidationError(
                "Title can only contain alphanumeric characters, underscores, and hyphens".into(),
            ));
        }

        if title.starts_with('_') || title.starts_with('-') {
            return Err(DomainError::ValidationError(
                "Title cannot start with underscore or hyphen".into(),
            ));
        }

        Ok(Self(title.into()))
    }

    pub fn title(&self) -> &str {
        &self.0
    }
}

impl Deref for Title {
    type Target = str;

    fn deref(&self) -> &Self::Target {
        &self.0
    }
}

impl std::fmt::Display for Title {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.0)
    }
}

impl std::str::FromStr for Title {
    type Err = DomainError;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        Self::new(s)
    }
}
