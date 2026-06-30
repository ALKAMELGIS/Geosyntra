use crate::traits::field::Field;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum PermissionField {
    Id,
    Resource,
    Action,
    Description,
    CreatedAt,
    Version,
}

impl Field for PermissionField {
    fn name(&self) -> &'static str {
        match self {
            PermissionField::Id => "id",
            PermissionField::Resource => "resource",
            PermissionField::Action => "action",
            PermissionField::Description => "description",
            PermissionField::CreatedAt => "created_at",
            PermissionField::Version => "version",
        }
    }
}
