use domain::Email;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CreateInviteCommand {
    pub email: Email,
    pub role_slug: String,
    pub invited_by_id: String,
    pub invited_by_email: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AcceptInviteCommand {
    pub token: String,
    pub name: String,
    pub password: String,
}
