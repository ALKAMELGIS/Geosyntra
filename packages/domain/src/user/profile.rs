use crate::{
    error::DomainResult,
    value_objects::{phone_number::PhoneNumbers, Addresses, Bio, DateTime, Url},
    Address, DomainError, Name, Password, PhoneNumber,
};

#[derive(Debug, Clone, Default)]
pub struct UserProfile {
    first_name: Name,
    last_name: Name,
    password: Password,
    bio: Option<Bio>,
    phone_numbers: PhoneNumbers,
    avatar_url: Option<Url>,
    date_of_birth: Option<DateTime>,
    addresses: Addresses,
    website: Option<Url>,
    is_deleted: bool,
    created_at: DateTime,
    updated_at: DateTime,
}

#[derive(Debug, Clone, Default)]
pub struct UserProfileParts {
    pub first_name: Name,
    pub last_name: Name,
    pub password: Password,
    pub bio: Option<Bio>,
    pub phone_numbers: PhoneNumbers,
    pub avatar_url: Option<Url>,
    pub date_of_birth: Option<DateTime>,
    pub addresses: Addresses,
    pub website: Option<Url>,
    pub is_deleted: bool,
    pub created_at: DateTime,
    pub updated_at: DateTime,
}

impl UserProfile {
    pub fn new() -> UserProfileBuilder {
        UserProfileBuilder::new()
    }
    // into parts
    pub fn into_parts(self) -> UserProfileParts {
        let Self {
            first_name,
            last_name,
            password,
            bio,
            phone_numbers,
            avatar_url,
            date_of_birth,
            addresses,
            website,
            is_deleted,
            created_at,
            updated_at,
        } = self;
        UserProfileParts {
            first_name,
            last_name,
            password,
            bio,
            phone_numbers,
            avatar_url,
            date_of_birth,
            addresses,
            website,
            is_deleted,
            created_at,
            updated_at,
        }
    }
    pub fn first_name(&self) -> &Name {
        &self.first_name
    }
    pub fn last_name(&self) -> &Name {
        &self.last_name
    }
    pub fn password(&self) -> &Password {
        &self.password
    }
    pub fn bio(&self) -> &Option<Bio> {
        &self.bio
    }
    pub fn phone_numbers(&self) -> &PhoneNumbers {
        &self.phone_numbers
    }
    pub fn avatar_url(&self) -> &Option<Url> {
        &self.avatar_url
    }
    pub fn date_of_birth(&self) -> &Option<DateTime> {
        &self.date_of_birth
    }
    pub fn addresses(&self) -> &Addresses {
        &self.addresses
    }
    pub fn website(&self) -> &Option<Url> {
        &self.website
    }
    pub fn is_deleted(&self) -> bool {
        self.is_deleted
    }
    pub fn created_at(&self) -> &DateTime {
        &self.created_at
    }

    pub fn updated_at(&self) -> &DateTime {
        &self.updated_at
    }
}

#[derive(Debug, Clone)]
pub struct UserProfileBuilder {
    first_name: Option<Name>,
    last_name: Option<Name>,
    password: Option<Password>,
    bio: Option<Bio>,
    avatar_url: Option<Url>,
    date_of_birth: Option<DateTime>,
    addresses: Addresses,
    website: Option<Url>,
    is_deleted: bool,
    phone_numbers: PhoneNumbers,
}

impl Default for UserProfileBuilder {
    fn default() -> Self {
        Self::new()
    }
}

impl UserProfileBuilder {
    pub fn new() -> Self {
        Self {
            first_name: None,
            last_name: None,
            password: None,
            bio: None,
            avatar_url: None,
            date_of_birth: None,
            addresses: Addresses::new(),
            website: None,
            is_deleted: false,
            phone_numbers: PhoneNumbers::new(),
        }
    }

    pub fn set_first_name(&mut self, name: Name) -> &mut Self {
        self.first_name = Some(name);
        self
    }

    pub fn set_is_deleted(&mut self, is_deleted: bool) -> &mut Self {
        self.is_deleted = is_deleted;
        self
    }

    pub fn set_last_name(&mut self, name: Name) -> &mut Self {
        self.last_name = Some(name);
        self
    }

    pub fn set_password(&mut self, password: Password) -> &mut Self {
        self.password = Some(password);
        self
    }

    pub fn set_bio(&mut self, bio: Bio) -> &mut Self {
        self.bio = Some(bio);
        self
    }
    pub fn set_website(&mut self, url: Url) -> &mut Self {
        self.website = Some(url);
        self
    }

    pub fn set_avatar_url(&mut self, url: Url) -> &mut Self {
        self.avatar_url = Some(url);
        self
    }

    pub fn set_date_of_birth(&mut self, date: DateTime) -> &mut Self {
        self.date_of_birth = Some(date);
        self
    }

    pub fn add_address(&mut self, address: Address) -> &mut Self {
        self.addresses.add_address(address);
        self
    }

    pub fn add_phone_number(&mut self, phone_number: PhoneNumber) -> &mut Self {
        self.phone_numbers.add_phone_number(phone_number);
        self
    }

    pub fn add_addresses(&mut self, addresses: Addresses) -> &mut Self {
        self.addresses.add_addresses(addresses);
        self
    }

    pub fn add_phone_numbers(&mut self, phone_numbers: PhoneNumbers) -> &mut Self {
        self.phone_numbers.add_phone_numbers(phone_numbers);
        self
    }

    pub fn build(self, created_at: DateTime, updated_at: DateTime) -> DomainResult<UserProfile> {
        Ok(UserProfile {
            first_name: self
                .first_name
                .ok_or(DomainError::ValidationError("First name is required".into()))?,
            last_name: self
                .last_name
                .ok_or(DomainError::ValidationError("Last name is required".into()))?,
            password: self
                .password
                .ok_or(DomainError::ValidationError("Password is required".into()))?,
            bio: self.bio,
            phone_numbers: self.phone_numbers,
            avatar_url: self.avatar_url,
            date_of_birth: self.date_of_birth,
            addresses: self.addresses,
            website: self.website,
            is_deleted: self.is_deleted,
            created_at,
            updated_at,
        })
    }
}
