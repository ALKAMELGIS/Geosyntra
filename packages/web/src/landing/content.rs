//! Static landing copy — parity with React `homeSaasContent.tsx`.

pub const BRAND: &str = "GeoSyntra";
pub const SIGN_IN_LABEL: &str = "Sign in";
pub const START_LABEL: &str = "Free 21-Day Trial";
pub const HERO_START_LABEL: &str = "Start";
pub const HERO_TRIAL_LABEL: &str = "Free 21-Day Trial";
pub const GET_STARTED_LABEL: &str = "Get Started";

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct NavItem {
    pub id: &'static str,
    pub href: &'static str,
    pub label: &'static str,
}

pub const NAV_ITEMS: &[NavItem] = &[
    NavItem {
        id: "platform",
        href: "#innovation",
        label: "Platform",
    },
    NavItem {
        id: "pricing",
        href: "#pricing",
        label: "Price",
    },
    NavItem {
        id: "about",
        href: "#future",
        label: "About",
    },
];

pub struct HeroCopy {
    pub line_before: &'static str,
    pub accent_highlight: &'static str,
    pub accent_remainder: &'static str,
    pub globe_brand: &'static str,
    pub subtitle: &'static str,
}

pub const HERO: HeroCopy = HeroCopy {
    line_before: "The Future of",
    accent_highlight: "Spatial",
    accent_remainder: " Intelligence",
    globe_brand: BRAND,
    subtitle: "Where Geospatial Intelligence Meets Integration",
};

#[derive(Debug, Clone)]
pub struct FooterLink {
    pub href: String,
    pub label: &'static str,
    pub external: bool,
}

#[derive(Debug, Clone)]
pub struct FooterColumn {
    pub title: &'static str,
    pub links: Vec<FooterLink>,
}

pub fn footer_columns() -> Vec<FooterColumn> {
    vec![
        FooterColumn {
            title: "Platform",
            links: vec![
                FooterLink {
                    href: "/satellite".into(),
                    label: "Satellite Intelligence",
                    external: false,
                },
                FooterLink {
                    href: "#innovation".into(),
                    label: "Earth Observation",
                    external: false,
                },
                FooterLink {
                    href: "#future".into(),
                    label: "AOI & Analytics",
                    external: false,
                },
                FooterLink {
                    href: "#future".into(),
                    label: "Scientific Reporting",
                    external: false,
                },
                FooterLink {
                    href: "#get-started".into(),
                    label: "Start free trial",
                    external: false,
                },
            ],
        },
        FooterColumn {
            title: "Solutions",
            links: vec![
                FooterLink {
                    href: "#innovation".into(),
                    label: "Remote sensing",
                    external: false,
                },
                FooterLink {
                    href: "#innovation".into(),
                    label: "Vegetation indices",
                    external: false,
                },
                FooterLink {
                    href: "#future".into(),
                    label: "Change detection",
                    external: false,
                },
                FooterLink {
                    href: "#future".into(),
                    label: "Geo AI copilot",
                    external: false,
                },
                FooterLink {
                    href: "/learn-more".into(),
                    label: "Enterprise GIS",
                    external: false,
                },
            ],
        },
        FooterColumn {
            title: "Resources",
            links: vec![
                FooterLink {
                    href: "/learn-more".into(),
                    label: "Documentation",
                    external: false,
                },
                FooterLink {
                    href: "#pricing".into(),
                    label: "Pricing",
                    external: false,
                },
                FooterLink {
                    href: "#start".into(),
                    label: "Getting started",
                    external: false,
                },
                FooterLink {
                    href: "#start".into(),
                    label: "Platform tour",
                    external: false,
                },
                FooterLink {
                    href: "mailto:support@geosyntra.com".into(),
                    label: "Contact support",
                    external: true,
                },
            ],
        },
        FooterColumn {
            title: "Legal",
            links: vec![
                FooterLink {
                    href: "/learn-more".into(),
                    label: "Terms of service",
                    external: false,
                },
                FooterLink {
                    href: "/learn-more".into(),
                    label: "Privacy policy",
                    external: false,
                },
                FooterLink {
                    href: "/learn-more".into(),
                    label: "Cookie notice",
                    external: false,
                },
                FooterLink {
                    href: "/learn-more".into(),
                    label: "Data processing",
                    external: false,
                },
                FooterLink {
                    href: "/learn-more".into(),
                    label: "Security & trust",
                    external: false,
                },
            ],
        },
    ]
}

pub struct GlobeSection {
    pub id: &'static str,
    pub badge: &'static str,
    pub title: &'static str,
    pub subtitle: Option<&'static str>,
    pub description: &'static str,
    pub has_actions: bool,
}

pub const GLOBE_SECTIONS: &[GlobeSection] = &[
    GlobeSection {
        id: "innovation",
        badge: "Innovation",
        title: "Connected Worldwide",
        subtitle: None,
        description: "From every corner of the globe, we witness the interconnected web of human achievement. Each connection represents progress, every interaction drives innovation forward into uncharted territories.",
        has_actions: false,
    },
    GlobeSection {
        id: "future",
        badge: "Future",
        title: "Our Shared",
        subtitle: Some("Tomorrow"),
        description: "In this moment of unity, we see not just a planet, but a canvas of infinite human potential. Every connection represents hope, every innovation builds bridges to our collective future of endless possibilities.",
        has_actions: true,
    },
];

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn nav_items_match_react_hash_targets() {
        assert_eq!(NAV_ITEMS[0].href, "#innovation");
        assert_eq!(NAV_ITEMS[1].href, "#pricing");
        assert_eq!(NAV_ITEMS[2].href, "#future");
    }

    #[test]
    fn globe_sections_include_innovation_and_future() {
        let ids: Vec<_> = GLOBE_SECTIONS.iter().map(|s| s.id).collect();
        assert!(ids.contains(&"innovation"));
        assert!(ids.contains(&"future"));
    }
}
