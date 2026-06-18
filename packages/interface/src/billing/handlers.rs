use application::ports::ActivateBillingPlanCommand;
use axum::{extract::State, http::StatusCode, Json};
use domain::BillingPlan;
use serde::Deserialize;
use serde_json::json;
use std::collections::HashMap;

use crate::{
    auth::handlers::PublicUserJson,
    billing::stripe::{self, StripeError},
    error::AppErrorResponse,
    extract::{AuthSubject, RequestEnvironment},
    state::AppState,
};

fn plan_slug(plan: BillingPlan) -> String {
    match plan {
        BillingPlan::Free => "free".into(),
        BillingPlan::Pro => "pro".into(),
        BillingPlan::Enterprise => "enterprise".into(),
    }
}

pub async fn list_plans(
    State(state): State<AppState>,
) -> Result<Json<serde_json::Value>, AppErrorResponse> {
    let plans = state.billing.list_plans.execute()?;
    let stripe_configured = std::env::var("STRIPE_SECRET_KEY")
        .map(|k| k.trim().starts_with("sk_"))
        .unwrap_or(false);
    let trial_days: u32 = std::env::var("BILLING_TRIAL_DAYS")
        .ok()
        .and_then(|s| s.parse().ok())
        .unwrap_or(14);
    let pro_amount_usd: f64 = std::env::var("BILLING_PRO_AMOUNT_CENTS")
        .ok()
        .and_then(|s| s.parse::<f64>().ok())
        .map(|c| c / 100.0)
        .unwrap_or(100.0);

    Ok(Json(json!({
        "ok": true,
        "trial_days": trial_days,
        "pro_amount_usd": pro_amount_usd,
        "merchant": {
            "account_id": std::env::var("BILLING_MERCHANT_ACCOUNT_ID").unwrap_or_else(|_| "geosyntra_platform".into()),
            "label": std::env::var("BILLING_MERCHANT_LABEL").unwrap_or_else(|_| "GeoSyntra Platform".into()),
            "stripe_configured": stripe_configured,
        },
        "plans": plans.iter().map(|p| json!({
            "id": p.id,
            "limits": { "ai_queries_per_day": p.ai_queries_per_day },
        })).collect::<Vec<_>>(),
    })))
}

pub async fn billing_me(
    State(state): State<AppState>,
    AuthSubject(ctx): AuthSubject,
    RequestEnvironment(env): RequestEnvironment,
) -> Result<Json<serde_json::Value>, AppErrorResponse> {
    let view = state.billing.get_me.execute(ctx.clone(), env).await?;
    Ok(Json(json!({
        "ok": true,
        "subscription": {
            "user_id": ctx.user_id().as_str(),
            "plan": view.subscription.plan.map(plan_slug),
            "status": view.subscription.status,
            "trial_ends_at": view.subscription.trial_ends_at,
            "current_period_end": view.subscription.current_period_end,
            "usage": {
                "ai_queries": view.usage.ai_queries,
                "grounding_calls": view.usage.grounding_calls,
                "exports": view.usage.exports,
            },
        },
    })))
}

#[derive(Debug, Deserialize)]
pub struct StartTrialRequest {
    pub days: Option<u32>,
}

pub async fn start_trial(
    State(state): State<AppState>,
    AuthSubject(ctx): AuthSubject,
    RequestEnvironment(env): RequestEnvironment,
    Json(body): Json<StartTrialRequest>,
) -> Result<Json<serde_json::Value>, AppErrorResponse> {
    let days = body.days.unwrap_or(14);
    let subscription = state
        .billing
        .start_trial
        .execute(ctx, env, days)
        .await?;
    Ok(Json(json!({
        "ok": true,
        "subscription": {
            "plan": subscription.plan.map(plan_slug),
            "status": subscription.status,
            "trial_ends_at": subscription.trial_ends_at,
        },
    })))
}

#[derive(Debug, Deserialize)]
pub struct ActivatePlanRequest {
    #[serde(rename = "planId")]
    pub plan_id: Option<String>,
    #[serde(rename = "billingPlanId")]
    pub billing_plan_id: Option<String>,
    #[serde(default)]
    pub payment_completed: bool,
    pub provider: Option<String>,
}

pub async fn activate_plan(
    State(state): State<AppState>,
    AuthSubject(ctx): AuthSubject,
    RequestEnvironment(env): RequestEnvironment,
    Json(body): Json<ActivatePlanRequest>,
) -> Result<Json<serde_json::Value>, AppErrorResponse> {
    let billing_plan_id = body
        .plan_id
        .or(body.billing_plan_id)
        .unwrap_or_else(|| "trial".into());
    let subscription = state
        .billing
        .activate
        .execute(
            ctx,
            env,
            ActivateBillingPlanCommand {
                billing_plan_id,
                payment_completed: body.payment_completed,
                provider: body.provider,
            },
        )
        .await?;
    Ok(Json(json!({
        "ok": true,
        "subscription": {
            "plan": subscription.plan.map(plan_slug),
            "status": subscription.status,
            "current_period_end": subscription.current_period_end,
        },
    })))
}

#[derive(Debug, Deserialize)]
pub struct PaymentIntentRequest {
    #[serde(rename = "planId")]
    pub plan_id: Option<String>,
}

/// Stripe PaymentIntent — mirrors Express `503 stripe_not_configured` when unset.
pub async fn payment_intent(
    State(_state): State<AppState>,
    AuthSubject(ctx): AuthSubject,
    RequestEnvironment(_env): RequestEnvironment,
    Json(body): Json<PaymentIntentRequest>,
) -> Result<Json<serde_json::Value>, AppErrorResponse> {
    let plan = body.plan_id.unwrap_or_else(|| "pro".into());
    let secret = stripe_secret_key().ok_or_else(|| {
        AppErrorResponse::validation("stripe_not_configured", StatusCode::SERVICE_UNAVAILABLE)
    })?;
    let amount = stripe::pro_amount_cents();
    let mut metadata = HashMap::new();
    metadata.insert("user_id".into(), ctx.user_id().as_str().to_string());
    metadata.insert("plan".into(), plan);
    let email = None::<&str>;
    match stripe::create_payment_intent(&secret, amount, email, &metadata).await {
        Ok(client_secret) => Ok(Json(json!({
            "ok": true,
            "clientSecret": client_secret,
            "amountCents": amount,
        }))),
        Err(StripeError::Api(detail)) => Err(AppErrorResponse::validation(
            format!("payment_intent_failed: {detail}"),
            StatusCode::BAD_GATEWAY,
        )),
        Err(_) => Err(AppErrorResponse::validation(
            "payment_intent_failed",
            StatusCode::BAD_GATEWAY,
        )),
    }
}

#[derive(Debug, Deserialize)]
pub struct CheckoutSessionRequest {
    #[serde(rename = "planId")]
    pub plan_id: Option<String>,
    #[serde(rename = "priceId")]
    pub price_id: Option<String>,
}

/// Stripe Checkout session — mirrors Express unconfigured / missing price_id errors.
pub async fn create_checkout_session(
    State(_state): State<AppState>,
    AuthSubject(ctx): AuthSubject,
    RequestEnvironment(_env): RequestEnvironment,
    Json(body): Json<CheckoutSessionRequest>,
) -> Result<Json<serde_json::Value>, AppErrorResponse> {
    let plan = body.plan_id.unwrap_or_else(|| "pro".into());
    let secret = stripe_secret_key().ok_or_else(|| {
        AppErrorResponse::validation("stripe_not_configured", StatusCode::SERVICE_UNAVAILABLE)
    })?;
    let price_id = body
        .price_id
        .or_else(|| std::env::var("STRIPE_PRICE_PRO_MONTHLY").ok())
        .unwrap_or_default();
    if price_id.trim().is_empty() {
        return Err(AppErrorResponse::validation(
            "price_id_required",
            StatusCode::BAD_REQUEST,
        ));
    }
    let (success_url, cancel_url) = stripe::billing_checkout_urls();
    let mut metadata = HashMap::new();
    metadata.insert("user_id".into(), ctx.user_id().as_str().to_string());
    metadata.insert("plan".into(), plan);
    match stripe::create_checkout_session(
        &secret,
        price_id.trim(),
        None,
        &success_url,
        &cancel_url,
        &metadata,
    )
    .await
    {
        Ok((session_id, url)) => Ok(Json(json!({
            "ok": true,
            "sessionId": session_id,
            "url": url,
        }))),
        Err(StripeError::Api(detail)) => Err(AppErrorResponse::validation(
            format!("checkout_failed: {detail}"),
            StatusCode::BAD_GATEWAY,
        )),
        Err(_) => Err(AppErrorResponse::validation(
            "checkout_failed",
            StatusCode::BAD_GATEWAY,
        )),
    }
}

/// Invoice list — Express parity; Postgres list deferred (returns empty until Task 19+).
pub async fn list_invoices(
    State(_state): State<AppState>,
    AuthSubject(_ctx): AuthSubject,
    RequestEnvironment(_env): RequestEnvironment,
) -> Result<Json<serde_json::Value>, AppErrorResponse> {
    Ok(Json(json!({ "ok": true, "invoices": [] })))
}

fn stripe_secret_key() -> Option<String> {
    std::env::var("STRIPE_SECRET_KEY")
        .ok()
        .filter(|k| k.trim().starts_with("sk_"))
        .map(|k| k.trim().to_string())
}

#[derive(Debug, Deserialize)]
pub struct ConfirmPaymentRequest {
    #[serde(rename = "planId")]
    pub plan_id: Option<String>,
    pub provider: Option<String>,
    #[serde(rename = "sessionId")]
    pub session_id: Option<String>,
    #[serde(rename = "paymentIntentId")]
    pub payment_intent_id: Option<String>,
}

pub async fn confirm_payment(
    State(state): State<AppState>,
    AuthSubject(ctx): AuthSubject,
    RequestEnvironment(env): RequestEnvironment,
    Json(body): Json<ConfirmPaymentRequest>,
) -> Result<Json<serde_json::Value>, AppErrorResponse> {
    let plan_id = body.plan_id.unwrap_or_else(|| "pro".into());
    if plan_id == "enterprise" {
        return Err(AppErrorResponse::validation(
            "use_sales_channel",
            StatusCode::BAD_REQUEST,
        ));
    }
    let subscription = state
        .billing
        .activate
        .execute(
            ctx,
            env,
            ActivateBillingPlanCommand {
                billing_plan_id: "pro".into(),
                payment_completed: true,
                provider: body.provider.or_else(|| Some("stripe".into())),
            },
        )
        .await?;
    Ok(Json(json!({
        "ok": true,
        "subscription": {
            "plan": subscription.plan.map(plan_slug),
            "status": subscription.status,
            "current_period_end": subscription.current_period_end,
        },
    })))
}

#[derive(Debug, Deserialize)]
pub struct BankTransferRequest {
    #[serde(rename = "planId")]
    pub plan_id: Option<String>,
}

pub async fn bank_transfer(
    State(state): State<AppState>,
    AuthSubject(ctx): AuthSubject,
    RequestEnvironment(env): RequestEnvironment,
    Json(body): Json<BankTransferRequest>,
) -> Result<Json<serde_json::Value>, AppErrorResponse> {
    let plan_id = body.plan_id.unwrap_or_else(|| "pro".into());
    let subscription = state
        .billing
        .activate
        .execute(
            ctx.clone(),
            env,
            ActivateBillingPlanCommand {
                billing_plan_id: plan_id.clone(),
                payment_completed: false,
                provider: Some("bank_transfer".into()),
            },
        )
        .await?;
    let reference = format!(
        "GS-{}-{}",
        ctx.user_id().as_str(),
        uuid::Uuid::new_v4()
            .as_simple()
            .to_string()
            .chars()
            .take(6)
            .collect::<String>()
            .to_uppercase()
    );
    Ok(Json(json!({
        "ok": true,
        "subscription": {
            "plan": subscription.plan.map(plan_slug),
            "status": subscription.status,
        },
        "instructions": {
            "reference": reference,
            "note": "Email finance@geosyntra.com with your transfer receipt to activate Pro.",
        },
    })))
}

/// Stripe webhook stub — raw body preserved for signature verification (Task 16+).
pub async fn stripe_webhook(
    State(_state): State<AppState>,
    headers: axum::http::HeaderMap,
    body: axum::body::Bytes,
) -> Result<(StatusCode, Json<serde_json::Value>), AppErrorResponse> {
    if std::env::var("STRIPE_WEBHOOK_SECRET")
        .map(|s| s.trim().is_empty())
        .unwrap_or(true)
    {
        return Err(AppErrorResponse::validation(
            "stripe_webhook_not_configured",
            StatusCode::SERVICE_UNAVAILABLE,
        ));
    }
    let _sig = headers.get("stripe-signature");
    let _payload = body;
    Ok((
        StatusCode::OK,
        Json(json!({ "ok": true, "received": true })),
    ))
}

/// Express alias — returns user + echoes bearer token from Authorization header.
pub async fn rbac_me(
    State(state): State<AppState>,
    AuthSubject(ctx): AuthSubject,
    RequestEnvironment(env): RequestEnvironment,
    headers: axum::http::HeaderMap,
) -> Result<Json<serde_json::Value>, AppErrorResponse> {
    let user = state.get_me.execute(ctx, env).await?;
    let access_token = headers
        .get(axum::http::header::AUTHORIZATION)
        .and_then(|v| v.to_str().ok())
        .and_then(|h| h.strip_prefix("Bearer "))
        .map(str::trim)
        .filter(|t| !t.is_empty())
        .map(str::to_string);
    let user_json = PublicUserJson::from(user);
    let tenant_id = user_json.tenant_id.clone();
    Ok(Json(json!({
        "ok": true,
        "user": user_json,
        "accessToken": access_token,
        "tenantId": tenant_id,
    })))
}
