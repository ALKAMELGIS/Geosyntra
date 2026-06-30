use serde::de::DeserializeOwned;
use serde_json::Value;

use crate::error_display::ApiError;

#[derive(Clone, Debug)]
pub struct ApiClient {
    base: String,
}

impl ApiClient {
    pub fn from_env() -> Self {
        Self {
            base: crate::default_api_base(),
        }
    }

    pub fn with_base(base: impl Into<String>) -> Self {
        Self { base: base.into() }
    }

    pub fn base(&self) -> &str {
        &self.base
    }

    pub async fn get_json<T: DeserializeOwned>(
        &self,
        path: &str,
        token: Option<&str>,
    ) -> Result<T, ApiError> {
        let url = self.url(path);
        let resp = request("GET", &url, token, None).await?;
        decode(status_code(&resp), response_text(resp).await?)
    }

    pub async fn post_json<T: DeserializeOwned>(
        &self,
        path: &str,
        body: &Value,
        token: Option<&str>,
    ) -> Result<T, ApiError> {
        let url = self.url(path);
        let resp = request("POST", &url, token, Some(body)).await?;
        decode(status_code(&resp), response_text(resp).await?)
    }

    pub async fn patch_json<T: DeserializeOwned>(
        &self,
        path: &str,
        body: &Value,
        token: Option<&str>,
    ) -> Result<T, ApiError> {
        let url = self.url(path);
        let resp = request("PATCH", &url, token, Some(body)).await?;
        decode(status_code(&resp), response_text(resp).await?)
    }

    pub async fn put_json<T: DeserializeOwned>(
        &self,
        path: &str,
        body: &Value,
        token: Option<&str>,
    ) -> Result<T, ApiError> {
        let url = self.url(path);
        let resp = request("PUT", &url, token, Some(body)).await?;
        decode(status_code(&resp), response_text(resp).await?)
    }

    pub async fn delete_json<T: DeserializeOwned>(
        &self,
        path: &str,
        token: Option<&str>,
    ) -> Result<T, ApiError> {
        let url = self.url(path);
        let resp = request("DELETE", &url, token, None).await?;
        decode(status_code(&resp), response_text(resp).await?)
    }

    pub async fn post_empty<T: DeserializeOwned>(
        &self,
        path: &str,
        token: Option<&str>,
    ) -> Result<T, ApiError> {
        self.post_json(path, &Value::Object(Default::default()), token)
            .await
    }

    pub async fn health(&self) -> Result<(), ApiError> {
        let url = self.url("/health");
        let resp = request("GET", &url, None, None).await?;
        let status = status_code(&resp);
        if (200..300).contains(&status) {
            Ok(())
        } else {
            Err(ApiError::Http {
                status,
                message: format!("health check failed: {url}"),
            })
        }
    }

    fn url(&self, path: &str) -> String {
        if path.starts_with("http://") || path.starts_with("https://") {
            return path.to_string();
        }
        let p = path.trim_start_matches('/');
        if self.base.is_empty() {
            return format!("/{p}");
        }
        format!("{}/{}", self.base.trim_end_matches('/'), p)
    }
}

fn decode<T: DeserializeOwned>(status: u16, text: String) -> Result<T, ApiError> {
    if !(200..300).contains(&status) {
        return Err(ApiError::from_body(status, &text));
    }
    serde_json::from_str(&text).map_err(|err| ApiError::Parse {
        message: format!("invalid JSON: {err}"),
    })
}

#[cfg(not(target_arch = "wasm32"))]
mod native {
    use std::sync::OnceLock;

    use reqwest::Client;
    use serde_json::Value;

    use super::ApiError;

    static HTTP: OnceLock<Client> = OnceLock::new();

    fn client() -> &'static Client {
        HTTP.get_or_init(|| {
            Client::builder()
                .user_agent("geosyntra-web/0.1")
                .build()
                .expect("reqwest client")
        })
    }

    pub async fn request(
        method: &str,
        url: &str,
        token: Option<&str>,
        body: Option<&Value>,
    ) -> Result<reqwest::Response, ApiError> {
        let mut req = match method {
            "GET" => client().get(url),
            "POST" => client().post(url),
            "PUT" => client().put(url),
            "PATCH" => client().patch(url),
            "DELETE" => client().delete(url),
            other => {
                return Err(ApiError::Http {
                    status: 0,
                    message: format!("unsupported method: {other}"),
                })
            }
        };
        if let Some(token) = token {
            req = req.bearer_auth(token);
        }
        if let Some(body) = body {
            req = req.json(body);
        }
        req.send().await.map_err(ApiError::network)
    }

    pub fn status_code(resp: &reqwest::Response) -> u16 {
        resp.status().as_u16()
    }

    pub async fn response_text(resp: reqwest::Response) -> Result<String, ApiError> {
        resp.text().await.map_err(ApiError::network)
    }
}

#[cfg(target_arch = "wasm32")]
mod wasm {
    use gloo_net::http::Request;
    use serde_json::Value;

    use super::ApiError;

    pub struct HttpResponse {
        status: u16,
        text: String,
    }

    pub async fn request(
        method: &str,
        url: &str,
        token: Option<&str>,
        body: Option<&Value>,
    ) -> Result<HttpResponse, ApiError> {
        let mut req = match method {
            "GET" => Request::get(url),
            "POST" => Request::post(url),
            "PUT" => Request::put(url),
            "PATCH" => Request::patch(url),
            "DELETE" => Request::delete(url),
            other => {
                return Err(ApiError::Http {
                    status: 0,
                    message: format!("unsupported method: {other}"),
                })
            }
        };

        req = req.header("Accept", "application/json");
        if body.is_some() {
            req = req.header("Content-Type", "application/json");
        }
        if let Some(token) = token {
            req = req.header("Authorization", &format!("Bearer {token}"));
        }

        let resp = if let Some(body) = body {
            req.body(serde_json::to_string(body).map_err(|err| ApiError::Parse {
                message: err.to_string(),
            })?)
            .map_err(|err| ApiError::Http {
                status: 0,
                message: err.to_string(),
            })?
            .send()
            .await
        } else {
            req.send().await
        }
        .map_err(|err| ApiError::Http {
            status: 0,
            message: err.to_string(),
        })?;

        let status = resp.status();
        let text = resp.text().await.map_err(|err| ApiError::Http {
            status,
            message: err.to_string(),
        })?;

        Ok(HttpResponse { status, text })
    }

    pub fn status_code(resp: &HttpResponse) -> u16 {
        resp.status
    }

    pub async fn response_text(resp: HttpResponse) -> Result<String, ApiError> {
        Ok(resp.text)
    }
}

#[cfg(not(target_arch = "wasm32"))]
use native::{request, response_text, status_code};

#[cfg(target_arch = "wasm32")]
use wasm::{request, response_text, status_code};

#[cfg(test)]
mod tests {
    use super::ApiClient;

    #[test]
    fn builds_api_urls() {
        let client = ApiClient::with_base("http://127.0.0.1:3003");
        assert_eq!(client.url("/health"), "http://127.0.0.1:3003/health");
        assert_eq!(client.url("api/auth/login"), "http://127.0.0.1:3003/api/auth/login");
    }

    #[test]
    fn relative_urls_when_base_empty() {
        let client = ApiClient::with_base("");
        assert_eq!(client.url("/api/auth/login"), "/api/auth/login");
    }
}
