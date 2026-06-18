/** Shared storage key — isolated so `adminDirectoryPersistence` never statically imports `audit` (breaks audit ↔ directory cycle). */
export const AUDIT_LOG_STORAGE_KEY = 'audit_log_v1'
