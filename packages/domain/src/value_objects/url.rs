use std::{
    borrow::Cow,
    ops::Deref,
};

use crate::{error::DomainResult, DomainError, SharedStr};

#[derive(Debug, Clone, Default, PartialEq, Eq, Hash)]
pub struct Url(SharedStr);

impl Url {
    pub fn new(url: &str) -> DomainResult<Self> {
        let url = url.trim();

        // Empty check
        if url.is_empty() {
            return Err(DomainError::ValidationError("URL cannot be empty".into()));
        }

        // Add default scheme if none present
        let raw = if url.contains("://") {
            Cow::Borrowed(url)
        } else {
            Cow::Owned(format!("https://{}", url))
        };

        Ok(Self(raw.into()))
    }

    pub fn url(&self) -> &str {
        &self.0
    }
}

impl Deref for Url {
    type Target = str;

    fn deref(&self) -> &Self::Target {
        &self.0
    }
}

impl std::fmt::Display for Url {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.0)
    }
}

impl std::str::FromStr for Url {
    type Err = DomainError;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        Self::new(s)
    }
}
