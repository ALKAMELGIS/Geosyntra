use crate::projection::visitor::ProjectionVisitor;

pub trait ProjectionNode: Send + Sync {
    fn accept(&self, visitor: &mut dyn ProjectionVisitor);
}
