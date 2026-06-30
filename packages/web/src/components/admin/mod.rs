pub mod catalog;
pub mod editors;
pub mod forms;
pub mod modal;
pub mod nav;
pub mod pickers;
pub mod shell;

pub use catalog::{load_catalog, user_label, AdminCatalog, GRANT_PRESETS};
pub use editors::{AttrRowEditor, ConfigKeysEditor, PLATFORM_CONFIG_KEYS, TENANT_CONFIG_KEYS};
pub use forms::{ReadOnlyMeta, TextAreaField, TextField};
pub use modal::{AdminDetailModal, AdminModal, AdminStepperModal};
pub use nav::AdminNav;
pub use pickers::{
    parse_grant_preset, GrantDurationSelect, GrantPermissionSelect, MultiRoleSelect, RoleSelect,
    TenantSelect, UserSelect, GRANT_DURATIONS,
};
pub use shell::AdminShell;
