pub mod config;
pub mod environment;
pub mod fields;

use config::TenantConfig;

use crate::{DateTime, Description, Event, Name};

#[derive(Debug, Clone, Default, PartialEq, Eq, Hash)]
pub struct TenantId(String);

impl TenantId {
    pub fn new(id: &str) -> Self {
        Self(id.into())
    }
    pub fn id(&self) -> &str {
        &self.0
    }

    pub fn as_str(&self) -> &str {
        &self.0
    }
}

impl std::ops::Deref for TenantId {
    type Target = str;

    fn deref(&self) -> &Self::Target {
        &self.0
    }
}

impl std::fmt::Display for TenantId {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.0)
    }
}

#[derive(Debug, Clone)]
pub struct Tenant {
    id: TenantId,
    name: Name,
    description: Description,
    created_at: DateTime,
    config: TenantConfig,
    version: u64,
}

#[derive(Debug, Clone)]
pub struct TenantParts {
    pub id: TenantId,
    pub name: Name,
    pub description: Description,
    pub created_at: DateTime,
    pub config: TenantConfig,
    pub version: u64,
}

impl Tenant {
    pub fn new(
        id: TenantId,
        name: Name,
        description: Description,
        created_at: DateTime,
        config: TenantConfig,
        version: u64,
    ) -> Self {
        Self {
            id,
            name,
            description,
            created_at,
            config,
            version,
        }
    }

    pub fn into_parts(self) -> TenantParts {
        let Self {
            id,
            name,
            description,
            created_at,
            config,
            version,
        } = self;
        TenantParts {
            id,
            name,
            description,
            created_at,
            config,
            version,
        }
    }

    pub fn id(&self) -> &TenantId {
        &self.id
    }

    pub fn name(&self) -> &Name {
        &self.name
    }
    pub fn description(&self) -> &Description {
        &self.description
    }

    pub fn created_at(&self) -> &DateTime {
        &self.created_at
    }
    pub fn config(&self) -> &TenantConfig {
        &self.config
    }

    pub fn version(&self) -> &u64 {
        &self.version
    }
}

impl Event for Tenant {
    fn get_type(&self) -> &str {
        "TENANT"
    }
}
