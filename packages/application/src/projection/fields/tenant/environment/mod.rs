use datetime::EnvironmentTimeField;
use device_security_posture::DeviceSecurityPostureField;
use location::EnvironmentLocationField;
use network_information::NetworkInformationField;
use risk_signals::RiskSignalsField;

pub mod datetime;
pub mod device_security_posture;
pub mod location;
pub mod network_information;
pub mod risk_signals;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum EnvironmentField {
    Time(EnvironmentTimeField),
    Location(EnvironmentLocationField),
    Device(DeviceSecurityPostureField),
    Network(NetworkInformationField),
    Risk(RiskSignalsField),
}
