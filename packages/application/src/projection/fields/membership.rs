use domain::traits::field::Field;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum MembershipField {
    UserId,
    TenantId,
    Roles,
    CreatedAt,
    Version,
}

impl Field for MembershipField {
    fn name(&self) -> &'static str {
        match self {
            MembershipField::UserId => "user_id",
            MembershipField::TenantId => "tenant_id",
            MembershipField::Roles => "roles",
            MembershipField::CreatedAt => "created_at",
            MembershipField::Version => "version",
        }
    }
}
