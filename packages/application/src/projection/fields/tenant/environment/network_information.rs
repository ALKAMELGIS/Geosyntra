#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum NetworkInformationField {
    IsVpn,
    IsSecureTransport,
    ConnectionType,
}
