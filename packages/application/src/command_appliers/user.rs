use domain::{
    error::DomainResult,
    user::{UserPreferences, UserProfile, UserStatus},
    DateTime, User, UserId,
};

use crate::dto::user::command::{UserCommand, UserPreferencesCommand, UserProfileCommand};

pub struct UserCommandApplier;

impl UserCommandApplier {
    pub fn from_create(id: UserId, cmd: UserCommand) -> DomainResult<User> {
        let mut builder = User::new(id);
        if let Some(email) = cmd.email {
            builder.set_email(email);
        }
        if let Some(username) = cmd.username {
            builder.set_username(username);
        }
        if let Some(profile) = &cmd.profile {
            builder.set_profile(profile_from_command(profile)?);
        }
        if let Some(prefs) = &cmd.preferences {
            builder.set_preferences(preferences_from_command(prefs));
        }
        if let Some(status) = cmd.status {
            builder.set_status(status);
        } else {
            builder.set_status(UserStatus::Active);
        }
        if let Some(version) = cmd.version {
            builder.set_version(version);
        }
        builder.build()
    }

    pub fn apply_update(user: User, cmd: &UserCommand) -> DomainResult<User> {
        let parts = user.into_parts();
        let mut builder = User::new(parts.id);
        builder.set_email(cmd.email.clone().unwrap_or(parts.email));
        builder.set_username(cmd.username.clone().unwrap_or(parts.username));
        builder.set_profile(if let Some(profile_cmd) = &cmd.profile {
            merge_profile_command(&parts.profile, profile_cmd)?
        } else {
            parts.profile
        });
        builder.set_preferences(if let Some(prefs_cmd) = &cmd.preferences {
            preferences_from_command(prefs_cmd)
        } else {
            parts.preferences
        });
        builder.set_status(cmd.status.unwrap_or(parts.status));
        builder.set_failed_logins(parts.failed_logins.unwrap_or(0));
        if let Some(locked) = parts.locked_until {
            builder.set_locked_until(locked);
        }
        if let Some(last) = parts.last_login {
            builder.set_last_login(last);
        }
        let version = cmd.version.unwrap_or(parts.version.saturating_add(1));
        builder.set_version(version);
        builder.build()
    }
}

fn merge_profile_command(
    existing: &UserProfile,
    cmd: &UserProfileCommand,
) -> DomainResult<UserProfile> {
    let parts = existing.clone().into_parts();
    let mut merged = UserProfileCommand {
        first_name: cmd
            .first_name
            .clone()
            .or(Some(parts.first_name)),
        last_name: cmd.last_name.clone().or(Some(parts.last_name)),
        password: cmd.password.clone().or(Some(parts.password)),
        bio: cmd.bio.clone().or(parts.bio),
        phone_numbers: cmd.phone_numbers.clone().or(Some(parts.phone_numbers)),
        avatar_url: cmd.avatar_url.clone().or(parts.avatar_url),
        date_of_birth: cmd.date_of_birth.or(parts.date_of_birth),
        addresses: cmd.addresses.clone().or(Some(parts.addresses)),
        website: cmd.website.clone().or(parts.website),
    };
    profile_from_command(&merged)
}

fn profile_from_command(cmd: &UserProfileCommand) -> DomainResult<UserProfile> {
    let mut builder = UserProfile::new();
    if let Some(v) = &cmd.first_name {
        builder.set_first_name(v.clone());
    }
    if let Some(v) = &cmd.last_name {
        builder.set_last_name(v.clone());
    }
    if let Some(v) = &cmd.password {
        builder.set_password(v.clone());
    }
    if let Some(v) = &cmd.bio {
        builder.set_bio(v.clone());
    }
    if let Some(v) = &cmd.phone_numbers {
        builder.add_phone_numbers(v.clone());
    }
    if let Some(v) = &cmd.avatar_url {
        builder.set_avatar_url(v.clone());
    }
    if let Some(v) = &cmd.date_of_birth {
        builder.set_date_of_birth(*v);
    }
    if let Some(v) = &cmd.addresses {
        builder.add_addresses(v.clone());
    }
    if let Some(v) = &cmd.website {
        builder.set_website(v.clone());
    }
    let now = DateTime::new(0);
    builder.build(now, now)
}

fn preferences_from_command(cmd: &UserPreferencesCommand) -> UserPreferences {
    UserPreferences::new(
        cmd.email_notifications.unwrap_or(true),
        cmd.push_notifications.unwrap_or(true),
        cmd.two_factor_auth.unwrap_or(false),
        cmd.language
            .clone()
            .unwrap_or_else(|| domain::value_objects::Language::new("english").unwrap()),
    )
}
