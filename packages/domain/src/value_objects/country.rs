use std::{
    ops::Deref,
    str::FromStr,
};

use crate::{error::DomainResult, DomainError, SharedStr};

/// Country name (3–60 characters).
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct Country(SharedStr);

impl Country {
    pub fn new(country: &str) -> DomainResult<Self> {
        let country = country.trim();

        if country.len() < 3 {
            return Err(DomainError::ValidationError(
                "Country must be at least 3 characters".into(),
            ));
        }

        if country.len() > 60 {
            return Err(DomainError::ValidationError(
                "Country must be less than 60 characters".into(),
            ));
        }

        Ok(Self(country.into()))
    }

    pub fn country(&self) -> &str {
        &self.0
    }
}

impl Deref for Country {
    type Target = str;

    fn deref(&self) -> &Self::Target {
        &self.0
    }
}

impl std::fmt::Display for Country {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.0)
    }
}

impl FromStr for Country {
    type Err = DomainError;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        Self::new(s)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_too_short_or_long() {
        assert!(Country::new("US").is_err());
        assert!(Country::new(&"x".repeat(61)).is_err());
        assert!(Country::new("USA").is_ok());
    }
}
