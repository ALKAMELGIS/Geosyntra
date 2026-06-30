use std::collections::HashSet;

use domain::traits::field::Field;

#[derive(Clone)]
pub struct AccessControl<T: Field> {
    pub can_read: bool,
    pub readable_fields: HashSet<T>,
    pub writable_fields: HashSet<T>,
}

impl<T: Field> AccessControl<T> {
    pub fn new(can_read: bool, readable_fields: HashSet<T>, writable_fields: HashSet<T>) -> Self {
        Self {
            can_read,
            readable_fields,
            writable_fields,
        }
    }
}
