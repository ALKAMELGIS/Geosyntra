use datetime::EnvironmentTimeCommand;
use device_security_posture::DeviceSecurityPostureCommand;
use location::EnvironmentLocationCommand;
use network_information::NetworkInformationCommand;
use risk_signals::RiskSignalsCommand;

pub mod datetime;
pub mod device_security_posture;
pub mod location;
pub mod network_information;
pub mod risk_signals;

#[derive(Debug, Clone)]
pub struct EnvironmentCommand {
    pub time: Option<EnvironmentTimeCommand>,
    pub location: Option<EnvironmentLocationCommand>,
    pub device: Option<DeviceSecurityPostureCommand>,
    pub network: Option<NetworkInformationCommand>,
    pub risk: Option<RiskSignalsCommand>,
}
