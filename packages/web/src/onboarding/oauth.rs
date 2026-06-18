//! OAuth callback query handling — strip params after read (Task 24.9).

use super::wizard_entry::{parse_wizard_query, read_location_search, replace_location_search, strip_oauth_query};

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct OAuthCallback {
    pub code: Option<String>,
    pub state: Option<String>,
}

pub fn read_oauth_callback(search: &str) -> OAuthCallback {
    let params = parse_wizard_query(search);
    OAuthCallback {
        code: params.oauth_code,
        state: params.oauth_state,
    }
}

pub fn strip_oauth_from_location() {
    let search = read_location_search();
    let next = strip_oauth_query(&search);
    if next != search {
        replace_location_search(&next);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_oauth_code_and_state() {
        let cb = read_oauth_callback("?code=abc&state=xyz&start=1");
        assert_eq!(cb.code.as_deref(), Some("abc"));
        assert_eq!(cb.state.as_deref(), Some("xyz"));
    }

    #[test]
    fn strips_oauth_params() {
        let next = super::super::wizard_entry::strip_oauth_query(
            "?code=abc&state=xyz&start=1",
        );
        assert_eq!(next, "?start=1");
    }
}
