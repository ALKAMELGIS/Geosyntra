//! Public vs protected route classification (Task 24.1).

/// Paths reachable without `app.access` (React `isSaasPublicPath` subset).
pub fn is_public_path(path: &str) -> bool {
    let path = path.trim_end_matches('/');
    matches!(
        path,
        "" | "/"
            | "/learn-more"
            | "/login"
            | "/join-team"
            | "/app/auth/login"
            | "/app/auth/register"
            | "/app/auth/verify-email"
            | "/app/auth/reset-password"
            | "/app/auth/oauth-callback"
            | "/app/billing/pricing"
            | "/app/onboarding/trial-start"
    ) || path.starts_with("/join-team")
}

pub fn requires_app_access(path: &str) -> bool {
    !is_public_path(path)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn root_is_public() {
        assert!(is_public_path("/"));
        assert!(!requires_app_access("/"));
    }

    #[test]
    fn dashboard_requires_access() {
        assert!(!is_public_path("/dashboard"));
        assert!(requires_app_access("/dashboard"));
    }

    #[test]
    fn login_is_public() {
        assert!(is_public_path("/login"));
    }
}
