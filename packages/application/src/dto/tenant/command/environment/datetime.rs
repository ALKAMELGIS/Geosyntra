use domain::DateTime;

#[derive(Debug, Clone)]
pub struct EnvironmentTimeCommand {
    pub timestamp: Option<DateTime>,
    pub is_business_hours: Option<bool>,
}
