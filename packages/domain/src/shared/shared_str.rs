use std::{borrow::Cow, fmt, sync::Arc};

/// Cheaply cloneable immutable string (Arc-backed).
///
/// ```
/// use domain::SharedStr;
///
/// let a = SharedStr::from("geosyntra");
/// let b = SharedStr::from("geosyntra");
/// assert_eq!(a.as_ref(), "geosyntra");
/// assert_eq!(a, b);
/// ```
#[derive(Clone, Debug, Default, PartialEq, Eq, Hash)]
pub struct SharedStr(Arc<str>);

impl From<String> for SharedStr {
    fn from(value: String) -> Self {
        Self(Arc::from(value))
    }
}

impl From<&str> for SharedStr {
    fn from(value: &str) -> Self {
        Self(Arc::from(value))
    }
}

impl AsRef<str> for SharedStr {
    fn as_ref(&self) -> &str {
        &self.0
    }
}

impl std::ops::Deref for SharedStr {
    type Target = str;

    fn deref(&self) -> &Self::Target {
        &self.0
    }
}

impl fmt::Display for SharedStr {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        // delegate formatting to inner str
        f.write_str(&self.0)
    }
}

impl<'a> From<Cow<'a, str>> for SharedStr {
    fn from(value: Cow<'a, str>) -> Self {
        match value {
            Cow::Borrowed(s) => Self(Arc::from(s)),
            Cow::Owned(s) => Self(Arc::from(s)),
        }
    }
}

impl From<char> for SharedStr {
    fn from(value: char) -> Self {
        Self(std::sync::Arc::from(value.to_string()))
    }
}
