use std::{
    collections::HashSet,
    ops::Deref,
};

use crate::{error::DomainResult, DomainError, SharedStr};

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct Addresses(HashSet<Address>);

impl Addresses {
    pub fn new() -> Self {
        Addresses(HashSet::new())
    }

    pub fn add_addresses(&mut self, addresses: Self) {
        self.0.extend(addresses.0);
    }

    pub fn add_address(&mut self, address: Address) {
        self.0.insert(address);
    }

    pub fn addresses(&self) -> &HashSet<Address> {
        &self.0
    }
}

impl Deref for Addresses {
    type Target = HashSet<Address>;

    fn deref(&self) -> &Self::Target {
        &self.0
    }
}

#[derive(Debug, Clone, Hash, PartialEq, Eq)]
pub struct Address {
    title: SharedStr,
    street: SharedStr,
    city: SharedStr,
    state: SharedStr,
    postal_code: SharedStr,
    country: SharedStr,
}

#[derive(Debug, Default, Clone)]
pub struct AddressBuilder {
    title: Option<SharedStr>,
    street: Option<SharedStr>,
    city: Option<SharedStr>,
    state: Option<SharedStr>,
    postal_code: Option<SharedStr>,
    country: Option<SharedStr>,
}

impl Address {
    pub fn new() -> AddressBuilder {
        AddressBuilder::default()
    }

    pub fn title(&self) -> &str {
        &self.title
    }

    pub fn street(&self) -> &str {
        &self.street
    }

    pub fn city(&self) -> &str {
        &self.city
    }

    pub fn state(&self) -> &str {
        &self.state
    }

    pub fn postal_code(&self) -> &str {
        &self.postal_code
    }

    pub fn country(&self) -> &str {
        &self.country
    }
}

impl AddressBuilder {
    pub fn set_title(&mut self, value: &str) -> &mut Self {
        self.title = Some(value.into());
        self
    }

    pub fn set_street(&mut self, value: &str) -> &mut Self {
        self.street = Some(value.into());
        self
    }

    pub fn set_city(&mut self, value: &str) -> &mut Self {
        self.city = Some(value.into());
        self
    }

    pub fn set_state(&mut self, value: &str) -> &mut Self {
        self.state = Some(value.into());
        self
    }

    pub fn set_postal_code(&mut self, value: &str) -> &mut Self {
        self.postal_code = Some(value.into());
        self
    }

    pub fn set_country(&mut self, value: &str) -> &mut Self {
        self.country = Some(value.into());
        self
    }

    pub fn build(self) -> DomainResult<Address> {
        let title = self.title.as_ref().ok_or_else(|| {
            DomainError::ValidationError("Title of address is empty".into())
        })?;
        if title.len() > 60 {
            return Err(DomainError::ValidationError(
                "Title of address must be at most 60 characters".into(),
            ));
        }
        Ok(Address {
            title: title.trim().into(),
            street: self.street.unwrap_or_else(|| "".into()),
            city: self.city.unwrap_or_else(|| "".into()),
            state: self.state.unwrap_or_else(|| "".into()),
            postal_code: self.postal_code.unwrap_or_else(|| "".into()),
            country: self.country.unwrap_or_else(|| "".into()),
        })
    }
}
