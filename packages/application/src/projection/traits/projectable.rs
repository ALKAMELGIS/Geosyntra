use super::relation::Relation;
use domain::traits::field::Field;

pub trait Projectable {
    type Field: Field;
    type Relation: Relation;
}
