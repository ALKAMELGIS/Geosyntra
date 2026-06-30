use std::{ops::Deref, str::FromStr};

use crate::{error::DomainResult, DomainError, SharedStr};

/// Validated email address (lowercased, must contain `@`).
///
/// ```
/// use domain::Email;
///
/// let email = Email::new("User@Example.COM").unwrap();
/// assert_eq!(email.email(), "user@example.com");
/// assert!(Email::new("not-an-email").is_err());
/// ```
#[derive(Debug, Clone, Default, PartialEq, Eq, Hash)]
pub struct Email(SharedStr);

impl Email {
    pub fn new(email: &str) -> DomainResult<Self> {
        let email = email.trim().to_lowercase();

        if email.len() > 254 {
            return Err(DomainError::ValidationError("Email too long".into()));
        }

        if !email.contains('@') {
            return Err(DomainError::ValidationError("Email must contain @".into()));
        }

        Ok(Self(email.into()))
    }

    pub fn email(&self) -> &str {
        &self.0
    }
}

impl Deref for Email {
    type Target = str;

    fn deref(&self) -> &Self::Target {
        &self.0
    }
}

impl std::fmt::Display for Email {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.0)
    }
}

impl FromStr for Email {
    type Err = DomainError;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        Self::new(s)
    }
}
