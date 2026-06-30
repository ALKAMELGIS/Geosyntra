use crate::traits::field::Field;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum RoleField {
    Id,
    Name,
    Description,
    Permissions(crate::permissions::fields::PermissionField),
    IsSystemRole,
    CreatedAt,
    Version,
}

impl Field for RoleField {
    fn name(&self) -> &'static str {
        match self {
            RoleField::Id => "id",
            RoleField::Name => "name",
            RoleField::Description => "description",
            RoleField::Permissions(_) => "permissions",
            RoleField::IsSystemRole => "is_system_role",
            RoleField::CreatedAt => "created_at",
            RoleField::Version => "version",
        }
    }
}
