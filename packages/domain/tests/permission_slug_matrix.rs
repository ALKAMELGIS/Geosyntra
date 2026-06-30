//! Express PERMISSIONS slug parity — must match migration/permission-slug-matrix.md

use domain::value_objects::permission_slug::{EXPRESS_PERMISSION_SLUGS, PermissionSlug};

struct SlugExpectation {
    slug: &'static str,
    resource: &'static str,
    action: &'static str,
}

const EXPECTED: &[SlugExpectation] = &[
    SlugExpectation {
        slug: "app.access",
        resource: "app",
        action: "access",
    },
    SlugExpectation {
        slug: "admin.panel",
        resource: "admin_panel",
        action: "access",
    },
    SlugExpectation {
        slug: "admin.users.read",
        resource: "admin_users",
        action: "read",
    },
    SlugExpectation {
        slug: "admin.users.manage",
        resource: "admin_users",
        action: "manage",
    },
    SlugExpectation {
        slug: "admin.users.approve",
        resource: "admin_users",
        action: "approve",
    },
    SlugExpectation {
        slug: "admin.users.suspend",
        resource: "admin_users",
        action: "suspend",
    },
    SlugExpectation {
        slug: "admin.roles.assign",
        resource: "admin_roles",
        action: "assign",
    },
    SlugExpectation {
        slug: "admin.invites.create",
        resource: "admin_invites",
        action: "create",
    },
    SlugExpectation {
        slug: "admin.audit.read",
        resource: "admin_audit",
        action: "read",
    },
    SlugExpectation {
        slug: "admin.settings.manage",
        resource: "admin_settings",
        action: "manage",
    },
    SlugExpectation {
        slug: "admin.tokens.read",
        resource: "admin_tokens",
        action: "read",
    },
    SlugExpectation {
        slug: "admin.tokens.manage",
        resource: "admin_tokens",
        action: "manage",
    },
    SlugExpectation {
        slug: "aoi.read",
        resource: "aoi",
        action: "read",
    },
    SlugExpectation {
        slug: "aoi.write",
        resource: "aoi",
        action: "write",
    },
    SlugExpectation {
        slug: "analytics.run",
        resource: "analytics",
        action: "run",
    },
    SlugExpectation {
        slug: "reports.write",
        resource: "reports",
        action: "write",
    },
    SlugExpectation {
        slug: "ai.run",
        resource: "ai_chat",
        action: "run",
    },
];

#[test]
fn express_permissions_list_matches_expected_count() {
    assert_eq!(
        EXPRESS_PERMISSION_SLUGS.len(),
        EXPECTED.len(),
        "update permission-slug-matrix.md when Express PERMISSIONS changes"
    );
}

#[test]
fn all_express_slugs_map_to_resource_action() {
    for entry in EXPECTED {
        let slug = PermissionSlug::new(entry.slug).unwrap_or_else(|e| {
            panic!("slug {} should parse: {e}", entry.slug);
        });
        let (resource, action) = slug.to_resource_action().unwrap_or_else(|e| {
            panic!("slug {} should map: {e}", entry.slug);
        });
        assert_eq!(
            resource.resource(),
            entry.resource,
            "resource mismatch for {}",
            entry.slug
        );
        assert_eq!(
            action.action(),
            entry.action,
            "action mismatch for {}",
            entry.slug
        );
    }
}

#[test]
fn express_constant_covers_all_expected_slugs() {
    for entry in EXPECTED {
        assert!(
            EXPRESS_PERMISSION_SLUGS.contains(&entry.slug),
            "EXPRESS_PERMISSION_SLUGS missing {}",
            entry.slug
        );
    }
}

#[test]
fn mechanical_split_does_not_duplicate_aliases() {
    for (slug, resource, action) in domain::value_objects::permission_slug::SLUG_ALIASES {
        let parsed = PermissionSlug::new(slug).unwrap();
        let (r, a) = parsed.to_resource_action().unwrap();
        assert_eq!(r.resource(), *resource);
        assert_eq!(a.action(), *action);
    }
}
