use crate::{Specification, TemporaryGrant};

use super::HasPermission;

impl Specification<TemporaryGrant> for HasPermission {
    fn is_satisfied_by(&self, temporary_grant: &TemporaryGrant) -> bool {
        temporary_grant.has_permission(&self.resource, &self.action)
    }
}
