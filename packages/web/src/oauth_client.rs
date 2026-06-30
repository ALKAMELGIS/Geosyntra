//! OAuth popup + code exchange for Google, GitHub, LinkedIn.

use serde::Deserialize;
use serde_json::json;

use crate::{
    api_client::ApiClient,
    auth_api::session_from_user,
    auth_session::AuthSession,
    error_display::ApiError,
};

const OAUTH_STATE_KEY: &str = "geosyntra_oauth_state";
const OAUTH_PROVIDER_KEY: &str = "geosyntra_oauth_provider";
const OAUTH_POPUP_MESSAGE: &str = "geosyntra-oauth-return";

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum OAuthProvider {
    Google,
    Github,
    Linkedin,
}

impl OAuthProvider {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Google => "google",
            Self::Github => "github",
            Self::Linkedin => "linkedin",
        }
    }

    pub fn label(self) -> &'static str {
        match self {
            Self::Google => "Continue with Google",
            Self::Github => "Continue with GitHub",
            Self::Linkedin => "Continue with LinkedIn",
        }
    }
}

#[derive(Debug, Clone, Default, Deserialize)]
pub struct OAuthPublicConfig {
    pub ok: Option<bool>,
    #[serde(default, alias = "redirectUri")]
    pub redirect_uri: Option<String>,
    pub google: Option<OAuthProviderConfig>,
    pub github: Option<OAuthProviderConfig>,
    pub linkedin: Option<OAuthProviderConfig>,
}

#[derive(Debug, Clone, Default, Deserialize)]
pub struct OAuthProviderConfig {
    pub configured: Option<bool>,
    #[serde(default, alias = "clientId")]
    pub client_id: Option<String>,
}

pub fn provider_configured(cfg: &OAuthPublicConfig, provider: OAuthProvider) -> bool {
    match provider {
        OAuthProvider::Google => cfg.google.as_ref().and_then(|g| g.configured).unwrap_or(false),
        OAuthProvider::Github => cfg.github.as_ref().and_then(|g| g.configured).unwrap_or(false),
        OAuthProvider::Linkedin => cfg.linkedin.as_ref().and_then(|g| g.configured).unwrap_or(false),
    }
}

pub async fn load_oauth_config() -> Result<OAuthPublicConfig, ApiError> {
    let client = ApiClient::from_env();
    client.get_json("/api/auth/oauth/config", None).await
}

fn oauth_redirect_uri(cfg: &OAuthPublicConfig) -> String {
    #[cfg(all(feature = "web", target_arch = "wasm32"))]
    {
        if let Some(window) = web_sys::window() {
            let hostname = window.location().hostname().unwrap_or_default();
            if hostname == "localhost" || hostname == "127.0.0.1" {
                let origin = window.location().origin().unwrap_or_default();
                let pathname = window.location().pathname().unwrap_or_else(|_| "/".into());
                let base = pathname.trim_end_matches('/').to_string();
                if base.is_empty() {
                    return format!("{origin}/oauth-return.html");
                }
                return format!("{origin}{base}/oauth-return.html");
            }
        }
    }
    if let Some(uri) = cfg.redirect_uri.as_deref().filter(|s| !s.is_empty()) {
        return uri.to_string();
    }
    #[cfg(all(feature = "web", target_arch = "wasm32"))]
    {
        if let Some(window) = web_sys::window() {
            let origin = window.location().origin().unwrap_or_default();
            let pathname = window.location().pathname().unwrap_or_else(|_| "/".into());
            let base = pathname.trim_end_matches('/').to_string();
            if base.is_empty() {
                return format!("{origin}/oauth-return.html");
            }
            return format!("{origin}{base}/oauth-return.html");
        }
    }
    "http://127.0.0.1:8080/oauth-return.html".into()
}

fn remember_oauth_handshake(provider: OAuthProvider, state: &str) {
    #[cfg(all(feature = "web", target_arch = "wasm32"))]
    {
        if let Some(window) = web_sys::window() {
            if let Ok(Some(storage)) = window.session_storage() {
                let _ = storage.set_item(OAUTH_STATE_KEY, state);
                let _ = storage.set_item(OAUTH_PROVIDER_KEY, provider.as_str());
            }
        }
    }
    let _ = (provider, state);
}

fn read_stored_oauth_provider() -> Option<OAuthProvider> {
    #[cfg(all(feature = "web", target_arch = "wasm32"))]
    {
        if let Some(window) = web_sys::window() {
            if let Ok(Some(storage)) = window.session_storage() {
                if let Ok(Some(raw)) = storage.get_item(OAUTH_PROVIDER_KEY) {
                    return match raw.as_str() {
                        "google" => Some(OAuthProvider::Google),
                        "github" => Some(OAuthProvider::Github),
                        "linkedin" => Some(OAuthProvider::Linkedin),
                        _ => None,
                    };
                }
            }
        }
    }
    None
}

fn oauth_state_valid(received: Option<&str>) -> bool {
    #[cfg(all(feature = "web", target_arch = "wasm32"))]
    {
        if let Some(window) = web_sys::window() {
            if let Ok(Some(storage)) = window.session_storage() {
                if let Ok(Some(expected)) = storage.get_item(OAUTH_STATE_KEY) {
                    if expected.is_empty() {
                        return true;
                    }
                    return received.map(str::trim) == Some(expected.as_str());
                }
            }
        }
    }
    let _ = received;
    true
}

fn clear_oauth_handshake() {
    #[cfg(all(feature = "web", target_arch = "wasm32"))]
    {
        if let Some(window) = web_sys::window() {
            if let Ok(Some(storage)) = window.session_storage() {
                let _ = storage.remove_item(OAUTH_STATE_KEY);
                let _ = storage.remove_item(OAUTH_PROVIDER_KEY);
            }
        }
    }
}

pub fn authorization_url(cfg: &OAuthPublicConfig, provider: OAuthProvider) -> Option<String> {
    let redirect = oauth_redirect_uri(cfg);
    let state = format!("{}-{}", provider.as_str(), uuid_simple());
    remember_oauth_handshake(provider, &state);

    match provider {
        OAuthProvider::Google => {
            let client_id = cfg.google.as_ref()?.client_id.as_ref()?.trim();
            if client_id.is_empty() {
                return None;
            }
            Some(format!(
                "https://accounts.google.com/o/oauth2/v2/auth?client_id={}&redirect_uri={}&response_type=code&scope=openid%20email%20profile&access_type=online&prompt=select_account&state={}",
                urlencoding_encode(client_id),
                urlencoding_encode(&redirect),
                urlencoding_encode(&state),
            ))
        }
        OAuthProvider::Github => {
            let client_id = cfg.github.as_ref()?.client_id.as_ref()?.trim();
            if client_id.is_empty() {
                return None;
            }
            Some(format!(
                "https://github.com/login/oauth/authorize?client_id={}&redirect_uri={}&scope=read:user%20user:email&state={}&allow_signup=true",
                urlencoding_encode(client_id),
                urlencoding_encode(&redirect),
                urlencoding_encode(&state),
            ))
        }
        OAuthProvider::Linkedin => {
            let client_id = cfg.linkedin.as_ref()?.client_id.as_ref()?.trim();
            if client_id.is_empty() {
                return None;
            }
            Some(format!(
                "https://www.linkedin.com/oauth/v2/authorization?response_type=code&client_id={}&redirect_uri={}&scope=openid%20profile%20email&state={}",
                urlencoding_encode(client_id),
                urlencoding_encode(&redirect),
                urlencoding_encode(&state),
            ))
        }
    }
}

fn urlencoding_encode(s: &str) -> String {
    urlencoding::encode(s).into_owned()
}

fn uuid_simple() -> String {
    format!("{}-{}", js_now(), rand_suffix())
}

fn js_now() -> u64 {
    #[cfg(all(feature = "web", target_arch = "wasm32"))]
    {
        js_sys::Date::now() as u64
    }
    #[cfg(not(all(feature = "web", target_arch = "wasm32")))]
    {
        0
    }
}

fn rand_suffix() -> u64 {
    (js_now() % 1_000_000) ^ 0x9e37
}

#[derive(Debug, Deserialize)]
struct ExchangeResponse {
    ok: Option<bool>,
    email: Option<String>,
    name: Option<String>,
    sub: Option<String>,
    error: Option<String>,
    message: Option<String>,
}

async fn exchange_code(
    provider: OAuthProvider,
    code: &str,
    redirect_uri: &str,
) -> Result<(String, String, String), String> {
    let path = match provider {
        OAuthProvider::Google => "/api/auth/google/exchange",
        OAuthProvider::Github => "/api/auth/github/exchange",
        OAuthProvider::Linkedin => "/api/auth/linkedin/exchange",
    };
    let client = ApiClient::from_env();
    let body = json!({ "code": code, "redirect_uri": redirect_uri });
    let data: ExchangeResponse = client
        .post_json(path, &body, None)
        .await
        .map_err(|e| e.user_message())?;
    if data.ok != Some(true) {
        return Err(data
            .message
            .or(data.error)
            .unwrap_or_else(|| "OAuth exchange failed".into()));
    }
    let email = data.email.unwrap_or_default();
    if email.is_empty() {
        return Err("Provider did not return an email.".into());
    }
    let name = data.name.unwrap_or_else(|| email.clone());
    let sub = data.sub.unwrap_or_default();
    if sub.is_empty() {
        return Err("Provider did not return a subject id.".into());
    }
    Ok((email, name, sub))
}

async fn oauth_upsert(
    email: &str,
    name: &str,
    provider: OAuthProvider,
    sub: &str,
    remember: bool,
) -> Result<AuthSession, String> {
    let client = ApiClient::from_env();
    let body = json!({
        "email": email,
        "name": name,
        "provider": provider.as_str(),
        "sub": sub,
        "remember": remember,
    });
    #[derive(Deserialize)]
    struct UpsertResponse {
        user: Option<crate::auth_api::LoginUserRaw>,
        #[serde(default, alias = "accessToken")]
        access_token: Option<String>,
        #[serde(default, alias = "refreshToken")]
        refresh_token: Option<String>,
        error: Option<String>,
        message: Option<String>,
    }
    let data: UpsertResponse = client
        .post_json("/api/auth/oauth-upsert", &body, None)
        .await
        .map_err(|e| e.user_message())?;
    if let Some(err) = data.error {
        return Err(data.message.unwrap_or(err));
    }
    let user = data
        .user
        .ok_or_else(|| "OAuth sign-in did not return a user.".to_string())?;
    let access = data
        .access_token
        .ok_or_else(|| "OAuth sign-in did not return a token.".to_string())?;
    Ok(session_from_user(user, access, data.refresh_token))
}

pub async fn complete_oauth_with_code(
    code: &str,
    state: Option<&str>,
    remember: bool,
) -> Result<AuthSession, String> {
    if code.trim().is_empty() {
        return Err("Sign-in did not return an authorization code.".into());
    }
    if !oauth_state_valid(state) {
        clear_oauth_handshake();
        return Err("Sign-in was interrupted. Please try again.".into());
    }
    let provider = read_stored_oauth_provider().unwrap_or(OAuthProvider::Google);
    let cfg = load_oauth_config()
        .await
        .map_err(|e| e.user_message())?;
    let redirect = oauth_redirect_uri(&cfg);
    let (email, name, sub) = exchange_code(provider, code.trim(), &redirect).await?;
    clear_oauth_handshake();
    oauth_upsert(&email, &name, provider, &sub, remember).await
}

#[cfg(all(feature = "web", target_arch = "wasm32"))]
async fn open_oauth_popup(url: &str) -> Result<(String, Option<String>), String> {
    use std::{cell::RefCell, rc::Rc};
    use wasm_bindgen::{closure::Closure, JsCast, JsValue};
    use wasm_bindgen_futures::JsFuture;
    use web_sys::MessageEvent;

    let window = web_sys::window().ok_or("Browser window unavailable.")?;
    let origin = window.location().origin().unwrap_or_default();
    let features = "popup=yes,width=520,height=640";
    let popup = window
        .open_with_url_and_target_and_features(url, "geosyntra_oauth", features)
        .map_err(|_| "Could not open sign-in popup.")?
        .ok_or("Popup blocked. Allow popups or try again.")?;

    let popup = Rc::new(RefCell::new(popup));
    let result: Rc<RefCell<Option<Result<(String, Option<String>), String>>>> =
        Rc::new(RefCell::new(None));
    let result_clone = result.clone();
    let popup_for_message = popup.clone();

    let on_message = Closure::<dyn FnMut(MessageEvent)>::new(move |event: MessageEvent| {
        if event.origin() != origin {
            return;
        }
        let data = event.data();
        if !js_sys::Reflect::has(&data, &JsValue::from_str("type")).unwrap_or(false) {
            return;
        }
        let ty = js_sys::Reflect::get(&data, &JsValue::from_str("type"))
            .ok()
            .and_then(|v| v.as_string())
            .unwrap_or_default();
        if ty != OAUTH_POPUP_MESSAGE {
            return;
        }
        let _ = popup_for_message.borrow().close();
        let err = js_sys::Reflect::get(&data, &JsValue::from_str("error"))
            .ok()
            .and_then(|v| v.as_string())
            .unwrap_or_default();
        if !err.is_empty() {
            *result_clone.borrow_mut() = Some(Err(err));
            return;
        }
        let code = js_sys::Reflect::get(&data, &JsValue::from_str("code"))
            .ok()
            .and_then(|v| v.as_string())
            .unwrap_or_default();
        let state = js_sys::Reflect::get(&data, &JsValue::from_str("state"))
            .ok()
            .and_then(|v| v.as_string());
        if code.trim().is_empty() {
            *result_clone.borrow_mut() =
                Some(Err("Sign-in did not return an authorization code.".into()));
        } else {
            *result_clone.borrow_mut() = Some(Ok((code, state)));
        }
    });

    window
        .add_event_listener_with_callback("message", on_message.as_ref().unchecked_ref())
        .map_err(|_| "Could not listen for OAuth callback.")?;
    on_message.forget();

    for _ in 0..600 {
        if result.borrow().is_some() {
            break;
        }
        if popup.borrow().closed().unwrap_or(true) {
            if result.borrow().is_none() {
                *result.borrow_mut() = Some(Err("Sign-in cancelled.".into()));
            }
            break;
        }
        if let Some(window) = web_sys::window() {
            let promise = js_sys::Promise::new(&mut |resolve, _| {
                let _ = window.set_timeout_with_callback_and_timeout_and_arguments_0(&resolve, 200);
            });
            let _ = JsFuture::from(promise).await;
        }
    }

    let final_result = {
        let mut guard = result.borrow_mut();
        guard.take()
    };
    match final_result {
        Some(value) => value,
        None => Err("Sign-in timed out.".into()),
    }
}

#[cfg(not(all(feature = "web", target_arch = "wasm32")))]
async fn open_oauth_popup(_url: &str) -> Result<(String, Option<String>), String> {
    Err("OAuth sign-in is only available in the browser.".into())
}

pub async fn start_oauth_sign_in(
    provider: OAuthProvider,
    remember: bool,
) -> Result<AuthSession, String> {
    let cfg = load_oauth_config()
        .await
        .map_err(|e| e.user_message())?;
    if !provider_configured(&cfg, provider) {
        return Err(format!(
            "{} is not configured on the API server. Set client ID and secret in your environment.",
            provider.label()
        ));
    }
    let url = authorization_url(&cfg, provider)
        .ok_or_else(|| format!("Could not build {} authorization URL.", provider.label()))?;

    #[cfg(all(feature = "web", target_arch = "wasm32"))]
    {
        match open_oauth_popup(&url).await {
            Ok((code, state)) => {
                return complete_oauth_with_code(&code, state.as_deref(), remember).await;
            }
            Err(err) if err.contains("Popup blocked") || err.contains("popup_blocked") => {
                if let Some(window) = web_sys::window() {
                    let _ = window.location().assign(&url);
                }
                return Err(String::new());
            }
            Err(err) if err.is_empty() || err.contains("cancelled") => return Err(String::new()),
            Err(err) => return Err(err),
        }
    }

    #[cfg(not(all(feature = "web", target_arch = "wasm32")))]
    {
        let _ = (provider, remember, url);
        Err("OAuth sign-in is only available in the browser.".into())
    }
}
