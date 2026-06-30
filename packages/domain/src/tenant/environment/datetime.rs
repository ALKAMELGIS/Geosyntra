use crate::DateTime;

#[derive(Debug, Clone)]
pub struct EnvironmentTime {
    timestamp: DateTime,
    is_business_hours: bool,
}

impl EnvironmentTime {
    pub fn new(timestamp: DateTime, is_business_hours: bool) -> Self {
        Self {
            timestamp,
            is_business_hours,
        }
    }

    pub fn timestamp(&self) -> &DateTime {
        &self.timestamp
    }

    pub fn is_business_hours(&self) -> bool {
        self.is_business_hours
    }
}
