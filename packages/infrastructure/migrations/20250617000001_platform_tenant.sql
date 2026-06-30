-- Task 33.1: Geosyntra platform super-tenant flag.
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS is_platform_tenant BOOLEAN NOT NULL DEFAULT FALSE;

UPDATE tenants
SET name = 'Geosyntra', is_platform_tenant = TRUE
WHERE id = 'geosyntra-default';

INSERT INTO tenants (id, name, is_platform_tenant)
VALUES ('geosyntra-default', 'Geosyntra', TRUE)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  is_platform_tenant = TRUE,
  updated_at = NOW();
