/**
 * Thin SQL runner — async API for both SQLite (sync under the hood) and PostgreSQL.
 */

function toPgParams(sql, params) {
  let i = 0
  const values = Array.isArray(params) ? [...params] : []
  const text = sql.replace(/\?/g, () => {
    i += 1
    return `$${i}`
  })
  return { text, values }
}

function namedToPg(sql, params) {
  const values = []
  const keys = []
  const text = sql.replace(/@(\w+)/g, (_, key) => {
    keys.push(key)
    values.push(params[key])
    return `$${values.length}`
  })
  return { text, values }
}

/**
 * @param {{ dialect: string, sqlite?: import('better-sqlite3').Database | null, pool?: import('pg').Pool | null }} platformDb
 */
export function createSqlRunner(platformDb) {
  if (platformDb.dialect === 'postgres' && platformDb.pool) {
    const pool = platformDb.pool
    return {
      dialect: 'postgres',
      async query(sql, params = []) {
        const { text, values } = toPgParams(sql, params)
        const res = await pool.query(text, values)
        return res.rows
      },
      async queryOne(sql, params = []) {
        const rows = await this.query(sql, params)
        return rows[0] ?? null
      },
      async run(sql, params = []) {
        const { text, values } = toPgParams(sql, params)
        await pool.query(text, values)
      },
      async runNamed(sql, params = {}) {
        const { text, values } = namedToPg(sql, params)
        await pool.query(text, values)
      },
      async exec(sql) {
        await pool.query(sql)
      },
      async transaction(fn) {
        const client = await pool.connect()
        try {
          await client.query('BEGIN')
          const tx = {
            query: async (sql, params = []) => {
              const { text, values } = toPgParams(sql, params)
              const res = await client.query(text, values)
              return res.rows
            },
            run: async (sql, params = []) => {
              const { text, values } = toPgParams(sql, params)
              await client.query(text, values)
            },
            runNamed: async (sql, params = {}) => {
              const { text, values } = namedToPg(sql, params)
              await client.query(text, values)
            },
          }
          await fn(tx)
          await client.query('COMMIT')
        } catch (e) {
          await client.query('ROLLBACK')
          throw e
        } finally {
          client.release()
        }
      },
    }
  }

  if (platformDb.dialect === 'sqlite' && platformDb.sqlite) {
    const db = platformDb.sqlite
    return {
      dialect: 'sqlite',
      async query(sql, params = []) {
        return db.prepare(sql).all(...(Array.isArray(params) ? params : []))
      },
      async queryOne(sql, params = []) {
        return db.prepare(sql).get(...(Array.isArray(params) ? params : [])) ?? null
      },
      async run(sql, params = []) {
        if (Array.isArray(params)) {
          db.prepare(sql).run(...params)
          return
        }
        db.prepare(sql).run(params)
      },
      async runNamed(sql, params = {}) {
        db.prepare(sql).run(params)
      },
      async exec(sql) {
        db.exec(sql)
      },
      async transaction(fn) {
        const wrapped = db.transaction(() => {
          const tx = {
            query: (s, p = []) => db.prepare(s).all(...(Array.isArray(p) ? p : [])),
            run: (s, p = []) => {
              if (Array.isArray(p)) db.prepare(s).run(...p)
              else db.prepare(s).run(p)
            },
            runNamed: (s, p = {}) => db.prepare(s).run(p),
          }
          return fn(tx)
        })
        return wrapped()
      },
    }
  }

  return null
}
