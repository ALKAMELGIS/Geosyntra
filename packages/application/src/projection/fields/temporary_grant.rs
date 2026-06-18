use domain::traits::field::Field;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TemporaryGrantField {
    UserId,
    Description,
    Resource,
    Action,
    ExpiresAt,
    CreatedAt,
    Version,
}

impl Field for TemporaryGrantField {
    fn name(&self) -> &'static str {
        match self {
            TemporaryGrantField::UserId => "user_id",
            TemporaryGrantField::Description => "description",
            TemporaryGrantField::Resource => "resource",
            TemporaryGrantField::Action => "action",
            TemporaryGrantField::ExpiresAt => "expires_at",
            TemporaryGrantField::CreatedAt => "created_at",
            TemporaryGrantField::Version => "version",
        }
    }
}
