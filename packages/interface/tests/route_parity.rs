//! Task 18 — Axum route catalog vs golden inventory parity.

use std::{fs, path::PathBuf};

use interface::route_catalog;

fn golden_path() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../../migration/axum-route-inventory.golden")
}

#[test]
fn axum_route_catalog_matches_golden_inventory() {
    let golden = fs::read_to_string(golden_path()).expect("read axum-route-inventory.golden");
    let expected: Vec<String> = golden
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .map(str::to_string)
        .collect();

    let actual = route_catalog::golden_lines();

    assert_eq!(
        actual, expected,
        "route catalog drift — update migration/axum-route-inventory.golden or route_catalog.rs"
    );
}

#[test]
fn implemented_route_count_tracked() {
    let golden = fs::read_to_string(golden_path()).expect("read axum-route-inventory.golden");
    let golden_count = golden
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .count();
    assert_eq!(
        route_catalog::IMPLEMENTED_ROUTES.len(),
        golden_count,
        "update golden + express parity script when route count changes"
    );
}
