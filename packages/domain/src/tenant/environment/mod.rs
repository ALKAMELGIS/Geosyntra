use datetime::EnvironmentTime;
use device_security_posture::DeviceSecurityPosture;
use location::EnvironmentLocation;
use network_information::NetworkInformation;
use risk_signals::RiskSignals;

pub mod datetime;
pub mod device_security_posture;
pub mod location;
pub mod network_information;
pub mod risk_signals;

#[derive(Debug, Clone)]
pub struct Environment {
    time: EnvironmentTime,
    location: EnvironmentLocation,
    device: DeviceSecurityPosture,
    network: NetworkInformation,
    risk: RiskSignals,
}

impl Environment {
    pub fn new(
        time: EnvironmentTime,
        location: EnvironmentLocation,
        device: DeviceSecurityPosture,
        network: NetworkInformation,
        risk: RiskSignals,
    ) -> Self {
        Self {
            time,
            location,
            device,
            network,
            risk,
        }
    }

    pub fn time(&self) -> &EnvironmentTime {
        &self.time
    }

    pub fn location(&self) -> &EnvironmentLocation {
        &self.location
    }

    pub fn device(&self) -> &DeviceSecurityPosture {
        &self.device
    }

    pub fn network(&self) -> &NetworkInformation {
        &self.network
    }

    pub fn risk(&self) -> &RiskSignals {
        &self.risk
    }
}
