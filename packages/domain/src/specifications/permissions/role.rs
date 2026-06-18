use crate::{Role, Specification};

use super::HasPermission;

impl Specification<Role> for HasPermission {
    fn is_satisfied_by(&self, role: &Role) -> bool {
        role.has_permission(&self.resource, &self.action)
    }
}
