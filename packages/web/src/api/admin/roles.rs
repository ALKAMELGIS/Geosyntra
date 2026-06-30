use serde::Deserialize;

use crate::{api_client::ApiClient, error_display::ApiError};

#[derive(Debug, Clone, Deserialize, PartialEq)]
pub struct MatrixRoleRow {
    pub role: String,
    pub permissions: Vec<String>,
    pub rank: Option<u32>,
}

#[derive(Debug, Deserialize)]
struct MatrixResponse {
    matrix: Vec<MatrixRoleRow>,
}

pub async fn list_matrix(token: &str) -> Result<Vec<MatrixRoleRow>, ApiError> {
    let client = ApiClient::from_env();
    let data: MatrixResponse = client
        .get_json("/api/rbac/permissions/matrix", Some(token))
        .await?;
    let mut rows = data.matrix;
    rows.sort_by(|a, b| {
        b.rank
            .unwrap_or(0)
            .cmp(&a.rank.unwrap_or(0))
            .then_with(|| a.role.cmp(&b.role))
    });
    Ok(rows)
}

pub fn role_display_label(slug: &str) -> String {
    match slug {
        "owner" => "Owner".into(),
        "admin" => "Admin".into(),
        "manager" => "Manager".into(),
        "analyst" => "Analyst".into(),
        "ai_operator" => "AI Operator".into(),
        "viewer" => "Viewer".into(),
        "trial_user" => "Trial User".into(),
        "user" => "Viewer".into(),
        "super_admin" => "Super Admin".into(),
        other => other
            .split('_')
            .map(|part| {
                let mut chars = part.chars();
                match chars.next() {
                    None => String::new(),
                    Some(first) => first.to_uppercase().chain(chars).collect(),
                }
            })
            .collect::<Vec<_>>()
            .join(" "),
    }
}
