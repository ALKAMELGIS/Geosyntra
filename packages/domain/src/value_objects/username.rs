use std::ops::Deref;

use crate::{error::DomainResult, DomainError, SharedStr};

/// Username (3–30 chars, alphanumeric with `_` or `-`).
///
/// ```
/// use domain::Username;
///
/// let username = Username::new("ops_user").unwrap();
/// assert_eq!(username.username(), "ops_user");
/// assert!(Username::new("ab").is_err());
/// ```
#[derive(Debug, Clone, Default, PartialEq, Eq, Hash)]
pub struct Username(SharedStr);

impl Username {
    pub fn new(username: &str) -> DomainResult<Self> {
        let username = username.trim();

        if username.len() < 3 {
            return Err(DomainError::ValidationError(
                "Username must be at least 3 characters".into(),
            ));
        }

        if username.len() > 30 {
            return Err(DomainError::ValidationError(
                "Username must be less than 30 characters".into(),
            ));
        }

        if !username
            .chars()
            .all(|c| c.is_alphanumeric() || c == '_' || c == '-')
        {
            return Err(DomainError::ValidationError(
                "Username can only contain alphanumeric characters, underscores, and hyphens"
                    .into(),
            ));
        }

        if username.starts_with('_') || username.starts_with('-') {
            return Err(DomainError::ValidationError(
                "Username cannot start with underscore or hyphen".into(),
            ));
        }

        Ok(Self(username.into()))
    }

    pub fn username(&self) -> &str {
        &self.0
    }
}

impl Deref for Username {
    type Target = str;

    fn deref(&self) -> &Self::Target {
        &self.0
    }
}

impl std::fmt::Display for Username {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.0)
    }
}

impl std::str::FromStr for Username {
    type Err = DomainError;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        Self::new(s)
    }
}
