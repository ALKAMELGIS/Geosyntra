
#[derive(Debug, Clone, Default, PartialEq, Eq, Hash)]
pub struct AuthorizationResourceType(String);

impl AuthorizationResourceType {
    pub fn new(id: &str) -> Self {
        Self(id.to_string())
    }
    pub fn resource_type(&self) -> String {
        self.0.clone()
    }

    pub fn as_str(&self) -> &str {
        &self.0
    }
}

impl std::ops::Deref for AuthorizationResourceType {
    type Target = str;

    fn deref(&self) -> &Self::Target {
        &self.0
    }
}


impl std::fmt::Display for AuthorizationResourceType {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.0)
    }
}
