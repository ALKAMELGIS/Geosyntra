use domain::tenant::environment::risk_signals::AuthenticationStrength;

#[derive(Debug, Clone)]
pub struct RiskSignalsView {
    score: Option<u8>,
    authentication_strength: Option<AuthenticationStrength>,
    recent_transaction_count: Option<u32>,
}
