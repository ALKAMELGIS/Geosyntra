pub mod config;
pub mod environment;
use config::TenantConfigField;

#[derive(Debug, Clone)]
pub enum TenantField {
    Id,
    Name,
    Description,
    CreatedAt,
    Config(TenantConfigField),
    Version,
}
