use std::{
    collections::HashSet,
    ops::Deref,
};

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct AuthorizationRelations(HashSet<AuthorizationRelation>);

impl AuthorizationRelations {
    pub fn new() -> Self {
        AuthorizationRelations(HashSet::new())
    }

    pub fn add_relations(&mut self, relations: Self) {
        self.0.extend(relations.0);
    }

    pub fn add_relation(&mut self, relation: AuthorizationRelation) {
        self.0.insert(relation);
    }

    pub fn relations(&self) -> HashSet<AuthorizationRelation> {
        self.0.clone()
    }
}

impl Deref for AuthorizationRelations {
    type Target = HashSet<AuthorizationRelation>;

    fn deref(&self) -> &Self::Target {
        &self.0
    }
}


// More value objects...
#[derive(Debug, Clone, Hash, PartialEq, Eq)]
pub struct AuthorizationRelation(String);

impl AuthorizationRelation {
    pub fn new(relation: &str) -> Self {
        Self(relation.to_string())
    }
    pub fn relation(&self) -> String {
        self.0.clone()
    }
}

impl Deref for AuthorizationRelation {
    type Target = str;

    fn deref(&self) -> &Self::Target {
        &self.0
    }
}

