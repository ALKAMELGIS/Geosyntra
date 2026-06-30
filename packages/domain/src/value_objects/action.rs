use std::{
    ops::Deref,
    str::FromStr,
};

use crate::{error::DomainResult, DomainError, SharedStr};

/// RBAC action identifier (e.g. `read`, `write`).
///
/// ```
/// use domain::Action;
///
/// let action = Action::new("read").unwrap();
/// assert_eq!(action.action(), "read");
/// ```
#[derive(Debug, Clone, Default, PartialEq, Eq, Hash)]
pub struct Action(SharedStr);

impl Action {
    pub fn new(action: &str) -> DomainResult<Self> {
        let action = action.trim();

        if action.len() < 3 {
            return Err(DomainError::ValidationError(
                "Action must be at least 3 characters".into(),
            ));
        }

        if action.len() > 30 {
            return Err(DomainError::ValidationError(
                "Action must be less than 30 characters".into(),
            ));
        }

        if !action
            .chars()
            .all(|c| c.is_alphanumeric() || c == '_' || c == '-')
        {
            return Err(DomainError::ValidationError(
                "Action can only contain alphanumeric characters, underscores, and hyphens".into(),
            ));
        }

        if action.starts_with('_') || action.starts_with('-') {
            return Err(DomainError::ValidationError(
                "Action cannot start with underscore or hyphen".into(),
            ));
        }

        Ok(Self(action.into()))
    }

    pub fn action(&self) -> &str {
        &self.0
    }
}

impl Deref for Action {
    type Target = str;

    fn deref(&self) -> &Self::Target {
        &self.0
    }
}

impl std::fmt::Display for Action {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.0)
    }
}

impl FromStr for Action {
    type Err = DomainError;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        Self::new(s)
    }
}
