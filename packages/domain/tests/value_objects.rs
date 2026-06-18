mod support;

use domain::value_objects::password::{HashedPassword, NoneHashedPassword};
use domain::value_objects::{
    date_time::Weekday, Action, Address, Addresses, Bio, Body, Comment, Country, DateTime,
    Description, Diff, Email, Language, Name, NetworkZone, Password, PermissionSlug,
    PhoneNumber, PhoneNumbers, Resource, TimeWindow, Title, Url, Username,
};
use domain::DomainError;
use std::str::FromStr;

#[test]
fn email_normalizes_and_validates() {
    let email = Email::new("  User@Example.COM ").unwrap();
    assert_eq!(email.email(), "user@example.com");
    assert_eq!(email.to_string(), "user@example.com");

    assert!(matches!(
        Email::new(&"a".repeat(255)),
        Err(DomainError::ValidationError(_))
    ));
    assert!(Email::new("not-an-email").is_err());
    assert!(Email::from_str("bad").is_err());
}

#[test]
fn slug_like_value_objects_share_validation_rules() {
    for factory in [
        |s: &str| Username::new(s).map(|_| ()),
        |s: &str| Name::new(s).map(|_| ()),
        |s: &str| Title::new(s).map(|_| ()),
        |s: &str| Resource::new(s).map(|_| ()),
        |s: &str| Action::new(s).map(|_| ()),
    ] {
        assert!(factory("ab").is_err());
        assert!(factory("_invalid").is_err());
        assert!(factory("-invalid").is_err());
        assert!(factory("valid_name").is_ok());
    }
    assert!(Resource::new("admin.users").is_err());
}

#[test]
fn description_bio_body_comment_bounds() {
    assert!(Description::new("ab").is_err());
    assert!(Description::new("ok description").is_ok());

    assert!(Bio::new("ab").is_err());
    assert!(Bio::new("short bio").is_ok());
    assert!(Bio::new(&"x".repeat(161)).is_err());

    assert!(Body::new("ab").is_err());
    assert!(Comment::new("ab").is_err());
    assert_eq!(Diff::new("anything goes").diff(), "anything goes");
}

#[test]
fn country_length_bounds() {
    assert!(Country::new("US").is_err());
    assert!(Country::new("USA").is_ok());
    assert!(Country::new(&"x".repeat(61)).is_err());
}

#[test]
fn url_adds_https_scheme() {
    let url = Url::new("example.com").unwrap();
    assert_eq!(url.url(), "https://example.com");
    assert!(Url::new("").is_err());
    assert!(Url::new("https://already.com").is_ok());
}

#[test]
fn password_variants_validate_length() {
    assert!(NoneHashedPassword::new("short").is_err());
    assert!(NoneHashedPassword::new("longenough").is_ok());
    assert!(NoneHashedPassword::new(&"x".repeat(101)).is_err());

    assert!(HashedPassword::new("too-short").is_err());
    assert!(HashedPassword::new(support::valid_bcrypt_hash()).is_ok());

    let plain = Password::NoneHashed(NoneHashedPassword::new("password123").unwrap());
    assert!(plain.to_string().contains("password123"));
}

#[test]
fn phone_number_strips_non_digits_and_validates_title() {
    let phone = PhoneNumber::new("Mobile", "+1 (555) 123-4567").unwrap();
    assert_eq!(phone.number(), "15551234567");

    assert!(PhoneNumber::new("Mobile", "123").is_err());
    assert!(PhoneNumber::new("ab", "1234567890").is_err()); // title < 3 for Title VO
    assert!(PhoneNumber::new("VeryLongTitleHere", "1234567890").is_err());
}

#[test]
fn phone_numbers_collection_dedups() {
    let mut phones = PhoneNumbers::new();
    let p1 = PhoneNumber::new("Home", "5551234567").unwrap();
    phones.add_phone_number(p1.clone());
    phones.add_phone_number(p1);
    assert_eq!(phones.phone_numbers().len(), 1);
}

#[test]
fn address_builder_validates_title() {
    assert!(Address::new().build().is_err());

    let mut builder = Address::new();
    builder
        .set_title("Home")
        .set_street("1 Main St")
        .set_city("Springfield")
        .set_state("IL")
        .set_postal_code("62701")
        .set_country("USA");
    let address = builder.build().unwrap();
    assert_eq!(address.title(), "Home");
    assert_eq!(address.street(), "1 Main St");

    let mut long_title = Address::new();
    long_title.set_title(&"x".repeat(61));
    assert!(long_title.build().is_err());
}

#[test]
fn addresses_collection_merges() {
    let mut a = Addresses::new();
    let mut b = Addresses::new();
    let mut builder = Address::new();
    builder.set_title("Office");
    a.add_address(builder.build().unwrap());
    b.add_addresses(a);
    assert_eq!(b.len(), 1);
}

#[test]
fn permission_slug_maps_dotted_slugs_to_resource_action() {
    let slug = PermissionSlug::new("admin.users.read").unwrap();
    let (resource, action) = slug.to_resource_action().unwrap();
    assert_eq!(resource.resource(), "admin_users");
    assert_eq!(action.action(), "read");
    assert_eq!(slug.slug(), "admin.users.read");
}

#[test]
fn permission_slug_rejects_invalid_input() {
    assert!(PermissionSlug::new("").is_err());
    assert!(PermissionSlug::new("bad..slug").is_err());
    assert!(PermissionSlug::new("read")
        .unwrap()
        .to_resource_action()
        .is_err());
}

#[test]
fn date_time_ordering_and_weekday_mapping() {
    let early = DateTime::new(100);
    let late = DateTime::new(200);
    assert!(early.is_before(&late));
    assert!(late.is_after(&early));
    assert!(DateTime::new(100).between(&early, &late));
    assert!(!DateTime::new(99).between(&early, &late));

    assert_eq!(Weekday::Sunday.number(), 0);
    assert_eq!(Weekday::Saturday.number(), 6);
    assert_eq!(Weekday::all().len(), 7);

    // 1970-01-01 00:00:00 UTC is a Thursday
    let epoch = DateTime::new(0);
    assert!(matches!(epoch.weekday(), Weekday::Thursday));
    assert_eq!(epoch.seconds_since_midnight(), 0);

    let noon = DateTime::new(43_200);
    assert_eq!(noon.seconds_since_midnight(), 43_200);
}

#[test]
fn time_window_absolute_and_recurring() {
    let start = DateTime::new(100);
    let end = DateTime::new(200);
    let absolute = TimeWindow::Absolute { start, end };
    assert!(absolute.allows(DateTime::new(150), Weekday::Monday, 0));
    assert!(!absolute.allows(DateTime::new(50), Weekday::Monday, 0));

    let business_hours = TimeWindow::Recurring {
        days: vec![Weekday::Monday, Weekday::Tuesday],
        start_seconds: 9 * 3600,
        end_seconds: 17 * 3600,
    };
    assert!(business_hours.allows(DateTime::new(1), Weekday::Monday, 10 * 3600));
    assert!(!business_hours.allows(DateTime::new(1), Weekday::Sunday, 10 * 3600));
    assert!(!business_hours.allows(DateTime::new(1), Weekday::Monday, 8 * 3600));

    let overnight = TimeWindow::Recurring {
        days: vec![Weekday::Friday],
        start_seconds: 22 * 3600,
        end_seconds: 6 * 3600,
    };
    assert!(overnight.allows(DateTime::new(1), Weekday::Friday, 23 * 3600));
    assert!(overnight.allows(DateTime::new(1), Weekday::Friday, 3 * 3600));
    assert!(!overnight.allows(DateTime::new(1), Weekday::Friday, 12 * 3600));
}

#[test]
fn language_requires_minimum_length() {
    assert!(Language::new("en").is_err());
    assert!(Language::new("eng").is_ok());
}

#[test]
fn network_zone_variants_exist() {
    let _ = NetworkZone::TrustedCorporate;
    let _ = NetworkZone::PublicInternet;
    let _ = NetworkZone::HighRisk;
}
