use datetime::EnvironmentTimeView;
use device_security_posture::DeviceSecurityPostureView;
use location::EnvironmentLocationView;
use network_information::NetworkInformationView;
use risk_signals::RiskSignalsView;

pub mod datetime;
pub mod device_security_posture;
pub mod location;
pub mod network_information;
pub mod risk_signals;

#[derive(Debug, Clone)]
pub struct EnvironmentView {
    pub time: Option<EnvironmentTimeView>,
    pub location: Option<EnvironmentLocationView>,
    pub device: Option<DeviceSecurityPostureView>,
    pub network: Option<NetworkInformationView>,
    pub risk: Option<RiskSignalsView>,
}
