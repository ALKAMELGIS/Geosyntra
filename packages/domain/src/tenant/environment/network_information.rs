#[derive(Debug, Clone)]
pub enum ConnectionType {
    CorporateNetwork,
    PublicWifi,
    Cellular,
    Unknown,
}

#[derive(Debug, Clone)]
pub struct NetworkInformation {
    is_vpn: bool,
    is_secure_transport: bool,
    connection_type: ConnectionType,
}

impl NetworkInformation {
    pub fn new(is_vpn: bool, is_secure_transport: bool, connection_type: ConnectionType) -> Self {
        Self {
            is_vpn,
            is_secure_transport,
            connection_type,
        }
    }

    pub fn is_vpn(&self) -> bool {
        self.is_vpn
    }

    pub fn is_secure_transport(&self) -> bool {
        self.is_secure_transport
    }

    pub fn connection_type(&self) -> &ConnectionType {
        &self.connection_type
    }

    pub fn is_corporate_ip(&self) -> bool {
        if let ConnectionType::CorporateNetwork = self.connection_type {
            return true;
        }
        false
    }
    pub fn is_cellular_network(&self) -> bool {
        if let ConnectionType::Cellular = self.connection_type {
            return true;
        }
        false
    }
    pub fn is_public_network(&self) -> bool {
        if let ConnectionType::PublicWifi = self.connection_type {
            return true;
        }
        false
    }
}
