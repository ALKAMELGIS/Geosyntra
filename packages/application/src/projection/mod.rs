pub mod fields;
pub mod membership_projector;
pub mod projection_any;
pub mod public_user_projector;
pub mod role_projector;
pub mod traits;
pub mod user_projector;
pub mod visitor;

pub use membership_projector::MembershipProjector;
pub use public_user_projector::PublicUserProjector;
pub use role_projector::RoleProjector;
pub use user_projector::UserProjector;

use std::collections::HashMap;

use domain::traits::field::Field;
use projection_any::ProjectionAny;
use traits::{node::ProjectionNode, projectable::Projectable, relation::Relation};
use visitor::ProjectionVisitor;

pub struct Projection<E: Projectable> {
    fields: Vec<E::Field>,
    relations: HashMap<E::Relation, ProjectionAny>,
}

impl<P: Projectable> ProjectionNode for Projection<P> {
    fn accept(&self, visitor: &mut dyn ProjectionVisitor) {
        visitor.enter_entity(std::any::type_name::<P>());

        for f in &self.fields {
            visitor.visit_field(f.name());
        }

        for (rel, proj) in &self.relations {
            visitor.enter_relation(rel.name());
            proj.accept(visitor);
            visitor.exit_relation();
        }

        visitor.exit_entity();
    }
}

impl<P: Projectable> Projection<P> {
    pub fn new() -> Self {
        Self {
            fields: vec![],
            relations: HashMap::new(),
        }
    }

    pub fn include(mut self, field: P::Field) -> Self {
        self.fields.push(field);
        self
    }

    pub fn with<R>(mut self, relation: P::Relation, projection: Projection<R::Target>) -> Self
    where
        P::Relation: Relation<Target = R::Target>,
        R: Relation,
    {
        self.relations
            .insert(relation, ProjectionAny::new(projection));

        self
    }
}
