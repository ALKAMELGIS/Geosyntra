use domain::tenant::environment::network_information::ConnectionType;

#[derive(Debug, Clone)]
pub struct NetworkInformationView {
    pub is_vpn: Option<bool>,
    pub is_secure_transport: Option<bool>,
    pub connection_type: Option<ConnectionType>,
}
