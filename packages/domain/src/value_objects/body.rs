use std::{ops::Deref, str::FromStr};

use crate::{error::DomainResult, DomainError, SharedStr};

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct Body(SharedStr);

impl Body {
    pub fn new(body: &str) -> DomainResult<Self> {
        let body = body.trim();

        if body.len() < 3 {
            return Err(DomainError::ValidationError(
                "Body must be at least 3 characters".into(),
            ));
        }

        Ok(Self(body.into()))
    }
    pub fn body(&self) -> &str {
        &self.0
    }
}

impl Deref for Body {
    type Target = str;

    fn deref(&self) -> &Self::Target {
        &self.0
    }
}

impl std::fmt::Display for Body {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.0)
    }
}

impl FromStr for Body {
    type Err = DomainError;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        Self::new(s)
    }
}
