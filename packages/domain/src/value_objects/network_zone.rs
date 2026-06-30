#[derive(Debug, Clone, PartialEq, Eq)]
pub enum NetworkZone {
    TrustedCorporate,
    Internal,
    Partner,
    PublicInternet,
    Anonymous,
    HighRisk,
}
