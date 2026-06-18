//! Typed sort keys for repository queries (replaces string `SortBy` SQL building).

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SortOrder {
    Asc,
    Desc,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum UserSortField {
    Id,
    Email,
    Username,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct UserSortBy {
    pub field: UserSortField,
    pub order: SortOrder,
}

impl UserSortBy {
    pub fn ascending(field: UserSortField) -> Self {
        Self {
            field,
            order: SortOrder::Asc,
        }
    }

    pub fn descending(field: UserSortField) -> Self {
        Self {
            field,
            order: SortOrder::Desc,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RoleSortField {
    Id,
    Name,
    CreatedAt,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct RoleSortBy {
    pub field: RoleSortField,
    pub order: SortOrder,
}

impl RoleSortBy {
    pub fn ascending(field: RoleSortField) -> Self {
        Self {
            field,
            order: SortOrder::Asc,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TenantSortField {
    Id,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct TenantSortBy {
    pub field: TenantSortField,
    pub order: SortOrder,
}
