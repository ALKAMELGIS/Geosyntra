use std::ops::Deref;

use crate::{DateTime, UserId};

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Table {
    User,
    Role,
    Tenant,
    Permission,
    Membership,
    TemporaryGrant,
    Subscription,
    UsageRecord,
}

#[derive(Debug, Clone)]
pub struct DomainEventId(String);
impl DomainEventId {
    pub fn new(id: &str) -> Self {
        Self(id.into())
    }
    pub fn id(&self) -> &str {
        &self.0
    }

    pub fn as_str(&self) -> &str {
        &self.0
    }
}

impl Deref for DomainEventId {
    type Target = str;
    fn deref(&self) -> &Self::Target {
        &self.0
    }
}

pub trait Event: Clone {
    fn get_type(&self) -> &str;
}

#[derive(Debug, Clone)]
pub struct DomainEvent<T: Clone + Event> {
    id: DomainEventId,
    table: Table,
    action: String,
    user_id: UserId,
    occurred_at: DateTime,
    before: T,
    after: T,
}

impl<T: Clone + Event> DomainEvent<T> {
    pub fn new(
        id: &str,
        table: Table,
        action: String,
        user_id: UserId,
        occurred_at: DateTime,
        before: T,
        after: T,
    ) -> Self {
        Self {
            id: DomainEventId::new(id),
            occurred_at,
            action,
            table,
            user_id,
            before,
            after,
        }
    }
    pub fn id(&self) -> &DomainEventId {
        &self.id
    }
    pub fn table(&self) -> &Table {
        &self.table
    }
    pub fn action(&self) -> &str {
        &self.action
    }
    pub fn user_id(&self) -> &UserId {
        &self.user_id
    }
    pub fn occurred_at(&self) -> &DateTime {
        &self.occurred_at
    }
    pub fn before(&self) -> &T {
        &self.before
    }
    pub fn after(&self) -> &T {
        &self.after
    }
}
