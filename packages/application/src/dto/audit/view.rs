use domain::DateTime;

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct AuditEntryView {
    pub at: Option<DateTime>,
    pub actor: Option<String>,
    pub action: Option<String>,
    pub target: Option<String>,
}
