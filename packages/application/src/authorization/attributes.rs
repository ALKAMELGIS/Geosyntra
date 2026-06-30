use std::{
    collections::HashMap,
    ops::Deref,
};

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct AuthorizationAttributes(HashMap<AttributeKey, AttributeValue>);

impl AuthorizationAttributes {
    pub fn new() -> Self {
        AuthorizationAttributes(HashMap::new())
    }

    pub fn add_attributes(&mut self, attribute: Self) {
        self.0.extend(attribute.attributes());
    }

    pub fn add_attribute(&mut self, attribute: (AttributeKey, AttributeValue)) {
        self.0.insert(attribute.0, attribute.1);
    }

    pub fn attributes(&self) -> HashMap<AttributeKey, AttributeValue> {
        self.0.clone()
    }
}

impl Deref for AuthorizationAttributes {
    type Target = HashMap<AttributeKey, AttributeValue>;

    fn deref(&self) -> &Self::Target {
        &self.0
    }
}


// More value objects...
#[derive(Debug, Clone, Hash, PartialEq, Eq)]
pub struct AttributeKey(String);

impl AttributeKey {
    pub fn new(relation: &str) -> Self {
        Self(relation.to_string())
    }
    pub fn attribute_key(&self) -> String {
        self.0.clone()
    }
}

impl Deref for AttributeKey {
    type Target = str;

    fn deref(&self) -> &Self::Target {
        &self.0
    }
}


impl std::fmt::Display for AttributeKey {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.0)
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum AttributeValue {
    String(String),
    Bool(bool),
    Number(i64),
    StringList(Vec<String>),
}
