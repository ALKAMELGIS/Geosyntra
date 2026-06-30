mod support;

use domain::user::UserStatus;
use domain::value_objects::password::NoneHashedPassword;
use domain::user::UserPreferences;
use domain::value_objects::{Bio, Name, Password, PhoneNumber, PhoneNumbers, Url};
use domain::{Address, Addresses, DomainError, Email, User, UserId, UserProfile, Username};

#[test]
fn user_builder_requires_email_username_profile() {
    let mut missing_email = User::new(UserId::new("u1"));
    missing_email
        .set_username(Username::new("john_doe").unwrap())
        .set_profile(support::sample_profile());
    assert!(matches!(
        missing_email.build(),
        Err(DomainError::ValidationError(_))
    ));

    let mut missing_username = User::new(UserId::new("u1"));
    missing_username
        .set_email(Email::new("a@b.co").unwrap())
        .set_profile(support::sample_profile());
    assert!(missing_username.build().is_err());

    let mut missing_profile = User::new(UserId::new("u1"));
    missing_profile
        .set_email(Email::new("a@b.co").unwrap())
        .set_username(Username::new("john_doe").unwrap());
    assert!(missing_profile.build().is_err());
}

#[test]
fn user_status_active_only_when_active() {
    let mut builder = User::new(UserId::new("u1"));
    builder
        .set_email(Email::new("a@b.co").unwrap())
        .set_username(Username::new("john_doe").unwrap())
        .set_profile(support::sample_profile())
        .set_status(UserStatus::Suspended);
    let user = builder.build().unwrap();
    assert!(!user.is_active());

    let active = support::sample_user("u-active");
    assert!(active.is_active());
}

#[test]
fn user_optional_fields_and_version() {
    let mut builder = User::new(UserId::new("u1"));
    builder
        .set_email(Email::new("a@b.co").unwrap())
        .set_username(Username::new("john_doe").unwrap())
        .set_profile(support::sample_profile())
        .set_status(UserStatus::Active)
        .set_failed_logins(3)
        .set_locked_until(support::ts(999))
        .set_last_login(support::ts(888))
        .set_version(5);
    let user = builder.build().unwrap();
    assert_eq!(*user.failed_logins(), Some(3));
    assert_eq!(user.locked_until().unwrap().datetime(), &999);
    assert_eq!(user.last_login().unwrap().datetime(), &888);
    assert_eq!(user.version(), &5);
}

#[test]
fn user_into_parts_preserves_identity() {
    let user = support::sample_user("u1");
    let parts = user.into_parts();
    assert_eq!(parts.id.as_str(), "u1");
    assert_eq!(parts.email.email(), "john@example.com");
    assert_eq!(parts.username.username(), "john_doe");
}

#[test]
fn user_preferences_defaults_and_custom() {
    let defaults = UserPreferences::default();
    assert!(defaults.email_notifications());
    assert!(defaults.push_notifications());
    assert!(!defaults.two_factor_auth());
    assert_eq!(defaults.language().language(), "english");

    let custom = UserPreferences::new(
        false,
        false,
        true,
        domain::value_objects::Language::new("arabic").unwrap(),
    );
    let parts = custom.into_parts();
    assert!(!parts.email_notifications);
    assert!(parts.two_factor_auth);
}

#[test]
fn user_profile_builder_requires_names_and_password() {
    let now = support::ts(1);
    let builder = UserProfile::new();
    assert!(matches!(
        builder.build(now, now),
        Err(DomainError::ValidationError(_))
    ));
}

#[test]
fn user_profile_builder_allows_missing_dob() {
    let now = support::ts(1);
    let mut builder = UserProfile::new();
    builder
        .set_first_name(Name::new("Jane").unwrap())
        .set_last_name(Name::new("Doe").unwrap())
        .set_password(Password::NoneHashed(
            NoneHashedPassword::new("password123").unwrap(),
        ));
    let profile = builder.build(now, now).unwrap();
    assert!(profile.date_of_birth().is_none());
}

#[test]
fn user_profile_optional_fields_and_collections() {
    let now = support::ts(1);
    let mut builder = UserProfile::new();
    builder
        .set_first_name(Name::new("Jane").unwrap())
        .set_last_name(Name::new("Doe").unwrap())
        .set_password(Password::NoneHashed(
            NoneHashedPassword::new("password123").unwrap(),
        ))
        .set_date_of_birth(now)
        .set_bio(Bio::new("Geo analyst").unwrap())
        .set_website(Url::new("geosyntra.com").unwrap())
        .set_avatar_url(Url::new("cdn.example.com/avatar.png").unwrap())
        .set_is_deleted(false);

    let mut phones = PhoneNumbers::new();
    phones.add_phone_number(PhoneNumber::new("Mobile", "5551234567").unwrap());
    builder.add_phone_numbers(phones);

    let mut addresses = Addresses::new();
    let mut addr = Address::new();
    addr.set_title("Home");
    addresses.add_address(addr.build().unwrap());
    builder.add_addresses(addresses);

    let profile = builder.build(now, now).unwrap();
    assert_eq!(profile.first_name().name(), "Jane");
    assert_eq!(profile.bio().as_ref().unwrap().bio(), "Geo analyst");
    assert_eq!(profile.phone_numbers().len(), 1);
    assert_eq!(profile.addresses().len(), 1);
    assert!(!profile.is_deleted());
}
