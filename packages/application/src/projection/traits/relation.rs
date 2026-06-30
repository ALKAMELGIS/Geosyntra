use super::projectable::Projectable;
use std::hash::Hash;

pub trait Relation: Copy + Eq + Send + Sync + Hash + 'static {
    type Target: Projectable;

    fn name(&self) -> &'static str;
}
