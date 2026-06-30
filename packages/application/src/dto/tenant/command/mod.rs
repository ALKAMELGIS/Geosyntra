pub mod config;
pub mod environment;
pub mod membership;
pub mod temporary_grant;

use config::TenantConfigCommand;
use domain::TenantId;
pub use membership::MembershipCommand;
pub use temporary_grant::TemporaryGrantCommand;

use domain::{DateTime, Description, Name};

#[derive(Debug, Clone)]
pub struct TenantCommand {
    pub id: Option<TenantId>,
    pub name: Option<Name>,
    pub description: Option<Description>,
    pub created_at: Option<DateTime>,
    pub config: Option<TenantConfigCommand>,
    pub version: Option<u64>,
}
