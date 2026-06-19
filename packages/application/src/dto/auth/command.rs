use domain::Email;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct LoginCommand {
    pub email: Email,
    pub password: String,
    pub remember: bool,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RegisterCommand {
    pub name: String,
    pub email: Email,
    pub password: String,
    pub requested_role: Option<String>,
    pub requested_plan: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct UpsertOAuthCommand {
    pub email: Email,
    pub name: String,
    pub provider: String,
    pub sub: String,
    pub remember: bool,
}
