use std::{
    ops::Deref,
    str::FromStr,
};

use crate::{error::DomainResult, DomainError, SharedStr};

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct Bio(SharedStr);

impl Bio {
    pub fn new(bio: &str) -> DomainResult<Self> {
        let bio = bio.trim();

        if bio.len() < 3 {
            return Err(DomainError::ValidationError(
                "Bio must be at least 3 characters".into(),
            ));
        }

        if bio.len() > 160 {
            return Err(DomainError::ValidationError(
                "bio must be less than 160 characters".into(),
            ));
        }

        Ok(Self(bio.into()))
    }
    pub fn bio(&self) -> &str {
        &self.0
    }
}

impl Deref for Bio {
    type Target = str;

    fn deref(&self) -> &Self::Target {
        &self.0
    }
}

impl std::fmt::Display for Bio {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.0)
    }
}

impl FromStr for Bio {
    type Err = DomainError;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        Self::new(s)
    }
}
