use domain::DateTime;

#[derive(Debug, Clone)]
pub struct EnvironmentTimeView {
    pub timestamp: Option<DateTime>,
    pub is_business_hours: Option<bool>,
}
