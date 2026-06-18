#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum RiskSignalsField {
    Score,
    AuthenticationStrength,
    RecentTransactionCount,
}
