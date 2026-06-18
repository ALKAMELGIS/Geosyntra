use crate::value_objects::{NetworkZone, TimeWindow};
use crate::error::DomainResult;
use crate::{DomainError};

use super::super::environment::{
    location::LocationZone,
    network_information::ConnectionType,
    Environment,
};

#[derive(Debug, Clone)]
pub struct TenantEnvironmentConfig {
    allowed_time_window: Option<TimeWindow>,
    allowed_networks: Vec<NetworkZone>,
    require_managed_device: bool,
    max_risk_score: Option<u8>,
}

#[derive(Debug, Clone)]
pub struct TenantEnvironmentConfigParts {
    pub allowed_time_window: Option<TimeWindow>,
    pub allowed_networks: Vec<NetworkZone>,
    pub require_managed_device: bool,
    pub max_risk_score: Option<u8>,
}

impl TenantEnvironmentConfig {
    pub fn new(
        allowed_time_window: Option<TimeWindow>,
        allowed_networks: &[NetworkZone],
        require_managed_device: bool,
        max_risk_score: Option<u8>,
    ) -> Self {
        Self {
            allowed_time_window,
            allowed_networks: allowed_networks.to_vec(),
            require_managed_device,
            max_risk_score,
        }
    }

    pub fn into_parts(self) -> TenantEnvironmentConfigParts {
        let Self {
            allowed_time_window,
            allowed_networks,
            require_managed_device,
            max_risk_score,
        } = self;
        TenantEnvironmentConfigParts {
            allowed_time_window,
            allowed_networks,
            require_managed_device,
            max_risk_score,
        }
    }

    pub fn allowed_time_window(&self) -> &Option<TimeWindow> {
        &self.allowed_time_window
    }
    pub fn allowed_networks(&self) -> &Vec<NetworkZone> {
        &self.allowed_networks
    }
    pub fn require_managed_device(&self) -> bool {
        self.require_managed_device
    }
    pub fn max_risk_score(&self) -> &Option<u8> {
        &self.max_risk_score
    }

    /// Evaluates request context against tenant environment policy.
    pub fn evaluate(&self, environment: &Environment) -> DomainResult<()> {
        if let Some(window) = self.allowed_time_window.as_ref() {
            let timestamp = environment.time().timestamp();
            let weekday = timestamp.weekday();
            let seconds = timestamp.seconds_since_midnight();
            if !window.allows(*timestamp, weekday, seconds) {
                return Err(DomainError::ValidationError(
                    "Request outside allowed time window".into(),
                ));
            }
        }

        if !self.allowed_networks.is_empty() {
            let zone = infer_network_zone(environment);
            if !self.allowed_networks.contains(&zone) {
                return Err(DomainError::ValidationError(
                    "Network zone not allowed".into(),
                ));
            }
        }

        if self.require_managed_device && !environment.device().is_managed() {
            return Err(DomainError::ValidationError(
                "Managed device required".into(),
            ));
        }

        if let Some(max) = self.max_risk_score
            && environment.risk().exceeds_threshold(max)
        {
            return Err(DomainError::ValidationError(
                "Risk score exceeds tenant threshold".into(),
            ));
        }

        Ok(())
    }
}

fn infer_network_zone(environment: &Environment) -> NetworkZone {
    match environment.network().connection_type() {
        ConnectionType::CorporateNetwork => NetworkZone::TrustedCorporate,
        ConnectionType::PublicWifi => NetworkZone::PublicInternet,
        ConnectionType::Cellular => NetworkZone::PublicInternet,
        ConnectionType::Unknown => match environment.location().zone() {
            LocationZone::InternalNetwork => NetworkZone::Internal,
            LocationZone::CorporateOffice => NetworkZone::TrustedCorporate,
            LocationZone::Country(_) => NetworkZone::Partner,
            LocationZone::Unknown => NetworkZone::Anonymous,
        },
    }
}
