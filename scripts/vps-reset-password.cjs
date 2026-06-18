// Resets an admin_users password on the VPS DB using the app's bcryptjs (rounds 12).
// Usage: node /tmp/reset.cjs <email> <newPassword>
const DB_PATH = '/var/lib/geosyntra-api/geosyntra_platform.db';
const MODULES = '/opt/geosyntra-api/node_modules';

const email = String(process.argv[2] || '').trim().toLowerCase();
const password = String(process.argv[3] || '');
if (!email || password.length < 8) {
  console.log('ERR usage: reset.cjs <email> <password(min8)>');
  process.exit(2);
}

try {
  const Database = require(MODULES + '/better-sqlite3');
  const bcrypt = require(MODULES + '/bcryptjs');
  const db = new Database(DB_PATH);
  const hash = bcrypt.hashSync(password, 12);
  const info = db
    .prepare(
      "UPDATE admin_users SET password_hash = ?, email_verified = 1, status = 'Active', updated_at = ? WHERE lower(email) = ?",
    )
    .run(hash, new Date().toISOString(), email);
  if (info.changes === 0) {
    console.log('ERR no_user_matched', email);
    process.exit(1);
  }
  const row = db
    .prepare('SELECT email, role, status, email_verified FROM admin_users WHERE lower(email) = ?')
    .get(email);
  console.log('RESET_OK', JSON.stringify(row));
  console.log('VERIFY', bcrypt.compareSync(password, hash));
} catch (e) {
  console.log('ERR', e.message);
  process.exit(1);
}
