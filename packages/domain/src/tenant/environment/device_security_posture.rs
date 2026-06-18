#[derive(Debug, Clone)]
pub struct DeviceSecurityPosture {
    is_managed: bool,
    is_compliant: bool,
    has_recent_security_patch: bool,
}

impl DeviceSecurityPosture {
    pub fn new(is_managed: bool, is_compliant: bool, has_recent_security_patch: bool) -> Self {
        Self {
            is_managed,
            is_compliant,
            has_recent_security_patch,
        }
    }

    pub fn is_managed(&self) -> bool {
        self.is_managed
    }

    pub fn is_compliant(&self) -> bool {
        self.is_compliant
    }

    pub fn has_recent_security_patch(&self) -> bool {
        self.has_recent_security_patch
    }
}
