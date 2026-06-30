use crate::value_objects::{Action, Resource};

pub mod role;
pub mod temporary_grant;
pub struct HasPermission {
    pub action: Action,
    pub resource: Resource,
}
