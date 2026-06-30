use std::{ops::Deref, str::FromStr};

use crate::{error::DomainResult, DomainError, SharedStr};

#[derive(Debug, Clone, Default, Hash, PartialEq, Eq)]
pub struct Comment(SharedStr);

impl Comment {
    pub fn new(comment: &str) -> DomainResult<Self> {
        let comment = comment.trim();

        if comment.len() < 3 {
            return Err(DomainError::ValidationError(
                "Comment must be at least 3 characters".into(),
            ));
        }

        Ok(Self(comment.into()))
    }
    pub fn comment(&self) -> &str {
        &self.0
    }
}

impl Deref for Comment {
    type Target = str;

    fn deref(&self) -> &Self::Target {
        &self.0
    }
}

impl std::fmt::Display for Comment {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.0)
    }
}

impl FromStr for Comment {
    type Err = DomainError;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        Self::new(s)
    }
}
