use domain::{
    value_objects::{Action, Resource},
    DateTime, Description, UserId,
};

#[derive(Debug, Clone)]
pub struct TemporaryGrantCommand {
    pub user_id: Option<UserId>,
    pub description: Option<Description>,
    pub resource: Option<Resource>,
    pub action: Option<Action>,
    pub expires_at: Option<DateTime>,
    pub created_at: Option<DateTime>,
    pub version: Option<u64>,
}
