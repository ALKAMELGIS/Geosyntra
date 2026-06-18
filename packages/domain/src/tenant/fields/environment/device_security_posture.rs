#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum DeviceSecurityPostureField {
    IsManaged,
    IsCompliant,
    HasRecentSecurityPatch,
}
