//! Pricing plan catalog — parity with React `pricingPlans.ts`.

use super::types::BillingPlanId;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PricingPlan {
    pub id: BillingPlanId,
    pub name: &'static str,
    pub price_label: &'static str,
    pub price_note: &'static str,
    pub description: &'static str,
    pub features: &'static [&'static str],
    pub highlighted: bool,
    pub cta: &'static str,
    pub requires_payment: bool,
    pub trial_days: Option<u32>,
}

pub const PRICING_PLANS: &[PricingPlan] = &[
    PricingPlan {
        id: BillingPlanId::Trial,
        name: "Free Trial",
        price_label: "$0",
        price_note: "21 days · full platform",
        description: "Explore Layer Live, GeoAI, and exports with no credit card.",
        features: &[
            "Basic map view (Mapbox)",
            "Limited POI search (OSM)",
            "10 AI queries / day",
            "No AOI analysis or layer compare",
        ],
        highlighted: false,
        cta: "Start 21-day trial",
        requires_payment: false,
        trial_days: Some(21),
    },
    PricingPlan {
        id: BillingPlanId::Pro,
        name: "Pro",
        price_label: "$100",
        price_note: "3 months · plan credits included",
        description: "Production workflows for analysts and small teams — activated for 3 months with usage credits.",
        features: &[
            "Unlimited AOI & timeline",
            "Priority imagery refresh",
            "50 GB storage · 2K exports/mo",
            "API access & webhooks",
        ],
        highlighted: true,
        cta: "Activate Pro",
        requires_payment: true,
        trial_days: None,
    },
    PricingPlan {
        id: BillingPlanId::Enterprise,
        name: "Enterprise",
        price_label: "Custom",
        price_note: "annual · SLA",
        description: "Dedicated capacity, SSO, and compliance for organizations.",
        features: &[
            "Full GIS engine (PostGIS / ArcGIS)",
            "Multi-user workspace · custom datasets",
            "Advanced spatial analytics · API access",
            "SLA · on-prem or cloud deployment",
        ],
        highlighted: false,
        cta: "Talk to sales",
        requires_payment: true,
        trial_days: None,
    },
];

pub fn get_pricing_plan(id: BillingPlanId) -> Option<&'static PricingPlan> {
    PRICING_PLANS.iter().find(|p| p.id == id)
}

pub fn plan_requires_paid_checkout(id: BillingPlanId) -> bool {
    matches!(id, BillingPlanId::Pro | BillingPlanId::Enterprise)
}

pub fn enterprise_sales_mailto(email: Option<&str>) -> String {
    let subject = "GeoSyntra Enterprise inquiry";
    let body = email
        .map(|e| format!("Hi GeoSyntra team,\n\nI'm interested in Enterprise.\n\nAccount: {e}\n"))
        .unwrap_or_else(|| "Hi GeoSyntra team,\n\nI'm interested in Enterprise.\n".into());
    format!(
        "mailto:sales@geosyntra.com?subject={}&body={}",
        urlencoding(subject),
        urlencoding(&body)
    )
}

fn urlencoding(s: &str) -> String {
    s.chars()
        .map(|c| match c {
            ' ' => "%20".into(),
            '\n' => "%0A".into(),
            '&' => "%26".into(),
            '?' => "%3F".into(),
            '=' => "%3D".into(),
            other if other.is_ascii_alphanumeric() || matches!(other, '-' | '_' | '.' | '@') => {
                other.to_string()
            }
            other => format!("%{:02X}", other as u32),
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn trial_plan_does_not_require_payment() {
        let plan = get_pricing_plan(BillingPlanId::Trial).expect("trial plan");
        assert!(!plan.requires_payment);
        assert_eq!(plan.trial_days, Some(21));
    }

    #[test]
    fn pro_requires_checkout() {
        assert!(plan_requires_paid_checkout(BillingPlanId::Pro));
        assert!(!plan_requires_paid_checkout(BillingPlanId::Trial));
    }
}
