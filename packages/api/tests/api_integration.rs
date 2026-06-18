//! HTTP integration tests — Axum server + local Postgres + reqwest.
//!
//! ```bash
//! scripts/dev-postgres.sh start
//! scripts/run-api-integration-tests.sh
//! ```

mod common;

use common::{
    assert_governance_proposal, assert_ok, TestServer, ISOLATED_TENANT_ID, ISOLATED_USER_ID,
    OWNER_EMAIL, PENDING_EMAIL, PENDING_ID, TEST_PASSWORD,
};
use interface::IMPLEMENTED_ROUTES;
use reqwest::StatusCode;
use serde_json::json;

/// Parallel-safe suites share `TestServer::shared()` (OnceCell singleton).
async fn integration_public_routes(srv: &TestServer) {
    // ── Health & public billing ─────────────────────────────────────────────
    let (status, body) = TestServer::text(srv.get("/health").await.unwrap()).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(body, "ok");

    let (status, body) =
        TestServer::json(srv.get("/api/billing/plans").await.unwrap()).await;
    assert_eq!(status, StatusCode::OK);
    assert_ok(&body);
    assert!(body.get("plans").and_then(|v| v.as_array()).is_some());

    let (status, _body) = TestServer::json(
        srv.post_json("/api/billing/webhook", json!({ "type": "test" }))
            .await
            .unwrap(),
    )
    .await;
    assert_eq!(status, StatusCode::SERVICE_UNAVAILABLE);

    let (status, body) = TestServer::json(srv.get("/api/platform/health").await.unwrap()).await;
    assert_eq!(status, StatusCode::OK);
    assert_ok(&body);

    let (status, body) = TestServer::json(srv.get("/api/auth/oauth/config").await.unwrap()).await;
    assert_eq!(status, StatusCode::OK);
    assert_ok(&body);
    assert!(body.get("providers").is_some());

    let (status, body) = TestServer::json(
        srv.post_json(
            "/api/auth/forgot-password",
            json!({ "email": "nobody@test.local" }),
        )
        .await
        .unwrap(),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_ok(&body);

    let (status, body) = TestServer::json(
        srv.get("/api/auth/verify-email?token=dummy-token")
            .await
            .unwrap(),
    )
    .await;
    assert_eq!(status, StatusCode::BAD_REQUEST);
    assert_eq!(
        body.get("error").and_then(|v| v.as_str()),
        Some("invalid_token")
    );

    let verify_email = format!("verify-{}@test.local", uuid::Uuid::new_v4());
    let (status, _body) = TestServer::json(
        srv.post_json(
            "/api/auth/register",
            json!({
                "name": "Verify Flow",
                "email": verify_email,
                "password": TEST_PASSWORD,
                "requested_role": "trial_user"
            }),
        )
        .await
        .unwrap(),
    )
    .await;
    assert_eq!(status, StatusCode::OK);

    let (status, body) = TestServer::json(
        srv.post_json(
            "/api/auth/resend-verification",
            json!({ "email": verify_email }),
        )
        .await
        .unwrap(),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_ok(&body);
    let dev_link = body
        .get("devVerificationLink")
        .and_then(|v| v.as_str())
        .expect("devVerificationLink");
    let token = dev_link
        .split("token=")
        .nth(1)
        .expect("token in dev link");

    let (status, body) = TestServer::json(
        srv.get(&format!("/api/auth/verify-email?token={token}"))
            .await
            .unwrap(),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_ok(&body);
    assert!(body.get("accessToken").and_then(|v| v.as_str()).is_some());

    let (status, body) = TestServer::json(
        srv.post_json(
            "/api/auth/forgot-username",
            json!({ "email": "member@test.local" }),
        )
        .await
        .unwrap(),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(body.get("found").and_then(|v| v.as_bool()), Some(true));

    // ── Auth ──────────────────────────────────────────────────────────────────
    let email = format!("new-{}@test.local", uuid::Uuid::new_v4());
    let (status, body) = TestServer::json(
        srv.post_json(
            "/api/auth/register",
            json!({
                "name": "New User",
                "email": email,
                "password": TEST_PASSWORD,
                "requested_role": "trial_user"
            }),
        )
        .await
        .unwrap(),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(
        body.get("status").and_then(|v| v.as_str()),
        Some("Pending Verification")
    );

    let (status, body) = TestServer::json(
        srv.post_json(
            "/api/auth/login",
            json!({ "email": PENDING_EMAIL, "password": TEST_PASSWORD }),
        )
        .await
        .unwrap(),
    )
    .await;
    assert_eq!(status, StatusCode::BAD_REQUEST);
    assert!(
        body.get("error")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .contains("pending_approval")
    );

    let (status, _body) = TestServer::json(srv.get("/api/auth/me").await.unwrap()).await;
    assert_eq!(status, StatusCode::BAD_REQUEST);

    let owner_session = srv
        .login(OWNER_EMAIL, TEST_PASSWORD, false)
        .await
        .expect("owner login");
    let owner = owner_session.access_token.clone();

    let (status, body) = TestServer::json(
        srv.get_auth("/api/auth/me", &owner).await.unwrap(),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(
        body.get("email").and_then(|v| v.as_str()),
        Some(OWNER_EMAIL)
    );

    let remember_session = srv
        .login(OWNER_EMAIL, TEST_PASSWORD, true)
        .await
        .expect("owner login remember");
    let refresh = remember_session
        .refresh_token
        .expect("refresh token");
    let (status, body) = TestServer::json(
        srv.post_json("/api/auth/refresh", json!({ "refresh_token": refresh }))
            .await
            .unwrap(),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert!(body.get("access_token").is_some());

    let (status, body) = TestServer::json(
        srv.post_json("/api/auth/logout", json!({ "refresh_token": refresh }))
            .await
            .unwrap(),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_ok(&body);

    let (status, body) = TestServer::json(srv.get("/api/auth/events").await.unwrap()).await;
    assert_eq!(status, StatusCode::OK);
    assert!(body.get("items").and_then(|v| v.as_array()).is_some());

    let (status, body) = TestServer::json(srv.get("/api/geo/grounding/status").await.unwrap()).await;
    assert_eq!(status, StatusCode::OK);
    assert_ok(&body);
    assert!(body.get("tools").and_then(|v| v.as_array()).is_some());

    let (status, body) = TestServer::json(
        srv.post_json("/api/geo/grounding/invoke", json!({ "tool": "geocode" }))
            .await
            .unwrap(),
    )
    .await;
    assert!(
        status == StatusCode::NOT_IMPLEMENTED
            || status == StatusCode::SERVICE_UNAVAILABLE
            || status == StatusCode::BAD_REQUEST
    );

    let (status, body) = TestServer::json(
        srv.get_auth("/api/platform/env-health", &owner).await.unwrap(),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert!(body.get("bindings").is_some());
    assert!(body.get("capabilities").is_some());

    let (status, body) = TestServer::json(
        srv.post_json("/api/auth/logout-all", json!({}))
            .await
            .unwrap(),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_ok(&body);

    let (status, _body) = TestServer::json(
        srv.get("/api/mapbox-proxy").await.unwrap(),
    )
    .await;
    assert_eq!(status, StatusCode::SERVICE_UNAVAILABLE);

    let (status, _body) = TestServer::json(
        srv.get_auth("/api/gateway/mapbox/public-token", &owner)
            .await
            .unwrap(),
    )
    .await;
    assert_eq!(status, StatusCode::SERVICE_UNAVAILABLE);

    let (status, body) = TestServer::json(srv.get("/api/github/status").await.unwrap()).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(body.get("connected").and_then(|v| v.as_bool()), Some(false));

    let (status, body) = TestServer::json(srv.get("/api/github/events").await.unwrap()).await;
    assert_eq!(status, StatusCode::OK);
    assert!(body.get("items").and_then(|v| v.as_array()).is_some());

    let (status, _body) = TestServer::json(
        srv.get_auth("/api/gateway/sentinel/credentials", &owner)
            .await
            .unwrap(),
    )
    .await;
    assert_eq!(status, StatusCode::SERVICE_UNAVAILABLE);

    let (status, _body) = TestServer::json(
        srv.get("/api/google-3d-tiles-proxy").await.unwrap(),
    )
    .await;
    assert_eq!(status, StatusCode::SERVICE_UNAVAILABLE);

    let (status, body) = TestServer::json(
        srv.post_json("/api/github/disconnect", json!({}))
            .await
            .unwrap(),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_ok(&body);

    let (status, _body) = TestServer::json(srv.get("/api/github/oauth/start").await.unwrap()).await;
    assert_eq!(status, StatusCode::INTERNAL_SERVER_ERROR);

    let (status, _body) = TestServer::json(srv.get("/api/github/repos").await.unwrap()).await;
    assert_eq!(status, StatusCode::UNAUTHORIZED);

    let (status, body) = TestServer::json(
        srv.post_auth_json(
            "/api/gateway/gemini/generate-content",
            json!({ "contents": [{ "role": "user", "parts": [{ "text": "hi" }] }] }),
            &owner,
        )
        .await
        .unwrap(),
    )
    .await;
    assert_eq!(status, StatusCode::SERVICE_UNAVAILABLE);
    assert_eq!(
        body.get("error").and_then(|v| v.as_str()),
        Some("gemini_not_configured")
    );

    let (status, _body) = TestServer::json(
        srv.get("/api/github/repos/octocat/Hello-World/issues")
            .await
            .unwrap(),
    )
    .await;
    assert_eq!(status, StatusCode::UNAUTHORIZED);

    let (status, _body) = TestServer::json(
        srv.get("/api/auth/apple").await.unwrap(),
    )
    .await;
    assert_eq!(status, StatusCode::NOT_IMPLEMENTED);

    let (status, _body) = TestServer::json(
        srv.post_json("/api/auth/send-verification-email", json!({}))
            .await
            .unwrap(),
    )
    .await;
    assert_eq!(status, StatusCode::BAD_REQUEST);

    let (status, _body) = TestServer::json(
        srv.post_auth_json(
            "/api/gateway/openrouteservice/v2/directions",
            json!({ "coordinates": [] }),
            &owner,
        )
        .await
        .unwrap(),
    )
    .await;
    assert_eq!(status, StatusCode::SERVICE_UNAVAILABLE);

    let (status, body) = TestServer::json(srv.get("/api/weather/latest").await.unwrap()).await;
    assert_eq!(status, StatusCode::OK);
    assert!(body.get("temp_c").is_some());

    let (status, body) = TestServer::json(srv.get("/api/geo/locations").await.unwrap()).await;
    assert_eq!(status, StatusCode::OK);
    assert!(body.get("items").and_then(|v| v.as_array()).is_some());

    let (status, body) = TestServer::json(
        srv.post_json("/api/ai/analyze", json!({}))
            .await
            .unwrap(),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert!(body.get("score").is_some());

    let (status, _body) = TestServer::json(
        srv.post_json("/api/auth/google/exchange", json!({}))
            .await
            .unwrap(),
    )
    .await;
    assert_eq!(status, StatusCode::BAD_REQUEST);

    let (status, body) = TestServer::json(
        srv.get_auth("/api/user/api-tokens/session", &owner)
            .await
            .unwrap(),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_ok(&body);
    assert!(body.get("capabilities").is_some());

    let (status, body) = TestServer::json(
        srv.get_auth("/api/user/api-tokens", &owner).await.unwrap(),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_ok(&body);
    assert!(body.get("tokens").and_then(|v| v.as_array()).is_some());

    let (status, body) = TestServer::json(
        srv.get_auth("/api/system/tokens/status", &owner)
            .await
            .unwrap(),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_ok(&body);
    assert!(body.get("tokens").and_then(|v| v.as_array()).is_some());

    let (status, _body) = TestServer::json(
        srv.post_json("/api/log/client", json!({ "event": "test_ping" }))
            .await
            .unwrap(),
    )
    .await;
    assert_eq!(status, StatusCode::CREATED);
}

async fn integration_rbac(srv: &TestServer) {
    let owner_session = srv
        .login(OWNER_EMAIL, TEST_PASSWORD, false)
        .await
        .expect("owner login");
    let owner = owner_session.access_token;

    let (status, body) = TestServer::json(srv.get_auth("/api/rbac/me", &owner).await.unwrap()).await;
    assert_eq!(status, StatusCode::OK);
    assert_ok(&body);
    assert_eq!(
        body.get("accessToken").and_then(|v| v.as_str()),
        Some(owner.as_str())
    );

    let (status, body) =
        TestServer::json(srv.get_auth("/api/rbac/users", &owner).await.unwrap()).await;
    assert_eq!(status, StatusCode::OK);
    assert_ok(&body);
    assert!(body.get("users").and_then(|v| v.as_array()).is_some_and(|u| u.len() >= 2));

    let (status, body) = TestServer::json(
        srv.get_auth("/api/rbac/audit?limit=10", &owner)
            .await
            .unwrap(),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_ok(&body);

    let (status, body) = TestServer::json(
        srv.get_auth("/api/rbac/permissions/matrix", &owner)
            .await
            .unwrap(),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_ok(&body);

    let (status, body) = TestServer::json(
        srv.get_auth("/api/config/status", &owner).await.unwrap(),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_ok(&body);
    assert!(body.get("capabilities").and_then(|v| v.as_object()).is_some());

    let (status, body) = TestServer::json(srv.get_auth("/api/aoi", &owner).await.unwrap()).await;
    assert_eq!(status, StatusCode::OK);
    assert!(body.is_array());

    let (status, saved) = TestServer::json(
        srv.post_auth_json(
            "/api/aoi",
            json!({
                "name": "Integration field",
                "geometry": {
                    "type": "Polygon",
                    "coordinates": [[[0.0, 0.0], [1.0, 0.0], [1.0, 1.0], [0.0, 1.0], [0.0, 0.0]]]
                }
            }),
            &owner,
        )
        .await
        .unwrap(),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    let aoi_id = saved.get("id").and_then(|v| v.as_str()).expect("aoi id");

    let (status, body) = TestServer::json(srv.get_auth("/api/aoi", &owner).await.unwrap()).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(body.as_array().map(|a| a.len()), Some(1));

    let (status, body) = TestServer::json(
        srv.delete_auth(&format!("/api/aoi/{aoi_id}"), &owner)
            .await
            .unwrap(),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(body.get("success").and_then(|v| v.as_bool()), Some(true));

    let (status, list_body) = TestServer::json(
        srv.get_auth("/api/rbac/policies", &owner).await.unwrap(),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_ok(&list_body);
    assert!(list_body
        .get("versions")
        .and_then(|v| v.as_array())
        .is_some_and(|rows| !rows.is_empty()));

    let policy_id = list_body
        .get("versions")
        .and_then(|v| v.as_array())
        .and_then(|rows| rows.first())
        .and_then(|row| row.get("id").and_then(|v| v.as_str()))
        .expect("seeded policy version id")
        .to_string();

    let (status, get_body) = TestServer::json(
        srv.get_auth(&format!("/api/rbac/policies/{policy_id}"), &owner)
            .await
            .unwrap(),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_ok(&get_body);

    let (create_status, create_body) = TestServer::json(
        srv.post_auth_json(
            "/api/rbac/policies",
            json!({
                "label": "integration-test",
                "policies": [{
                    "resource_type": "user",
                    "action": "read",
                    "effect": "allow",
                    "priority": 1,
                    "required_relations": [],
                    "required_subject_attributes": {},
                    "required_resource_attributes": {}
                }]
            }),
            &owner,
        )
        .await
        .unwrap(),
    )
    .await;
    assert_eq!(create_status, StatusCode::OK);
    assert_governance_proposal(&create_body);

    let (status, activate_body) = TestServer::json(
        srv.post_auth_json(
            &format!("/api/rbac/policies/{policy_id}/activate"),
            json!({}),
            &owner,
        )
        .await
        .unwrap(),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_governance_proposal(&activate_body);

    for action in ["approve", "suspend", "reactivate"] {
        let (status, body) = TestServer::json(
            srv.post_auth_json(
                &format!("/api/rbac/users/{PENDING_ID}/{action}"),
                json!({}),
                &owner,
            )
            .await
            .unwrap(),
        )
        .await;
        assert_eq!(
            status,
            StatusCode::OK,
            "lifecycle {action}: {body}"
        );
        assert_ok(&body);
    }

    let (status, body) = TestServer::json(
        srv.patch_json(
            "/api/rbac/users/900002",
            json!({ "roleSlug": "viewer" }),
            &owner,
        )
        .await
        .unwrap(),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_ok(&body);

    let (status, _body) = TestServer::json(
        srv.delete_auth("/api/rbac/users/900001", &owner)
            .await
            .unwrap(),
    )
    .await;
    assert_eq!(status, StatusCode::BAD_REQUEST);

    let invite_email = format!("invite-{}@test.local", uuid::Uuid::new_v4());
    let (create_status, create_body) = TestServer::json(
        srv.post_auth_json(
            "/api/rbac/invites",
            json!({ "email": invite_email, "roleSlug": "viewer" }),
            &owner,
        )
        .await
        .unwrap(),
    )
    .await;
    assert_eq!(create_status, StatusCode::CREATED);
    assert_ok(&create_body);

    let invite_token = create_body
        .get("token")
        .and_then(|v| v.as_str())
        .expect("invite token from create response");

    let (status, body) = TestServer::json(
        srv.get(&format!("/api/rbac/invites/preview?token={invite_token}"))
            .await
            .unwrap(),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_ok(&body);

    let (status, body) = TestServer::json(
        srv.post_json(
            "/api/rbac/invites/accept",
            json!({
                "token": invite_token,
                "name": "InvitedUser",
                "password": "InvitePass1!"
            }),
        )
        .await
        .unwrap(),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert!(body.get("access_token").is_some());
}

async fn integration_billing(srv: &TestServer) {
    let member_session = srv
        .login("member@test.local", TEST_PASSWORD, false)
        .await
        .expect("member login");
    let member = member_session.access_token;

    let (status, body) = TestServer::json(
        srv.get_auth("/api/billing/me", &member).await.unwrap(),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_ok(&body);

    let (status, body) = TestServer::json(
        srv.post_auth_json(
            "/api/billing/start-trial",
            json!({ "days": 7 }),
            &member,
        )
        .await
        .unwrap(),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_ok(&body);

    let (status, body) = TestServer::json(
        srv.post_auth_json(
            "/api/billing/activate",
            json!({ "planId": "trial", "payment_completed": true }),
            &member,
        )
        .await
        .unwrap(),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_ok(&body);

    let (status, body) = TestServer::json(
        srv.get_auth("/api/billing/invoices", &member).await.unwrap(),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_ok(&body);
    assert!(body.get("invoices").and_then(|v| v.as_array()).is_some());

    let (status, body) = TestServer::json(
        srv.post_auth_json(
            "/api/billing/payment-intent",
            json!({ "planId": "pro" }),
            &member,
        )
        .await
        .unwrap(),
    )
    .await;
    assert_eq!(status, StatusCode::SERVICE_UNAVAILABLE);
    assert_eq!(
        body.get("error").and_then(|v| v.as_str()),
        Some("stripe_not_configured")
    );

    let (status, body) = TestServer::json(
        srv.post_auth_json(
            "/api/billing/create-checkout-session",
            json!({ "planId": "pro" }),
            &member,
        )
        .await
        .unwrap(),
    )
    .await;
    assert_eq!(status, StatusCode::SERVICE_UNAVAILABLE);
    assert_eq!(
        body.get("error").and_then(|v| v.as_str()),
        Some("stripe_not_configured")
    );

    let (status, body) = TestServer::json(
        srv.post_auth_json(
            "/api/billing/confirm-payment",
            json!({ "planId": "pro", "provider": "stripe" }),
            &member,
        )
        .await
        .unwrap(),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_ok(&body);

    let (status, body) = TestServer::json(
        srv.post_auth_json(
            "/api/billing/bank-transfer",
            json!({ "planId": "pro" }),
            &member,
        )
        .await
        .unwrap(),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_ok(&body);
    assert!(body.get("instructions").is_some());
}

async fn integration_route_smoke(srv: &TestServer) {
    let owner_session = srv
        .login(OWNER_EMAIL, TEST_PASSWORD, false)
        .await
        .expect("owner login");
    let owner = owner_session.access_token;

    for (method, pattern) in IMPLEMENTED_ROUTES {
        if *pattern == "*" {
            continue;
        }
        let path = pattern
            .replace("{id}", "900002")
            .replace("{owner}", "octocat")
            .replace("{repo}", "Hello-World")
            .replace("{provider}", "gemini")
            .replace("{name}", "gemini")
            .replace("{*path}", "v2/directions");
        let resp = match *method {
            "GET" if path == "/health"
                || path.starts_with("/api/billing/plans")
                || (path.starts_with("/api/platform/") && path != "/api/platform/env-health")
                || path.starts_with("/api/config/mapbox")
                || path == "/api/auth/oauth/config"
                || path == "/api/auth/email/status"
                || path == "/api/auth/events"
                || path == "/api/auth/apple"
                || path == "/api/geo/grounding/status"
                || path == "/api/geo/locations"
                || path == "/api/weather/latest"
                || path == "/api/mapbox-proxy"
                || path == "/api/gateway/mapbox/geocoding"
                || path == "/api/gateway/mapbox/proxy"
                || path == "/api/github/status"
                || path == "/api/github/events"
                || path == "/api/github/repos"
                || path.contains("/github/repos/")
                || path.starts_with("/api/google-3d-tiles") =>
            {
                srv.get(&path).await
            }
            "GET" if path == "/api/github/oauth/start"
                || path == "/api/github/oauth/callback"
                || path == "/api/auth/apple/callback" =>
            {
                srv.get_no_redirect(&path).await
            }
            "GET" if path.contains("/invites/preview") || path.contains("/verify-email") => {
                srv.get(&format!("{path}?token=dummy")).await
            }
            "GET" => srv.get_auth(&path, &owner).await,
            "POST" if path.contains("/webhook")
                || path.contains("/auth/login")
                || path.contains("/auth/register")
                || path.contains("/auth/logout")
                || path.contains("/auth/logout-all")
                || path.contains("/invites/accept")
                || path.contains("/auth/refresh")
                || path.contains("/forgot-password")
                || path.contains("/reset-password")
                || path.contains("/resend-verification")
                || path.contains("/forgot-username")
                || path.contains("/geo/grounding/invoke")
                || path.contains("/github/disconnect")
                || path.contains("/auth/send-verification-email")
                || path.contains("/auth/exchange")
                || path == "/api/ai/analyze"
                || path == "/api/ai/chat"
                || path == "/api/geo/locations"
                || path == "/api/log/client"
                || (path.contains("/github/repos/") && path.ends_with("/issues")) =>
            {
                srv.post_json(&path, json!({})).await
            }
            "POST" => srv.post_auth_json(&path, json!({}), &owner).await,
            "PUT" => srv.put_auth_json(&path, json!({ "value": "test-key" }), &owner).await,
            "PATCH" if path.starts_with("/api/rbac/users/") => {
                srv.patch_json(&path, json!({ "roleSlug": "viewer" }), &owner).await
            }
            "PATCH" => srv.patch_json(&path, json!({ "active": true }), &owner).await,
            "DELETE" => srv.delete_auth(&path, &owner).await,
            _ => continue,
        };
        let status = resp.expect("route request").status();
        if (path.contains("/invites/preview") || path.contains("/verify-email"))
            && (status == StatusCode::OK
                || status == StatusCode::NOT_FOUND
                || status == StatusCode::BAD_REQUEST)
        {
            continue;
        }
        if (path.contains("/github/oauth/") || path == "/api/auth/apple/callback")
            && (status.is_redirection()
                || status == StatusCode::INTERNAL_SERVER_ERROR
                || status == StatusCode::UNAUTHORIZED)
        {
            continue;
        }
        if path == "/api/auth/apple" && status == StatusCode::NOT_IMPLEMENTED {
            continue;
        }
        if path.contains("/github/repos/") && status == StatusCode::UNAUTHORIZED {
            continue;
        }
        if (path == "/api/user/api-tokens"
            || path.starts_with("/api/system/tokens")
            || path.contains("/auth/exchange"))
            && (status == StatusCode::SERVICE_UNAVAILABLE
                || status == StatusCode::BAD_REQUEST
                || status == StatusCode::NOT_FOUND)
        {
            continue;
        }
        if path == "/api/log/client" && status == StatusCode::BAD_REQUEST {
            continue;
        }
        if path == "/api/ai/chat"
            && (status == StatusCode::OK
                || status == StatusCode::SERVICE_UNAVAILABLE
                || status == StatusCode::NOT_IMPLEMENTED)
        {
            continue;
        }
        if path == "/api/aoi"
            && (status == StatusCode::OK
                || status == StatusCode::BAD_REQUEST
                || status == StatusCode::NOT_FOUND)
        {
            continue;
        }
        if path.starts_with("/api/aoi/") && status == StatusCode::NOT_FOUND {
            continue;
        }
        assert_ne!(status, StatusCode::NOT_FOUND, "{method} {path}");
    }
}

async fn integration_tenant_isolation(srv: &TestServer) {
    let owner_session = srv
        .login(OWNER_EMAIL, TEST_PASSWORD, false)
        .await
        .expect("owner login");
    let owner = owner_session.access_token;

    let (status, body) =
        TestServer::json(srv.get_auth("/api/rbac/users", &owner).await.unwrap()).await;
    assert_eq!(status, StatusCode::OK);
    assert_ok(&body);
    let users = body
        .get("users")
        .and_then(|v| v.as_array())
        .expect("users array");
    assert!(
        users
            .iter()
            .all(|u| u.get("id").and_then(|v| v.as_str()) != Some(ISOLATED_USER_ID)),
        "isolated tenant user must not appear in default tenant directory"
    );

    let (status, _body) = TestServer::json(
        srv.post_auth_json(
            &format!("/api/rbac/users/{ISOLATED_USER_ID}/approve"),
            json!({}),
            &owner,
        )
        .await
        .unwrap(),
    )
    .await;
    assert_eq!(status, StatusCode::FORBIDDEN);

    let (status, body) = TestServer::json(
        srv.get_auth("/api/rbac/me", &owner).await.unwrap(),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(
        body.get("tenantId").and_then(|v| v.as_str()),
        Some("geosyntra-default")
    );
    let _ = ISOLATED_TENANT_ID;
}

#[tokio::test]
#[ignore = "requires DATABASE_URL and Postgres (scripts/run-api-integration-tests.sh)"]
async fn axum_api_integration_suite() {
    let srv = TestServer::shared().await;
    integration_public_routes(&srv).await;
    integration_rbac(&srv).await;
    integration_tenant_isolation(&srv).await;
    integration_billing(&srv).await;
    integration_route_smoke(&srv).await;
}
