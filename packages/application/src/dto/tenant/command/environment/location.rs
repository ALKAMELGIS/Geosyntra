use domain::tenant::environment::location::LocationZone;

#[derive(Debug, Clone)]
pub struct EnvironmentLocationCommand {
    pub zone: Option<LocationZone>,
}
