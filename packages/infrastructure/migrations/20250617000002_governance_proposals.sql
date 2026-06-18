-- Task 33.7: governance proposal queue + approvals.
CREATE TABLE IF NOT EXISTS governance_proposals (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  proposal_type TEXT NOT NULL,
  payload JSONB NOT NULL,
  payload_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  required_approvals INT NOT NULL DEFAULT 3,
  proposer_user_id TEXT NOT NULL,
  rejection_reason_code TEXT,
  rejection_reason_text TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  reviewable_after TIMESTAMPTZ NOT NULL,
  applied_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_governance_proposals_pending_dedup
  ON governance_proposals (proposal_type, tenant_id, payload_hash)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_governance_proposals_status
  ON governance_proposals (status, created_at DESC);

CREATE TABLE IF NOT EXISTS governance_approvals (
  proposal_id TEXT NOT NULL REFERENCES governance_proposals(id) ON DELETE CASCADE,
  approver_user_id TEXT NOT NULL,
  approved_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (proposal_id, approver_user_id)
);

-- Append-only audit: block updates/deletes on admin_audit rows.
CREATE OR REPLACE FUNCTION admin_audit_immutable()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'admin_audit is append-only';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_admin_audit_immutable ON admin_audit;
CREATE TRIGGER trg_admin_audit_immutable
  BEFORE UPDATE OR DELETE ON admin_audit
  FOR EACH ROW EXECUTE FUNCTION admin_audit_immutable();
