pub trait ProjectionVisitor {
    fn enter_entity(&mut self, entity: &str);
    fn visit_field(&mut self, field: &str);
    fn enter_relation(&mut self, relation: &str);
    fn exit_relation(&mut self);
    fn exit_entity(&mut self);
}
