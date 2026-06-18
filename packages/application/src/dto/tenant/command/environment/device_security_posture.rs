#[derive(Debug, Clone)]
pub struct DeviceSecurityPostureCommand {
    pub is_managed: Option<bool>,
    pub is_compliant: Option<bool>,
    pub has_recent_security_patch: Option<bool>,
}
