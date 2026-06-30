//! Wizard query params + session intent — parity with React `homeWizardEntry.ts`.

use super::types::{AuthMode, BillingPlanId, WizardLaunch, WizardStep};

pub const WIZARD_INTENT_KEY: &str = "geosyntra-wizard-intent";
pub const WIZARD_INTENT_MAX_AGE_MS: i64 = 120_000;

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct WizardQueryParams {
    pub start: bool,
    pub wizard: Option<String>,
    pub mode: Option<String>,
    pub plan: Option<String>,
    pub upgrade: bool,
    pub checkout_success: bool,
    pub oauth_code: Option<String>,
    pub oauth_state: Option<String>,
}

/// Parse `?start=1&wizard=auth&mode=signup` style query strings (native-testable).
pub fn parse_wizard_query(search: &str) -> WizardQueryParams {
    let qs = search.trim_start_matches('?');
    let mut params = WizardQueryParams::default();
    for pair in qs.split('&').filter(|p| !p.is_empty()) {
        let Some((key, value)) = pair.split_once('=') else {
            continue;
        };
        match key {
            "start" => params.start = value == "1",
            "wizard" => params.wizard = Some(value.to_string()),
            "mode" => params.mode = Some(value.to_string()),
            "plan" => params.plan = Some(value.to_string()),
            "upgrade" => params.upgrade = value == "1",
            "checkout" => params.checkout_success = value == "success",
            "code" => params.oauth_code = Some(value.to_string()),
            "state" => params.oauth_state = Some(value.to_string()),
            _ => {}
        }
    }
    params
}

pub fn home_wizard_search(
    wizard: WizardStep,
    auth_mode: AuthMode,
    upgrade: bool,
    plan_id: Option<BillingPlanId>,
) -> String {
    let wizard_key = match wizard {
        WizardStep::Welcome => "auth",
        WizardStep::Pricing => "pricing",
        WizardStep::Payment => "payment",
        WizardStep::Launch => "launch",
        WizardStep::Activation => "payment",
    };
    let mut parts = vec![
        "start=1".into(),
        format!("wizard={wizard_key}"),
    ];
    if wizard == WizardStep::Welcome {
        let mode = match auth_mode {
            AuthMode::Signup => "signup",
            AuthMode::Signin => "signin",
        };
        parts.push(format!("mode={mode}"));
    }
    if upgrade {
        parts.push("upgrade=1".into());
    }
    if let Some(plan) = plan_id {
        parts.push(format!("plan={}", plan.as_str()));
    }
    format!("?{}", parts.join("&"))
}

pub fn wizard_launch_from_query(params: &WizardQueryParams) -> Option<WizardLaunch> {
    if !params.start && params.wizard.is_none() {
        return None;
    }
    let wizard = params
        .wizard
        .as_deref()
        .map(WizardStep::normalize)
        .unwrap_or(WizardStep::Welcome);
    let auth_mode = params
        .mode
        .as_deref()
        .map(AuthMode::parse)
        .unwrap_or(AuthMode::Signup);
    let plan_id = params.plan.as_deref().and_then(BillingPlanId::parse);
    Some(WizardLaunch {
        wizard,
        auth_mode,
        plan_id,
        upgrade: params.upgrade,
    })
}

pub fn strip_wizard_query(search: &str) -> String {
    let qs = search.trim_start_matches('?');
    let kept: Vec<&str> = qs
        .split('&')
        .filter(|pair| {
            let key = pair.split('=').next().unwrap_or("");
            !matches!(key, "start" | "wizard" | "mode" | "plan" | "upgrade")
        })
        .filter(|p| !p.is_empty())
        .collect();
    if kept.is_empty() {
        String::new()
    } else {
        format!("?{}", kept.join("&"))
    }
}

pub fn strip_oauth_query(search: &str) -> String {
    let qs = search.trim_start_matches('?');
    let kept: Vec<&str> = qs
        .split('&')
        .filter(|pair| {
            let key = pair.split('=').next().unwrap_or("");
            !matches!(
                key,
                "code" | "state" | "scope" | "authuser" | "prompt"
            )
        })
        .filter(|p| !p.is_empty())
        .collect();
    if kept.is_empty() {
        String::new()
    } else {
        format!("?{}", kept.join("&"))
    }
}

#[cfg(all(feature = "web", target_arch = "wasm32"))]
pub fn stash_wizard_intent(launch: &WizardLaunch) {
    let payload = serde_json::json!({
        "wizard": match launch.wizard {
            WizardStep::Welcome => "auth",
            WizardStep::Pricing => "pricing",
            WizardStep::Payment | WizardStep::Activation => "payment",
            WizardStep::Launch => "launch",
        },
        "authMode": match launch.auth_mode {
            AuthMode::Signup => "signup",
            AuthMode::Signin => "signin",
        },
        "upgrade": launch.upgrade,
        "planId": launch.plan_id.map(|p| p.as_str()),
        "ts": now_ms(),
    });
    if let Ok(raw) = serde_json::to_string(&payload) {
        if let Some(window) = web_sys::window() {
            if let Ok(Some(storage)) = window.session_storage() {
                let _ = storage.set_item(WIZARD_INTENT_KEY, &raw);
            }
        }
    }
}

#[cfg(not(all(feature = "web", target_arch = "wasm32")))]
pub fn stash_wizard_intent(_launch: &WizardLaunch) {}

#[cfg(all(feature = "web", target_arch = "wasm32"))]
pub fn consume_wizard_intent() -> Option<WizardLaunch> {
    let window = web_sys::window()?;
    let storage = window.session_storage().ok()??;
    let raw = storage.get_item(WIZARD_INTENT_KEY).ok()??;
    let _ = storage.remove_item(WIZARD_INTENT_KEY);
    let parsed: serde_json::Value = serde_json::from_str(&raw).ok()?;
    let ts = parsed.get("ts")?.as_i64()?;
    if now_ms() - ts > WIZARD_INTENT_MAX_AGE_MS {
        return None;
    }
    let wizard = parsed
        .get("wizard")
        .and_then(|v| v.as_str())
        .map(WizardStep::normalize)
        .unwrap_or(WizardStep::Welcome);
    let auth_mode = parsed
        .get("authMode")
        .and_then(|v| v.as_str())
        .map(AuthMode::parse)
        .unwrap_or(AuthMode::Signup);
    let plan_id = parsed
        .get("planId")
        .and_then(|v| v.as_str())
        .and_then(BillingPlanId::parse);
    let upgrade = parsed.get("upgrade").and_then(|v| v.as_bool()).unwrap_or(false);
    Some(WizardLaunch {
        wizard,
        auth_mode,
        plan_id,
        upgrade,
    })
}

#[cfg(not(all(feature = "web", target_arch = "wasm32")))]
pub fn consume_wizard_intent() -> Option<WizardLaunch> {
    None
}

#[cfg(all(feature = "web", target_arch = "wasm32"))]
pub fn read_location_search() -> String {
    web_sys::window()
        .and_then(|w| w.location().search().ok())
        .unwrap_or_default()
}

#[cfg(not(all(feature = "web", target_arch = "wasm32")))]
pub fn read_location_search() -> String {
    String::new()
}

#[cfg(all(feature = "web", target_arch = "wasm32"))]
pub fn replace_location_search(search: &str) {
    if let Some(window) = web_sys::window() {
        let location = window.location();
        let pathname = location.pathname().unwrap_or_else(|_| "/".into());
        let hash = location.hash().unwrap_or_default();
        let path = format!("{pathname}{search}{hash}");
        if let Ok(history) = window.history() {
            let _ = history.replace_state_with_url(&wasm_bindgen::JsValue::NULL, "", Some(&path));
        }
    }
}

#[cfg(not(all(feature = "web", target_arch = "wasm32")))]
pub fn replace_location_search(_search: &str) {}

fn now_ms() -> i64 {
    crate::wall_clock::now_ms()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_wizard_query_params() {
        let p = parse_wizard_query("?start=1&wizard=auth&mode=signup&plan=trial");
        assert!(p.start);
        assert_eq!(p.wizard.as_deref(), Some("auth"));
        assert_eq!(p.mode.as_deref(), Some("signup"));
        assert_eq!(p.plan.as_deref(), Some("trial"));
    }

    #[test]
    fn builds_home_wizard_search_string() {
        let qs = home_wizard_search(WizardStep::Welcome, AuthMode::Signup, false, Some(BillingPlanId::Trial));
        assert!(qs.contains("start=1"));
        assert!(qs.contains("wizard=auth"));
        assert!(qs.contains("mode=signup"));
        assert!(qs.contains("plan=trial"));
    }

    #[test]
    fn strips_wizard_flags_from_search() {
        assert_eq!(
            strip_wizard_query("?start=1&wizard=auth&mode=signup&checkout=success"),
            "?checkout=success"
        );
    }

    #[test]
    fn wizard_launch_from_query_respects_mode() {
        let params = parse_wizard_query("?start=1&wizard=pricing&mode=signin");
        let launch = wizard_launch_from_query(&params).expect("launch");
        assert_eq!(launch.wizard, WizardStep::Pricing);
        assert_eq!(launch.auth_mode, AuthMode::Signin);
    }
}
