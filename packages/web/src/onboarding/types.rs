//! Onboarding wizard types — parity with React `homeOnboarding.types.ts`.

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum BillingPlanId {
    #[default]
    Trial,
    Pro,
    Enterprise,
}

impl BillingPlanId {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Trial => "trial",
            Self::Pro => "pro",
            Self::Enterprise => "enterprise",
        }
    }

    pub fn parse(raw: &str) -> Option<Self> {
        match raw.trim().to_ascii_lowercase().as_str() {
            "trial" | "free" => Some(Self::Trial),
            "pro" => Some(Self::Pro),
            "enterprise" => Some(Self::Enterprise),
            _ => None,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum WizardStep {
    #[default]
    Welcome,
    Pricing,
    Payment,
    Activation,
    Launch,
}

impl WizardStep {
    pub fn normalize(raw: &str) -> Self {
        match raw.trim().to_ascii_lowercase().as_str() {
            "auth" | "welcome" => Self::Welcome,
            "identity" | "pricing" => Self::Pricing,
            "payment" => Self::Payment,
            "activation" => Self::Activation,
            "launch" => Self::Launch,
            _ => Self::Welcome,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum AuthMode {
    #[default]
    Signup,
    Signin,
}

impl AuthMode {
    pub fn parse(raw: &str) -> Self {
        if raw.eq_ignore_ascii_case("signin") {
            Self::Signin
        } else {
            Self::Signup
        }
    }
}

#[derive(Debug, Clone, Default)]
pub struct WizardOpenOptions {
    pub step: Option<WizardStep>,
    pub plan_id: Option<BillingPlanId>,
    pub auth_mode: Option<AuthMode>,
    pub upgrade: bool,
}

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct WizardLaunch {
    pub wizard: WizardStep,
    pub auth_mode: AuthMode,
    pub plan_id: Option<BillingPlanId>,
    pub upgrade: bool,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalizes_legacy_step_aliases() {
        assert_eq!(WizardStep::normalize("auth"), WizardStep::Welcome);
        assert_eq!(WizardStep::normalize("identity"), WizardStep::Pricing);
    }

    #[test]
    fn parses_billing_plan_ids() {
        assert_eq!(BillingPlanId::parse("pro"), Some(BillingPlanId::Pro));
        assert_eq!(BillingPlanId::parse("trial"), Some(BillingPlanId::Trial));
    }
}
