//! Governance quorum, dedup, review window, expiry — requires Postgres.

use std::sync::Arc;

use application::{
    dto::governance::CreateGovernanceProposalCommand,
    error::AppError,
    ports::GovernanceRepository,
    SubjectContext,
};
use domain::{TenantId, UserId};
use infrastructure::{
    authz::{ensure_platform_tenant, seed_default_tenant_matrix, DEFAULT_TENANT_ID},
    postgres::{connect, run_migrations, PostgresGovernanceRepository},
};
use serde_json::json;

fn ctx(user_id: &str) -> SubjectContext {
    SubjectContext::new(
        UserId::new(user_id),
        TenantId::new(DEFAULT_TENANT_ID),
        &[],
        &[],
    )
}

#[tokio::test]
#[ignore = "requires DATABASE_URL and Postgres"]
async fn governance_proposer_cannot_self_approve() {
    let url = std::env::var("DATABASE_URL").expect("DATABASE_URL");
    let pool = Arc::new(connect(&url).await.expect("connect"));
    run_migrations(pool.as_ref()).await.expect("migrate");
    ensure_platform_tenant(pool.as_ref()).await.expect("platform");
    seed_default_tenant_matrix(pool.as_ref()).await.expect("seed");

    let repo = PostgresGovernanceRepository::new(pool);
    let proposer = ctx("1001");
    let proposal = repo
        .create_proposal(
            proposer.clone(),
            CreateGovernanceProposalCommand {
                proposal_type: "tenant.create".into(),
                tenant_id: DEFAULT_TENANT_ID.into(),
                payload: json!({ "id": "gov-test-a", "name": "Gov Test A" }),
            },
        )
        .await
        .expect("create");

    let err = repo
        .approve(proposer, &proposal.id)
        .await
        .expect_err("proposer must not approve");
    assert!(matches!(err, AppError::Forbidden));
}

#[tokio::test]
#[ignore = "requires DATABASE_URL and Postgres"]
async fn governance_rejects_duplicate_pending_proposal() {
    let url = std::env::var("DATABASE_URL").expect("DATABASE_URL");
    let pool = Arc::new(connect(&url).await.expect("connect"));
    run_migrations(pool.as_ref()).await.expect("migrate");
    ensure_platform_tenant(pool.as_ref()).await.expect("platform");

    let repo = PostgresGovernanceRepository::new(pool);
    let cmd = CreateGovernanceProposalCommand {
        proposal_type: "tenant.create".into(),
        tenant_id: DEFAULT_TENANT_ID.into(),
        payload: json!({ "id": "gov-dedup-b", "name": "Gov Dedup B" }),
    };
    repo.create_proposal(ctx("1002"), cmd.clone())
        .await
        .expect("first");
    let err = repo
        .create_proposal(ctx("1003"), cmd)
        .await
        .expect_err("duplicate");
    assert!(matches!(err, AppError::Conflict(_)));
}

#[tokio::test]
#[ignore = "requires DATABASE_URL and Postgres"]
async fn governance_blocks_approval_during_review_window() {
    let url = std::env::var("DATABASE_URL").expect("DATABASE_URL");
    let pool = Arc::new(connect(&url).await.expect("connect"));
    run_migrations(pool.as_ref()).await.expect("migrate");

    let repo = PostgresGovernanceRepository::new(pool.clone());
    let proposal = repo
        .create_proposal(
            ctx("2001"),
            CreateGovernanceProposalCommand {
                proposal_type: "tenant.create".into(),
                tenant_id: DEFAULT_TENANT_ID.into(),
                payload: json!({ "id": "gov-review-c", "name": "Gov Review C" }),
            },
        )
        .await
        .expect("create");

    let err = repo
        .approve(ctx("2002"), &proposal.id)
        .await
        .expect_err("review window");
    assert!(matches!(err, AppError::ValidationError(ref m) if m.contains("review_window")));
}

#[tokio::test]
#[ignore = "requires DATABASE_URL and Postgres"]
async fn governance_rejects_expired_proposal() {
    let url = std::env::var("DATABASE_URL").expect("DATABASE_URL");
    let pool = Arc::new(connect(&url).await.expect("connect"));
    run_migrations(pool.as_ref()).await.expect("migrate");

    let repo = PostgresGovernanceRepository::new(pool.clone());
    let proposal = repo
        .create_proposal(
            ctx("3001"),
            CreateGovernanceProposalCommand {
                proposal_type: "tenant.create".into(),
                tenant_id: DEFAULT_TENANT_ID.into(),
                payload: json!({ "id": "gov-expire-d", "name": "Gov Expire D" }),
            },
        )
        .await
        .expect("create");

    sqlx::query(
        "UPDATE governance_proposals SET expires_at = NOW() - INTERVAL '1 hour', reviewable_after = NOW() - INTERVAL '2 hours' WHERE id = $1",
    )
    .bind(&proposal.id)
    .execute(pool.as_ref())
    .await
    .expect("backdate");

    let err = repo
        .approve(ctx("3002"), &proposal.id)
        .await
        .expect_err("expired");
    assert!(matches!(err, AppError::ValidationError(ref m) if m.contains("expired")));
}

#[tokio::test]
#[ignore = "requires DATABASE_URL and Postgres"]
async fn governance_scopes_proposals_by_tenant_id() {
    let url = std::env::var("DATABASE_URL").expect("DATABASE_URL");
    let pool = Arc::new(connect(&url).await.expect("connect"));
    run_migrations(pool.as_ref()).await.expect("migrate");
    ensure_platform_tenant(pool.as_ref()).await.expect("platform");

    sqlx::query("INSERT INTO tenants (id, name, created_at) VALUES ('tenant-b', 'Tenant B', NOW()) ON CONFLICT DO NOTHING")
        .execute(pool.as_ref())
        .await
        .expect("tenant b");

    let repo = PostgresGovernanceRepository::new(pool);
    let a = repo
        .create_proposal(
            ctx("4001"),
            CreateGovernanceProposalCommand {
                proposal_type: "tenant.create".into(),
                tenant_id: DEFAULT_TENANT_ID.into(),
                payload: json!({ "id": "gov-iso-e1", "name": "Iso E1" }),
            },
        )
        .await
        .expect("a");
    let b = repo
        .create_proposal(
            ctx("4002"),
            CreateGovernanceProposalCommand {
                proposal_type: "tenant.create".into(),
                tenant_id: "tenant-b".into(),
                payload: json!({ "id": "gov-iso-e2", "name": "Iso E2" }),
            },
        )
        .await
        .expect("b");

    assert_eq!(a.tenant_id, DEFAULT_TENANT_ID);
    assert_eq!(b.tenant_id, "tenant-b");
    assert_ne!(a.payload_hash, b.payload_hash);
}
