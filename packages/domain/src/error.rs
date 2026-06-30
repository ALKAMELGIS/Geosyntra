use thiserror::Error;

use crate::billing::{BillingPlan, GeoFeature};
use crate::SharedStr;

#[derive(Error, Debug)]
pub enum DomainError {
    #[error("Billing error: {0}")]
    BillingError(#[from] BillingError),

    #[error("User error: {0}")]
    UserError(#[from] UserError),

    #[error("Role error: {0}")]
    RoleError(#[from] RoleError),

    #[error("Permission error: {0}")]
    PermissionError(#[from] PermissionError),

    #[error("Validation error: {0}")]
    ValidationError(SharedStr),

    #[error("Invalid operation: {0}")]
    InvalidOperation(SharedStr),

    #[error("Domain invariant violation: {0}")]
    InvariantViolation(SharedStr),
}

#[derive(Error, Debug)]
pub enum RoleError {
    #[error("Role not found")]
    NotFound,

    #[error("Invalid role ID: {0}")]
    InvalidRoleId(SharedStr),

    #[error("Permission: {0}")]
    PermissionError(#[from] PermissionError),
}

#[derive(Error, Debug)]
pub enum PermissionError {
    #[error("Permission not found")]
    NotFound,

    #[error("Invalid Permission")]
    InvalidPermission,
}

#[derive(Error, Debug)]
pub enum UserError {
    #[error("User not found")]
    NotFound,

    #[error("Invalid user ID: {0}")]
    InvalidUserId(SharedStr),

    #[error("Invalid email: {0}")]
    InvalidEmail(SharedStr),

    #[error("Invalid username: {0}")]
    InvalidUsername(SharedStr),

    #[error("Invalid password")]
    InvalidPassword,

    #[error("User is suspended")]
    Suspended,

    #[error("User is not active")]
    NotActive,

    #[error("Insufficient permissions")]
    InsufficientPermissions,
}

#[derive(Error, Debug, PartialEq, Eq)]
pub enum BillingError {
    #[error("Trial expired for plan {plan:?} — feature {feature:?} requires upgrade")]
    TrialExpired {
        plan: BillingPlan,
        feature: GeoFeature,
    },

    #[error("Payment pending for plan {plan:?} — feature {feature:?} blocked")]
    PaymentPending {
        plan: BillingPlan,
        feature: GeoFeature,
    },

    #[error("Subscription inactive for plan {plan:?} — feature {feature:?} blocked")]
    SubscriptionInactive {
        plan: BillingPlan,
        feature: GeoFeature,
    },

    #[error("Upgrade required on plan {plan:?} for feature {feature:?}")]
    UpgradeRequired {
        plan: BillingPlan,
        feature: GeoFeature,
    },

    #[error("Quota exceeded for feature {feature:?} on plan {plan:?}: {used}/{limit}")]
    QuotaExceeded {
        plan: BillingPlan,
        feature: GeoFeature,
        used: u32,
        limit: u32,
    },

    #[error("Tenant feature disabled for {feature:?}")]
    TenantFeatureDisabled { feature: GeoFeature },

    #[error("Tenant API rate limit exceeded: {used}/{limit}")]
    ApiRateLimitExceeded { used: u32, limit: u32 },
}

pub type DomainResult<T> = Result<T, DomainError>;
