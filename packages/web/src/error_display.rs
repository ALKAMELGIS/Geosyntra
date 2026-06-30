use thiserror::Error;

#[derive(Debug, Error)]
pub enum ApiError {
    #[error("network: {0}")]
    Network(String),
    #[error("HTTP {status}: {message}")]
    Http { status: u16, message: String },
    #[error("parse: {message}")]
    Parse { message: String },
}

impl ApiError {
    pub fn network(err: impl std::fmt::Display) -> Self {
        Self::Network(err.to_string())
    }

    pub fn from_body(status: u16, body: &str) -> Self {
        let message = serde_json::from_str::<serde_json::Value>(body)
            .ok()
            .and_then(|v| {
                v.get("error")
                    .or_else(|| v.get("message"))
                    .and_then(|m| m.as_str())
                    .map(str::to_string)
            })
            .unwrap_or_else(|| body.chars().take(200).collect());
        Self::Http { status, message }
    }

    pub fn user_message(&self) -> String {
        match self {
            Self::Network(_) => {
                "Cannot reach the GeoSyntra API. Start Axum on port 3003 (cargo run -p geosyntra-api)."
                    .into()
            }
            Self::Http { status, message } if *status == 403 => {
                if message.is_empty() {
                    "This action is not allowed for the active tenant.".into()
                } else {
                    format!("Not allowed for the active tenant: {message}")
                }
            }
            Self::Http { message, .. } => message.clone(),
            Self::Parse { message } => format!("Unexpected API response: {message}"),
        }
    }
}

pub fn display_api_error(err: &ApiError) -> String {
    err.user_message()
}
