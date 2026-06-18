use std::{ops::Deref, str::FromStr};

use crate::{error::DomainResult, DomainError, SharedStr};

/// RBAC resource identifier (e.g. `users`, `aoi`).
///
/// ```
/// use domain::Resource;
///
/// let resource = Resource::new("users").unwrap();
/// assert_eq!(resource.resource(), "users");
/// ```
#[derive(Debug, Clone, Default, PartialEq, Eq, Hash)]
pub struct Resource(SharedStr);

impl Resource {
    pub fn new(resource: &str) -> DomainResult<Self> {
        let resource = resource.trim();

        if resource.len() < 3 {
            return Err(DomainError::ValidationError(
                "Resource must be at least 3 characters".into(),
            ));
        }

        if resource.len() > 30 {
            return Err(DomainError::ValidationError(
                "Resource must be less than 30 characters".into(),
            ));
        }

        if resource.contains('.') {
            return Err(DomainError::ValidationError(
                "Resource cannot contain dots".into(),
            ));
        }

        if !resource
            .chars()
            .all(|c| c.is_alphanumeric() || c == '_' || c == '-')
        {
            return Err(DomainError::ValidationError(
                "Resource can only contain alphanumeric characters, underscores, and hyphens"
                    .into(),
            ));
        }

        if resource.starts_with('_') || resource.starts_with('-') {
            return Err(DomainError::ValidationError(
                "Resource cannot start with underscore or hyphen".into(),
            ));
        }

        Ok(Self(resource.into()))
    }

    pub fn resource(&self) -> &str {
        &self.0
    }
}

impl Deref for Resource {
    type Target = str;

    fn deref(&self) -> &Self::Target {
        &self.0
    }
}

impl std::fmt::Display for Resource {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.0)
    }
}

impl FromStr for Resource {
    type Err = DomainError;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        Self::new(s)
    }
}
