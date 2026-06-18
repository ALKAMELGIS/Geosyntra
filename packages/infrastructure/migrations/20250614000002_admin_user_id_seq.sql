-- Task 9: DB-generated UserId for CreateUser (risk H3 infra boundary).
CREATE SEQUENCE IF NOT EXISTS admin_user_id_seq;

SELECT setval(
  'admin_user_id_seq',
  GREATEST(COALESCE((SELECT MAX(id) FROM admin_users), 0), 1),
  (SELECT COUNT(*) > 0 FROM admin_users)
);
