use domain::{Email, UserId};

/// Public auth user shape — mirrors Express `toPublicAuthUser`.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct PublicUserView {
    pub id: Option<UserId>,
    pub email: Option<Email>,
    pub name: Option<String>,
    pub role: Option<String>,
    pub role_slug: Option<String>,
    pub status: Option<String>,
    pub tenant_id: Option<String>,
    pub permissions: Vec<String>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct AuthSessionView {
    pub user: PublicUserView,
    pub access_token: Option<String>,
    pub refresh_token: Option<String>,
}
