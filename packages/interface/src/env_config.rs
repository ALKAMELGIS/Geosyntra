//! Express-parity environment checks (OAuth, email) — no secrets exposed.

fn trim_env(key: &str) -> String {
    std::env::var(key).unwrap_or_default().trim().to_string()
}

fn first_non_empty(values: &[String]) -> Option<String> {
    values.iter().find(|v| !v.is_empty()).cloned()
}

pub(crate) fn trim_env_public(key: &str) -> Option<String> {
    let v = trim_env(key);
    if v.is_empty() { None } else { Some(v) }
}

pub(crate) fn oauth_client_id_public(provider: &str) -> String {
    oauth_client_id(provider)
}

pub fn has_resend_config() -> bool {
    !trim_env("RESEND_API_KEY").is_empty() && !trim_env("RESEND_FROM").is_empty()
}

pub fn has_smtp_config() -> bool {
    !trim_env("SMTP_HOST").is_empty()
        && !trim_env("SMTP_USER").is_empty()
        && !trim_env("SMTP_PASS").is_empty()
}

pub fn has_email_config() -> bool {
    has_resend_config() || has_smtp_config()
}

pub fn email_provider_label() -> &'static str {
    if has_resend_config() {
        "resend"
    } else if has_smtp_config() {
        "smtp"
    } else {
        "none"
    }
}

pub fn is_production() -> bool {
    let env = trim_env("RUST_ENV");
    if !env.is_empty() {
        return env.eq_ignore_ascii_case("production");
    }
    trim_env("NODE_ENV").eq_ignore_ascii_case("production")
}

fn oauth_client_id(provider: &str) -> String {
    match provider {
        "google" => first_non_empty(&[
            trim_env("GOOGLE_CLIENT_ID"),
            trim_env("GOOGLE_OAUTH_CLIENT_ID"),
        ])
        .unwrap_or_default(),
        "linkedin" => first_non_empty(&[
            trim_env("LINKEDIN_CLIENT_ID"),
            trim_env("LINKEDIN_OAUTH_CLIENT_ID"),
        ])
        .unwrap_or_default(),
        "github" => first_non_empty(&[
            trim_env("GITHUB_CLIENT_ID"),
            trim_env("AUTH_GITHUB_CLIENT_ID"),
            trim_env("GITHUB_OAUTH_CLIENT_ID"),
        ])
        .unwrap_or_default(),
        "apple" => trim_env("APPLE_OAUTH_CLIENT_ID"),
        _ => String::new(),
    }
}

pub(crate) fn oauth_client_secret(provider: &str) -> String {
    match provider {
        "google" => first_non_empty(&[
            trim_env("GOOGLE_CLIENT_SECRET"),
            trim_env("GOOGLE_OAUTH_CLIENT_SECRET"),
        ])
        .unwrap_or_default(),
        "linkedin" => first_non_empty(&[
            trim_env("LINKEDIN_CLIENT_SECRET"),
            trim_env("LINKEDIN_OAUTH_CLIENT_SECRET"),
        ])
        .unwrap_or_default(),
        "github" => first_non_empty(&[
            trim_env("GITHUB_CLIENT_SECRET"),
            trim_env("AUTH_GITHUB_CLIENT_SECRET"),
            trim_env("GITHUB_OAUTH_CLIENT_SECRET"),
        ])
        .unwrap_or_default(),
        _ => String::new(),
    }
}

pub fn is_oauth_provider_configured(provider: &str) -> bool {
    if provider == "apple" {
        return !oauth_client_id("apple").is_empty();
    }
    !oauth_client_id(provider).is_empty() && !oauth_client_secret(provider).is_empty()
}

pub fn resolve_oauth_callback_url(provider: &str) -> String {
    let key = provider.to_ascii_uppercase();
    let explicit = first_non_empty(&[
        trim_env(&format!("{key}_OAUTH_CALLBACK_URL")),
        trim_env(&format!("{key}_CALLBACK_URL")),
        trim_env(&format!("AUTH_{key}_CALLBACK_URL")),
    ]);
    if let Some(url) = explicit {
        return url;
    }
    let origin = first_non_empty(&[
        trim_env("OAUTH_CALLBACK_ORIGIN"),
        trim_env("APP_ORIGIN"),
    ])
    .unwrap_or_else(|| "http://localhost:5173".into())
    .trim_end_matches('/')
    .to_string();
    format!("{origin}/api/auth/{provider}/callback")
}

pub fn env_non_empty(key: &str) -> bool {
    !trim_env(key).is_empty()
}

pub fn app_environment() -> String {
    first_non_empty(&[trim_env("RUST_ENV"), trim_env("NODE_ENV")])
        .unwrap_or_else(|| "development".into())
}
