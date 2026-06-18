use domain::{DomainEventId, Event, UserId, events::DomainEvent};

use crate::{SubjectContext, error::AppResult};



#[async_trait::async_trait]
pub trait EventRepository <T: Clone + Event>{
    async fn get_by_user(&self, ctx: SubjectContext, user_id: UserId) -> AppResult<DomainEvent<T>>;
    async fn get_by_id(&self, ctx: SubjectContext, id: DomainEventId) -> AppResult<DomainEvent<T>>;
    async fn get_by_table(&self, ctx: SubjectContext, table: &str) -> AppResult<Vec<DomainEvent<T>>>;
    async fn get_users_paginated(&self, ctx: SubjectContext,sort_by: &str, page: u32, page_size: u32) -> AppResult<Vec<DomainEvent<T>>>;
}
