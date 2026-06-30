use domain::{DateTime, Email};

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct RoleInviteView {
    pub token: Option<String>,
    pub email: Option<Email>,
    pub role_slug: Option<String>,
    pub role_display: Option<String>,
    pub invited_by_email: Option<String>,
    pub status: Option<String>,
    pub expires_at: Option<DateTime>,
    pub accepted_at: Option<DateTime>,
    pub created_at: Option<DateTime>,
}
