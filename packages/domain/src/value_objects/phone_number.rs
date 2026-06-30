use std::{
    collections::HashSet,
    ops::Deref,
};

use crate::{error::DomainResult, DomainError, SharedStr};

use super::Title;

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct PhoneNumbers(HashSet<PhoneNumber>);

impl PhoneNumbers {
    pub fn new() -> Self {
        PhoneNumbers(HashSet::new())
    }

    pub fn add_phone_numbers(&mut self, phone_numbers: Self) {
        self.0.extend(phone_numbers.0);
    }

    pub fn add_phone_number(&mut self, phone_number: PhoneNumber) {
        self.0.insert(phone_number);
    }

    pub fn phone_numbers(&self) -> &HashSet<PhoneNumber> {
        &self.0
    }
}

impl Deref for PhoneNumbers {
    type Target = HashSet<PhoneNumber>;

    fn deref(&self) -> &Self::Target {
        &self.0
    }
}

// More value objects...
#[derive(Debug, Clone, Hash, PartialEq, Eq)]
pub struct PhoneNumber {
    title: Title,
    number: SharedStr,
}

impl PhoneNumber {
    pub fn new(title: &str, number: &str) -> DomainResult<Self> {
        let cleaned: SharedStr = number
            .chars()
            .filter(|c| c.is_ascii_digit())
            .collect::<String>()
            .into();

        if cleaned.len() < 10 || cleaned.len() > 15 {
            return Err(DomainError::ValidationError(
                "Invalid phone number length".into(),
            ));
        }

        if title.len() > 15 {
            return Err(DomainError::ValidationError(
                "Invalid title for phone number length".into(),
            ));
        }

        Ok(Self {
            title: Title::new(title)?,
            number: cleaned,
        })
    }
    pub fn title(&self) -> &Title {
        &self.title
    }
    pub fn number(&self) -> &str {
        &self.number
    }
}

impl std::fmt::Display for PhoneNumber {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}: {}", self.title, self.number)
    }
}
