use domain::{
    tenant::environment::network_information::NetworkInformation, value_objects::NetworkZone,
};

pub struct NetworkZoneClassifier;

impl NetworkZoneClassifier {
    pub fn classify(info: &NetworkInformation) -> NetworkZone {
        if info.is_corporate_ip() {
            NetworkZone::TrustedCorporate
        } else if info.is_cellular_network() {
            NetworkZone::HighRisk
        } else if info.is_secure_transport() {
            NetworkZone::TrustedCorporate
        } else if info.is_vpn() {
            NetworkZone::Anonymous
        } else {
            NetworkZone::HighRisk
        }
    }
}
