use dioxus::prelude::*;

use crate::{
    api::billing,
    auth_session::{AuthContext, AuthSession},
    routes::Route,
    workspace::{
        activate_paid_workspace, activate_trial_workspace, default_workspace_route,
        ensure_platform_owner_workspace, is_platform_owner, read_workspace_state,
        requires_upgrade_to_paid, resolve_auth_plan_route, sync_trial_expiry, trial_days_remaining,
        AuthPlanRoute, WorkspaceLifecycle,
    },
};

use super::{
    pricing_plans::{get_pricing_plan, plan_requires_paid_checkout},
    types::{AuthMode, BillingPlanId, WizardOpenOptions, WizardStep},
    wizard_entry::{consume_wizard_intent, parse_wizard_query, read_location_search, replace_location_search, strip_wizard_query, wizard_launch_from_query},
};

#[derive(Clone, Copy)]
pub struct OnboardingContext {
    pub open: Signal<bool>,
    pub step: Signal<WizardStep>,
    pub auth_mode: Signal<AuthMode>,
    pub selected_plan: Signal<BillingPlanId>,
    pub workspace_tick: Signal<u32>,
    pub info: Signal<Option<String>>,
    pub oauth_pending: Signal<bool>,
}

impl OnboardingContext {
    pub fn provide() -> Self {
        let ctx = Self {
            open: Signal::new(false),
            step: Signal::new(WizardStep::Welcome),
            auth_mode: Signal::new(AuthMode::Signup),
            selected_plan: Signal::new(BillingPlanId::Trial),
            workspace_tick: Signal::new(0),
            info: Signal::new(None),
            oauth_pending: Signal::new(false),
        };
        use_context_provider(|| ctx);
        ctx
    }

    pub fn use_onboarding() -> Self {
        use_context::<OnboardingContext>()
    }

    pub fn refresh_workspace(mut self) {
        self.workspace_tick.set((self.workspace_tick)() + 1);
    }

    fn workspace_state(&self, session: &AuthSession) -> Option<crate::workspace::WorkspaceState> {
        let _ = (self.workspace_tick)();
        let email = session.email.as_deref().unwrap_or("");
        let tenant = session.active_tenant();
        sync_trial_expiry(tenant, email).or_else(|| read_workspace_state(tenant, email))
    }

    pub fn workspace_ready(&self, session: &AuthSession) -> bool {
        self.workspace_state(session)
            .is_some_and(|ws| ws.workspace_ready && ws.lifecycle != WorkspaceLifecycle::Expired)
    }

    pub fn trial_days_left(&self, session: &AuthSession) -> Option<i64> {
        self.workspace_state(session)
            .and_then(|ws| trial_days_remaining(&ws))
    }

    pub fn close_wizard(mut self) {
        self.open.set(false);
        self.info.set(None);
        #[cfg(all(feature = "web", target_arch = "wasm32"))]
        {
            if let Some(document) = web_sys::window().and_then(|w| w.document()) {
                if let Some(body) = document.body() {
                    let _ = body.set_attribute("style", "");
                }
            }
        }
    }

    pub fn open_wizard(mut self, session: &AuthSession, opts: WizardOpenOptions) {
        if opts.upgrade {
            self.selected_plan.set(opts.plan_id.unwrap_or(BillingPlanId::Pro));
            self.step.set(WizardStep::Pricing);
            self.auth_mode.set(AuthMode::Signin);
            self.open.set(true);
            self.lock_body_scroll();
            return;
        }

        if session.is_signed_in() {
            if session.has_permission("admin.tokens.manage") {
                ensure_platform_owner_workspace(session);
                self.refresh_workspace();
                return;
            }
            let email = session.email.as_deref().unwrap_or("");
            let tenant = session.active_tenant();
            if requires_upgrade_to_paid(tenant, email) {
                self.selected_plan.set(BillingPlanId::Pro);
                self.step.set(WizardStep::Pricing);
                self.auth_mode.set(AuthMode::Signin);
                self.open.set(true);
                self.lock_body_scroll();
                return;
            }
            if self.workspace_ready(session) {
                return;
            }
        }

        let requested = opts.step.unwrap_or(WizardStep::Welcome);
        let initial = if session.is_signed_in() && requested == WizardStep::Welcome {
            WizardStep::Pricing
        } else {
            requested
        };
        self.step.set(initial);
        if let Some(mode) = opts.auth_mode {
            self.auth_mode.set(mode);
        }
        if let Some(plan) = opts.plan_id {
            self.selected_plan.set(plan);
        }
        self.open.set(true);
        self.lock_body_scroll();
    }

    fn lock_body_scroll(&self) {
        #[cfg(all(feature = "web", target_arch = "wasm32"))]
        {
            if let Some(document) = web_sys::window().and_then(|w| w.document()) {
                if let Some(body) = document.body() {
                    let _ = body.set_attribute("style", "overflow: hidden");
                }
            }
        }
    }

    /// Opens the GIS workspace (`/satellite`) when allowed — parity with React `enterGeoAiWorkspace`.
    pub fn enter_workspace(mut self, session: &AuthSession) -> Option<Route> {
        if !session.is_signed_in() {
            self.open_wizard(session, WizardOpenOptions {
                step: Some(WizardStep::Welcome),
                auth_mode: Some(AuthMode::Signin),
                ..Default::default()
            });
            return None;
        }
        let email = session.email.as_deref().unwrap_or("");
        let tenant = session.active_tenant();
        if requires_upgrade_to_paid(tenant, email) {
            self.open_wizard(session, WizardOpenOptions {
                step: Some(WizardStep::Pricing),
                upgrade: true,
                ..Default::default()
            });
            return None;
        }
        if is_platform_owner(session) {
            ensure_platform_owner_workspace(session);
            self.refresh_workspace();
        }
        self.close_wizard();
        Some(default_workspace_route())
    }

    /// Returns workspace route after auth when onboarding should close.
    pub fn handle_post_auth(mut self, session: &AuthSession) -> Option<Route> {
        if session.is_signed_in() && !session.is_email_verified() {
            self.auth_mode.set(AuthMode::Signin);
            self.step.set(WizardStep::Welcome);
            self.open.set(true);
            self.info.set(Some(
                "Confirm your email before accessing GeoSyntra. Check your inbox or resend the verification link."
                    .into(),
            ));
            return None;
        }
        self.refresh_workspace();
        match resolve_auth_plan_route(session) {
            AuthPlanRoute::EnterWorkspace => {
                ensure_platform_owner_workspace(session);
                self.refresh_workspace();
                self.close_wizard();
                Some(default_workspace_route())
            }
            AuthPlanRoute::ActivateProvisioned | AuthPlanRoute::ActivateTrial => {
                self.step.set(WizardStep::Pricing);
                self.open.set(true);
                None
            }
            AuthPlanRoute::OpenPayment => {
                self.selected_plan.set(BillingPlanId::Pro);
                self.step.set(WizardStep::Payment);
                self.open.set(true);
                None
            }
            AuthPlanRoute::OpenPricing { upgrade } => {
                if upgrade {
                    self.selected_plan.set(BillingPlanId::Pro);
                }
                self.step.set(WizardStep::Pricing);
                self.open.set(true);
                None
            }
            AuthPlanRoute::EnterpriseSales => {
                self.selected_plan.set(BillingPlanId::Enterprise);
                self.step.set(WizardStep::Pricing);
                self.open.set(true);
                None
            }
        }
    }

    pub fn run_activation(mut self, auth: AuthContext) {
        let session = auth.session.read().clone();
        let plan = *self.selected_plan.read();
        let token = match session.bearer() {
            Some(t) => t.to_string(),
            None => {
                self.step.set(WizardStep::Welcome);
                self.auth_mode.set(AuthMode::Signup);
                self.open.set(true);
                return;
            }
        };
        self.step.set(WizardStep::Activation);
        let mut onboarding = self;
        spawn(async move {
            let result = if plan == BillingPlanId::Trial {
                let _ = billing::start_trial(&token, 21).await;
                activate_trial_workspace(&session);
                Ok(())
            } else if plan_requires_paid_checkout(plan) {
                billing::confirm_payment(&token, plan).await.map(|_| {
                    activate_paid_workspace(&session);
                })
            } else {
                billing::activate_plan(&token, plan, false).await.map(|_| {
                    activate_paid_workspace(&session);
                })
            };
            if result.is_ok() {
                onboarding.refresh_workspace();
                onboarding.step.set(WizardStep::Launch);
            } else {
                onboarding.step.set(WizardStep::Pricing);
            }
        });
    }

    pub fn apply_launch_from_url(mut self, session: &AuthSession) {
        if let Some(intent) = consume_wizard_intent() {
            self.auth_mode.set(intent.auth_mode);
            if let Some(plan) = intent.plan_id {
                self.selected_plan.set(plan);
            }
            self.step.set(intent.wizard);
            self.open.set(true);
            self.lock_body_scroll();
            return;
        }
        let search = read_location_search();
        let params = parse_wizard_query(&search);
        if params.checkout_success {
            let plan = params
                .plan
                .as_deref()
                .and_then(BillingPlanId::parse)
                .unwrap_or(BillingPlanId::Pro);
            self.selected_plan.set(plan);
            self.step.set(WizardStep::Launch);
            self.open.set(true);
            let stripped = strip_wizard_query(&search);
            replace_location_search(&stripped);
            if session.is_signed_in() {
                activate_paid_workspace(session);
                self.refresh_workspace();
            }
            return;
        }
        if let Some(launch) = wizard_launch_from_query(&params) {
            self.auth_mode.set(launch.auth_mode);
            if let Some(plan) = launch.plan_id {
                self.selected_plan.set(plan);
            }
            self.step.set(launch.wizard);
            self.open.set(true);
            self.lock_body_scroll();
            let stripped = strip_wizard_query(&search);
            replace_location_search(&stripped);
        }
    }

    pub fn select_plan(mut self, plan: BillingPlanId) {
        self.selected_plan.set(plan);
        self.step.set(WizardStep::Pricing);
    }

    pub fn plan_label(plan: BillingPlanId) -> &'static str {
        get_pricing_plan(plan).map(|p| p.name).unwrap_or("Plan")
    }
}
