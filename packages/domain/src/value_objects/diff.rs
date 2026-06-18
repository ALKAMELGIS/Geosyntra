use std::{ops::Deref, str::FromStr};

use crate::{DomainError, SharedStr};

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct Diff(SharedStr);

impl Diff {
    pub fn new(diff: &str) -> Self {
        Self(diff.into())
    }
    pub fn diff(&self) -> &str {
        &self.0
    }
}

impl Deref for Diff {
    type Target = str;

    fn deref(&self) -> &Self::Target {
        &self.0
    }
}

impl std::fmt::Display for Diff {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.0)
    }
}

impl FromStr for Diff {
    type Err = DomainError;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        Ok(Self::new(s))
    }
}
