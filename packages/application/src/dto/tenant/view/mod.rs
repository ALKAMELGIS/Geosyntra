pub mod config;
pub mod environment;
pub mod membership;
pub mod temporary_grant;
use config::TenantConfigView;
use domain::TenantId;
pub use membership::MembershipView;
pub use temporary_grant::TemporaryGrantView;

use domain::{DateTime, Description, Name};

#[derive(Debug, Clone)]
pub struct TenantView {
    pub id: Option<TenantId>,
    pub name: Option<Name>,
    pub description: Option<Description>,
    pub created_at: Option<DateTime>,
    pub config: Option<TenantConfigView>,
    pub version: Option<u64>,
    pub is_platform_tenant: Option<bool>,
}
