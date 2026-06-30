use domain::traits::field::Field;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum PublicUserField {
    Id,
    Email,
    Name,
    Role,
    RoleSlug,
    Status,
}

impl Field for PublicUserField {
    fn name(&self) -> &'static str {
        match self {
            Self::Id => "id",
            Self::Email => "email",
            Self::Name => "name",
            Self::Role => "role",
            Self::RoleSlug => "role_slug",
            Self::Status => "status",
        }
    }
}
