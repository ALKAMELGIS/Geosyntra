use super::{traits::node::ProjectionNode, visitor::ProjectionVisitor};

pub struct ProjectionAny {
    inner: Box<dyn ProjectionNode>,
}

impl ProjectionAny {
    pub fn new<P>(projection: P) -> Self
    where
        P: ProjectionNode + 'static,
    {
        Self {
            inner: Box::new(projection),
        }
    }

    pub fn accept(&self, visitor: &mut dyn ProjectionVisitor) {
        self.inner.accept(visitor);
    }
}
