use std::{fmt, str::FromStr};

use crate::{error::DomainResult, DomainError, SharedStr};

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Password {
    Hashed(HashedPassword),
    NoneHashed(NoneHashedPassword),
}

impl fmt::Display for Password {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Password::Hashed(hashed_password) => write!(f, "{}", hashed_password),
            Password::NoneHashed(none_hashed_password) => write!(f, "{}", none_hashed_password),
        }
    }
}

impl Default for Password {
    fn default() -> Self {
        Password::NoneHashed(NoneHashedPassword::default())
    }
}

#[derive(Debug, Default, Clone, PartialEq, Eq)]
pub struct NoneHashedPassword(SharedStr);

impl fmt::Display for NoneHashedPassword {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.0)
    }
}

impl NoneHashedPassword {
    pub fn new(password: &str) -> DomainResult<Self> {
        if password.len() < 8 {
            return Err(DomainError::ValidationError(
                "Password must be at least 8 characters".into(),
            ));
        }

        if password.len() > 100 {
            return Err(DomainError::ValidationError("Password too long".into()));
        }

        // Check for common passwords in real implementation
        Ok(Self(password.into()))
    }

    pub fn none_hashed_password(&self) -> &str {
        &self.0
    }
}

impl FromStr for NoneHashedPassword {
    type Err = DomainError;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        Self::new(s)
    }
}

#[derive(Debug, Default, Clone, PartialEq, Eq)]
pub struct HashedPassword(SharedStr);

impl fmt::Display for HashedPassword {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.0)
    }
}

impl HashedPassword {
    pub fn new(hashed_password: &str) -> DomainResult<Self> {
        if hashed_password.len() < 43 || hashed_password.len() > 128 {
            return Err(DomainError::ValidationError(
                "Its not Hashed Password".into(),
            ));
        }

        // Check for common passwords in real implementation
        Ok(Self(hashed_password.into()))
    }

    pub fn hashed_password(&self) -> &str {
        &self.0
    }
}

impl FromStr for HashedPassword {
    type Err = DomainError;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        Self::new(s)
    }
}
