//! GeoSyntra domain layer — aggregates, value objects, and authorization primitives.
//!
//! # Examples
//!
//! ```
//! use domain::{Email, UserId, Username};
//!
//! let email = Email::new("ops@geosyntra.test").unwrap();
//! let username = Username::new("ops_user").unwrap();
//! let id = UserId::new("user-1");
//!
//! assert_eq!(email.email(), "ops@geosyntra.test");
//! assert_eq!(username.username(), "ops_user");
//! assert_eq!(id.as_str(), "user-1");
//! ```

#![allow(dead_code)]
#![allow(clippy::new_ret_no_self)]
pub mod billing;
pub mod error;
pub mod events;
pub mod membership;
pub mod permissions;
pub mod role;
pub mod shared;
pub mod specifications;
pub mod temporary_grant;
pub mod tenant;
pub mod traits;
pub mod user;
pub mod value_objects;

pub use billing::{
    BillingPlan, GeoFeature, PlanLimits, Subscription, SubscriptionDisplayStatus,
    SubscriptionStatus, UsageCounter, UsageRecord,
};
pub use error::{BillingError, DomainError};
pub use events::{DomainEvent, DomainEventId, Event, Table};
pub use membership::{Membership, MembershipParts};
pub use permissions::{Permission, PermissionId, PermissionParts};
pub use role::{Role, RoleId};
pub use shared::shared_str::SharedStr;
pub use temporary_grant::{TemporaryGrant, TemporaryGrantParts};
pub use tenant::{Tenant, TenantId};
pub use traits::{AndSpecification, Specification};
pub use user::{User, UserId, UserProfile};
pub use value_objects::{
    Action, Address, Addresses, Bio, Body, Comment, DateTime, Description, Email, HashedPassword,
    Name, Password, PermissionSlug, PhoneNumber, PhoneNumbers, Resource, Title, Url, Username,
};
