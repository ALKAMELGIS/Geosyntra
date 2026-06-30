use crate::traits::field::Field;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SubscriptionField {
    UserId,
    Plan,
    Status,
    DisplayStatus,
    Limits,
}

impl Field for SubscriptionField {
    fn name(&self) -> &'static str {
        match self {
            SubscriptionField::UserId => "user_id",
            SubscriptionField::Plan => "plan",
            SubscriptionField::Status => "status",
            SubscriptionField::DisplayStatus => "display_status",
            SubscriptionField::Limits => "limits",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum UsageRecordField {
    AiQueries,
    GroundingCalls,
    Exports,
}

impl Field for UsageRecordField {
    fn name(&self) -> &'static str {
        match self {
            UsageRecordField::AiQueries => "ai_queries",
            UsageRecordField::GroundingCalls => "grounding_calls",
            UsageRecordField::Exports => "exports",
        }
    }
}
