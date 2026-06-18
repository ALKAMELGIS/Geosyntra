mod support;

use domain::user::{UserStatus, DEFAULT_MAX_FAILED_LOGINS, DEFAULT_LOCKOUT_SECONDS};
use domain::{DomainError, User};

#[test]
fn active_user_can_authenticate() {
    let user = support::sample_user("u1");
    assert!(user.can_authenticate(&support::ts(1)).is_ok());
}

#[test]
fn suspended_user_cannot_authenticate() {
    let mut builder = User::new(domain::UserId::new("u1"));
    builder
        .set_email(domain::Email::new("a@b.co").unwrap())
        .set_username(domain::Username::new("john_doe").unwrap())
        .set_profile(support::sample_profile())
        .set_status(UserStatus::Suspended);
    let user = builder.build().unwrap();
    assert!(matches!(
        user.can_authenticate(&support::ts(1)),
        Err(DomainError::UserError(_))
    ));
}

#[test]
fn locked_user_cannot_authenticate_until_expiry() {
    let user = support::sample_user("u1").lock_until(support::ts(200));
    assert!(user.can_authenticate(&support::ts(100)).is_err());
    assert!(user.can_authenticate(&support::ts(200)).is_ok());
}

#[test]
fn record_failed_login_locks_after_threshold() {
    let user = support::sample_user("u1");
    let now = support::ts(1_000);
    let mut current = user;
    for _ in 0..DEFAULT_MAX_FAILED_LOGINS - 1 {
        current = current.record_failed_login(now);
        assert!(current.can_authenticate(&now).is_ok());
        assert!(current.locked_until().is_none());
    }
    current = current.record_failed_login(now);
    assert_eq!(*current.failed_logins(), Some(DEFAULT_MAX_FAILED_LOGINS));
    assert_eq!(
        current.locked_until().unwrap().datetime(),
        &(1_000 + DEFAULT_LOCKOUT_SECONDS)
    );
    assert!(current.can_authenticate(&now).is_err());
}

#[test]
fn clear_failed_logins_resets_lockout() {
    let user = support::sample_user("u1")
        .record_failed_login(support::ts(1))
        .lock_until(support::ts(999));
    let cleared = user.clear_failed_logins();
    assert_eq!(*cleared.failed_logins(), Some(0));
    assert!(cleared.locked_until().is_none());
}

#[test]
fn suspend_and_activate_lifecycle() {
    let user = support::sample_user("u1").suspend();
    assert_eq!(*user.status(), UserStatus::Suspended);
    let active = user.activate().unwrap();
    assert!(active.is_active());
}
