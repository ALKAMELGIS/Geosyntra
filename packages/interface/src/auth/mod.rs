pub mod cooldown;
pub mod handlers;
pub mod lifecycle_handlers;
pub mod oauth_exchange;
pub mod oauth_public;
pub mod oauth_upsert;

pub use handlers::{auth_events, login, logout, logout_all, me, refresh, register};
pub use lifecycle_handlers::{
    forgot_password, forgot_username, resend_verification, reset_password, send_verification_email,
    verify_email,
};
pub use oauth_exchange::{apple_exchange, github_exchange, google_exchange, linkedin_exchange};
pub use oauth_public::{apple_oauth, apple_oauth_callback, email_status, oauth_config};
pub use oauth_upsert::oauth_upsert;
