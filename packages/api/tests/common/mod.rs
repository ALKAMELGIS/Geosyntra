//! Shared harness: Axum TCP server + reqwest client for integration tests.

use std::time::Duration;

use geosyntra_api::integration_seed::prepare_integration_database;
use once_cell::sync::OnceCell;
use reqwest::{Client, StatusCode};
use serde_json::{json, Value};
use tokio::net::TcpListener;
use tokio::sync::oneshot;

pub use geosyntra_api::integration_seed::{
    ISOLATED_TENANT_ID, ISOLATED_USER_ID, OWNER_EMAIL, PENDING_EMAIL, PENDING_ID, TEST_PASSWORD,
};

static SERVER: OnceCell<(String, Client, Client)> = OnceCell::new();
static SERVER_INIT: std::sync::Mutex<()> = std::sync::Mutex::new(());

pub struct TestServer {
    pub base_url: String,
    pub client: Client,
    no_redirect_client: Client,
}

pub struct AuthSession {
    pub access_token: String,
    pub refresh_token: Option<String>,
}

impl TestServer {
    pub async fn shared() -> Self {
        if let Some((base_url, client, no_redirect_client)) = SERVER.get() {
            return Self {
                base_url: base_url.clone(),
                client: client.clone(),
                no_redirect_client: no_redirect_client.clone(),
            };
        }

        let _init_guard = SERVER_INIT
            .lock()
            .expect("integration server init mutex poisoned");
        if let Some((base_url, client, no_redirect_client)) = SERVER.get() {
            return Self {
                base_url: base_url.clone(),
                client: client.clone(),
                no_redirect_client: no_redirect_client.clone(),
            };
        }

        let database_url = std::env::var("DATABASE_URL").unwrap_or_else(|_| {
            "postgres://geosyntra:geosyntra@127.0.0.1:5433/geosyntra_dev".into()
        });

        unsafe {
            std::env::set_var("JWT_SECRET", "geosyntra-integration-test-secret");
            std::env::set_var("RBAC_JWT_SECRET", "geosyntra-integration-test-secret");
            std::env::set_var("AUTH_RATE_LIMIT_MAX", "100000");
        }

        let listener = TcpListener::bind("127.0.0.1:0")
            .await
            .expect("bind test port");
        let addr = listener.local_addr().expect("local addr");
        let base_url = format!("http://{addr}");
        let (ready_tx, ready_rx) = oneshot::channel();

        std::thread::spawn(move || {
            let rt = tokio::runtime::Builder::new_multi_thread()
                .enable_all()
                .build()
                .expect("integration server runtime");
            rt.block_on(async move {
                let pool = prepare_integration_database(&database_url)
                    .await
                    .expect("prepare integration database");
                let router =
                    geosyntra_api::build_router(geosyntra_api::build_app_state(pool).await);
                ready_tx.send(()).ok();
                axum::serve(listener, router)
                    .await
                    .expect("axum serve failed");
            });
        });

        ready_rx
            .await
            .expect("integration server failed to start");
        wait_for_server(&base_url).await;

        let client = Client::builder()
            .timeout(Duration::from_secs(30))
            .build()
            .expect("reqwest client");
        let no_redirect_client = Client::builder()
            .redirect(reqwest::redirect::Policy::none())
            .timeout(Duration::from_secs(30))
            .build()
            .expect("reqwest no-redirect client");
        SERVER
            .set((
                base_url.clone(),
                client.clone(),
                no_redirect_client.clone(),
            ))
            .ok();
        Self {
            base_url,
            client,
            no_redirect_client,
        }
    }

    fn url(&self, path: &str) -> String {
        format!("{}{}", self.base_url, path)
    }

    pub async fn get(&self, path: &str) -> reqwest::Result<reqwest::Response> {
        self.client.get(self.url(path)).send().await
    }

    pub async fn get_no_redirect(&self, path: &str) -> reqwest::Result<reqwest::Response> {
        self.no_redirect_client.get(self.url(path)).send().await
    }

    pub async fn post_json(
        &self,
        path: &str,
        body: Value,
    ) -> reqwest::Result<reqwest::Response> {
        self.client
            .post(self.url(path))
            .json(&body)
            .send()
            .await
    }

    pub async fn patch_json(
        &self,
        path: &str,
        body: Value,
        token: &str,
    ) -> reqwest::Result<reqwest::Response> {
        self.client
            .patch(self.url(path))
            .bearer_auth(token)
            .json(&body)
            .send()
            .await
    }

    pub async fn delete_auth(
        &self,
        path: &str,
        token: &str,
    ) -> reqwest::Result<reqwest::Response> {
        self.client
            .delete(self.url(path))
            .bearer_auth(token)
            .send()
            .await
    }

    pub async fn get_auth(&self, path: &str, token: &str) -> reqwest::Result<reqwest::Response> {
        self.client
            .get(self.url(path))
            .bearer_auth(token)
            .send()
            .await
    }

    pub async fn post_auth_json(
        &self,
        path: &str,
        body: Value,
        token: &str,
    ) -> reqwest::Result<reqwest::Response> {
        self.client
            .post(self.url(path))
            .bearer_auth(token)
            .json(&body)
            .send()
            .await
    }

    pub async fn put_auth_json(
        &self,
        path: &str,
        body: Value,
        token: &str,
    ) -> reqwest::Result<reqwest::Response> {
        self.client
            .put(self.url(path))
            .bearer_auth(token)
            .json(&body)
            .send()
            .await
    }

    pub async fn login(
        &self,
        email: &str,
        password: &str,
        remember: bool,
    ) -> reqwest::Result<AuthSession> {
        let resp = self
            .post_json(
                "/api/auth/login",
                json!({ "email": email, "password": password, "remember": remember }),
            )
            .await?;
        let status = resp.status();
        let body: Value = resp.json().await?;
        assert!(
            status.is_success(),
            "login failed ({status}): {body}"
        );
        Ok(AuthSession {
            access_token: body
                .get("access_token")
                .and_then(|v| v.as_str())
                .expect("access_token")
                .to_string(),
            refresh_token: body
                .get("refresh_token")
                .and_then(|v| v.as_str())
                .map(str::to_string),
        })
    }

    pub async fn text(resp: reqwest::Response) -> (StatusCode, String) {
        let status = resp.status();
        let body = resp.text().await.unwrap_or_default();
        (status, body)
    }

    pub async fn json(resp: reqwest::Response) -> (StatusCode, Value) {
        let status = resp.status();
        let body: Value = resp.json().await.unwrap_or(json!({}));
        (status, body)
    }
}

async fn wait_for_server(base_url: &str) {
    let client = Client::builder().build().expect("health client");
    for _ in 0..50 {
        if let Ok(resp) = client.get(format!("{base_url}/health")).send().await
            && resp.status().is_success()
        {
            return;
        }
        tokio::time::sleep(Duration::from_millis(100)).await;
    }
    panic!("Axum integration server did not become ready at {base_url}");
}

pub fn assert_ok(body: &Value) {
    assert_eq!(
        body.get("ok").and_then(|v| v.as_bool()),
        Some(true),
        "expected ok:true body: {body}"
    );
}

pub fn assert_governance_proposal(body: &Value) {
    assert_ok(body);
    assert_eq!(
        body.get("governanceRequired").and_then(|v| v.as_bool()),
        Some(true),
        "expected governanceRequired body: {body}"
    );
    assert!(
        body.get("proposalId")
            .and_then(|v| v.as_str())
            .is_some_and(|id| !id.is_empty()),
        "expected proposalId body: {body}"
    );
}
