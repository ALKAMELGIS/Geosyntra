use serde::Deserialize;

use crate::{api_client::ApiClient, error_display::ApiError};

#[derive(Debug, Clone, Deserialize, PartialEq)]
pub struct GitHubStatus {
    pub connected: Option<bool>,
    pub scope: Option<String>,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Deserialize, PartialEq)]
pub struct GitHubRepo {
    pub id: Option<u64>,
    #[serde(rename = "full_name")]
    pub full_name: Option<String>,
    #[serde(rename = "html_url")]
    pub html_url: Option<String>,
    #[serde(default)]
    pub private: Option<bool>,
}

#[derive(Debug, Clone, Deserialize, PartialEq)]
pub struct GitHubIssue {
    pub id: Option<u64>,
    pub number: Option<u64>,
    pub title: Option<String>,
    #[serde(rename = "html_url")]
    pub html_url: Option<String>,
    pub state: Option<String>,
    #[serde(default, rename = "pull_request")]
    pub pull_request: Option<serde_json::Value>,
}

#[derive(Debug, Clone, Deserialize, PartialEq)]
pub struct GitHubPull {
    pub id: Option<u64>,
    pub number: Option<u64>,
    pub title: Option<String>,
    #[serde(rename = "html_url")]
    pub html_url: Option<String>,
    pub state: Option<String>,
}

#[derive(Debug, Deserialize)]
struct StatusResponse {
    connected: Option<bool>,
    scope: Option<String>,
    error: Option<String>,
}

#[derive(Debug, Deserialize)]
struct ItemsResponse<T> {
    items: Option<Vec<T>>,
    scope: Option<String>,
    error: Option<String>,
}

pub async fn github_status() -> Result<GitHubStatus, ApiError> {
    let client = ApiClient::from_env();
    let data: StatusResponse = client.get_json("/api/github/status", None).await?;
    Ok(GitHubStatus {
        connected: data.connected,
        scope: data.scope,
        error: data.error,
    })
}

pub async fn github_repos() -> Result<Vec<GitHubRepo>, ApiError> {
    let client = ApiClient::from_env();
    let data: ItemsResponse<GitHubRepo> = client.get_json("/api/github/repos", None).await?;
    Ok(data.items.unwrap_or_default())
}

pub async fn github_issues(owner: &str, repo: &str) -> Result<Vec<GitHubIssue>, ApiError> {
    let client = ApiClient::from_env();
    let path = format!(
        "/api/github/repos/{}/{}/issues",
        urlencoding::encode(owner),
        urlencoding::encode(repo)
    );
    let data: ItemsResponse<GitHubIssue> = client.get_json(&path, None).await?;
    Ok(data
        .items
        .unwrap_or_default()
        .into_iter()
        .filter(|i| i.pull_request.is_none())
        .collect())
}

pub async fn github_pulls(owner: &str, repo: &str) -> Result<Vec<GitHubPull>, ApiError> {
    let client = ApiClient::from_env();
    let path = format!(
        "/api/github/repos/{}/{}/pulls",
        urlencoding::encode(owner),
        urlencoding::encode(repo)
    );
    let data: ItemsResponse<GitHubPull> = client.get_json(&path, None).await?;
    Ok(data.items.unwrap_or_default())
}

pub fn oauth_start_url() -> String {
    let base = crate::default_api_base();
    if base.is_empty() {
        "/api/github/oauth/start".into()
    } else {
        format!("{}/api/github/oauth/start", base.trim_end_matches('/'))
    }
}
