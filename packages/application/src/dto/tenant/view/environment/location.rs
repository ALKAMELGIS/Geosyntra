use domain::tenant::environment::location::LocationZone;

#[derive(Debug, Clone)]
pub struct EnvironmentLocationView {
    pub zone: Option<LocationZone>,
}
