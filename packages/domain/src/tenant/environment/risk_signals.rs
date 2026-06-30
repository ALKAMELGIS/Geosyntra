#[derive(Debug, Clone)]
pub enum AuthenticationStrength {
    PasswordOnly,
    MultiFactor,
    HardwareKey,
}

#[derive(Debug, Clone)]
pub struct RiskSignals {
    score: u8,
    authentication_strength: AuthenticationStrength,
    recent_transaction_count: u32,
}

impl RiskSignals {
    pub fn new(
        score: u8,
        authentication_strength: AuthenticationStrength,
        recent_transaction_count: u32,
    ) -> Self {
        Self {
            score,
            authentication_strength,
            recent_transaction_count,
        }
    }

    pub fn score(&self) -> &u8 {
        &self.score
    }

    pub fn authentication_strength(&self) -> &AuthenticationStrength {
        &self.authentication_strength
    }

    pub fn recent_transaction_count(&self) -> &u32 {
        &self.recent_transaction_count
    }

    pub fn exceeds_threshold(&self, max_score: u8) -> bool {
        self.score > max_score
    }

    pub fn is_high_risk(&self, max_score: u8) -> bool {
        self.exceeds_threshold(max_score)
    }
}
