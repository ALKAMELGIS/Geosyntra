use std::{ops::Deref, str::FromStr};

use crate::{error::DomainResult, DomainError, SharedStr};

/// Display name (3–30 chars, same charset rules as username).
///
/// ```
/// use domain::Name;
///
/// let name = Name::new("GeoSyntra").unwrap();
/// assert_eq!(name.name(), "GeoSyntra");
/// ```
#[derive(Debug, Clone, Default, PartialEq, Eq, Hash)]
pub struct Name(SharedStr);

impl Name {
    pub fn new(name: &str) -> DomainResult<Self> {
        let name = name.trim();

        if name.len() < 3 {
            return Err(DomainError::ValidationError(
                "Name must be at least 3 characters".into(),
            ));
        }

        if name.len() > 30 {
            return Err(DomainError::ValidationError(
                "Name must be less than 30 characters".into(),
            ));
        }

        if !name
            .chars()
            .all(|c| c.is_alphanumeric() || c == '_' || c == '-')
        {
            return Err(DomainError::ValidationError(
                "Name can only contain alphanumeric characters, underscores, and hyphens".into(),
            ));
        }

        if name.starts_with('_') || name.starts_with('-') {
            return Err(DomainError::ValidationError(
                "Name cannot start with underscore or hyphen".into(),
            ));
        }

        Ok(Self(name.into()))
    }

    pub fn name(&self) -> &str {
        &self.0
    }
}

impl Deref for Name {
    type Target = str;

    fn deref(&self) -> &Self::Target {
        &self.0
    }
}

impl std::fmt::Display for Name {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.0)
    }
}

impl FromStr for Name {
    type Err = DomainError;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        Self::new(s)
    }
}
