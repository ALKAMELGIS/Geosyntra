use std::collections::HashMap;

use serde::Deserialize;

#[derive(Debug, thiserror::Error)]
pub enum StripeError {
    #[error("stripe_api_{0}")]
    Api(String),
    #[error("stripe_transport")]
    Transport,
}

#[derive(Debug, Deserialize)]
struct StripePaymentIntentResponse {
    client_secret: Option<String>,
}

#[derive(Debug, Deserialize)]
struct StripeCheckoutSessionResponse {
    id: Option<String>,
    url: Option<String>,
}

#[derive(Debug, Deserialize)]
struct StripeErrorBody {
    error: Option<StripeErrorDetail>,
}

#[derive(Debug, Deserialize)]
struct StripeErrorDetail {
    message: Option<String>,
}

pub async fn create_payment_intent(
    secret_key: &str,
    amount_cents: u64,
    customer_email: Option<&str>,
    metadata: &HashMap<String, String>,
) -> Result<String, StripeError> {
    let client = reqwest::Client::new();
    let mut form: Vec<(String, String)> = vec![
        ("amount".into(), amount_cents.to_string()),
        ("currency".into(), "usd".into()),
        ("automatic_payment_methods[enabled]".into(), "true".into()),
    ];
    if let Some(email) = customer_email.filter(|e| !e.is_empty()) {
        form.push(("receipt_email".into(), email.to_string()));
    }
    for (key, value) in metadata {
        form.push((format!("metadata[{key}]"), value.clone()));
    }

    let resp = client
        .post("https://api.stripe.com/v1/payment_intents")
        .basic_auth(secret_key, None::<&str>)
        .form(&form)
        .send()
        .await
        .map_err(|_| StripeError::Transport)?;

    let status = resp.status();
    let body = resp.text().await.map_err(|_| StripeError::Transport)?;
    if !status.is_success() {
        let detail = serde_json::from_str::<StripeErrorBody>(&body)
            .ok()
            .and_then(|e| e.error)
            .and_then(|e| e.message)
            .unwrap_or_else(|| body.chars().take(200).collect());
        return Err(StripeError::Api(detail));
    }

    let parsed: StripePaymentIntentResponse =
        serde_json::from_str(&body).map_err(|_| StripeError::Api("invalid_json".into()))?;
    parsed
        .client_secret
        .ok_or_else(|| StripeError::Api("missing_client_secret".into()))
}

pub async fn create_checkout_session(
    secret_key: &str,
    price_id: &str,
    customer_email: Option<&str>,
    success_url: &str,
    cancel_url: &str,
    metadata: &HashMap<String, String>,
) -> Result<(String, Option<String>), StripeError> {
    let client = reqwest::Client::new();
    let mut form: Vec<(String, String)> = vec![
        ("mode".into(), "subscription".into()),
        ("line_items[0][price]".into(), price_id.to_string()),
        ("line_items[0][quantity]".into(), "1".into()),
        ("success_url".into(), success_url.to_string()),
        ("cancel_url".into(), cancel_url.to_string()),
    ];
    if let Some(email) = customer_email.filter(|e| !e.is_empty()) {
        form.push(("customer_email".into(), email.to_string()));
    }
    for (key, value) in metadata {
        form.push((format!("metadata[{key}]"), value.clone()));
    }

    let resp = client
        .post("https://api.stripe.com/v1/checkout/sessions")
        .basic_auth(secret_key, None::<&str>)
        .form(&form)
        .send()
        .await
        .map_err(|_| StripeError::Transport)?;

    let status = resp.status();
    let body = resp.text().await.map_err(|_| StripeError::Transport)?;
    if !status.is_success() {
        let detail = serde_json::from_str::<StripeErrorBody>(&body)
            .ok()
            .and_then(|e| e.error)
            .and_then(|e| e.message)
            .unwrap_or_else(|| body.chars().take(200).collect());
        return Err(StripeError::Api(detail));
    }

    let parsed: StripeCheckoutSessionResponse =
        serde_json::from_str(&body).map_err(|_| StripeError::Api("invalid_json".into()))?;
    let id = parsed
        .id
        .ok_or_else(|| StripeError::Api("missing_session_id".into()))?;
    Ok((id, parsed.url))
}

pub fn pro_amount_cents() -> u64 {
    std::env::var("BILLING_PRO_AMOUNT_CENTS")
        .ok()
        .and_then(|s| s.parse().ok())
        .unwrap_or(10_000)
}

pub fn billing_checkout_urls() -> (String, String) {
    let origin = crate::env_config::trim_env_public("APP_ORIGIN")
        .unwrap_or_else(|| "http://localhost:5173".into())
        .trim_end_matches('/')
        .to_string();
    (
        format!("{origin}#/home?start=1&wizard=pricing&checkout=success&plan=pro"),
        format!("{origin}#/home?start=1&wizard=pricing&checkout=cancel&plan=pro"),
    )
}
