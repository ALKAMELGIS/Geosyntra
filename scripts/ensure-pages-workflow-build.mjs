/**
 * Ensures GitHub Pages uses build_type "workflow" so the site is published only
 * from actions/deploy-pages artifacts — never from a random branch (e.g. main).
 *
 * Env: GITHUB_REPOSITORY (owner/name), GITHUB_TOKEN (Actions), optional PAGES_ADMIN_TOKEN.
 * Exits 1 with stderr hints if Pages cannot be switched and deploy would 404/wrong content.
 */
import process from 'node:process'

const repo = process.env.GITHUB_REPOSITORY
const defaultTok = process.env.GITHUB_TOKEN
const adminTok = process.env.PAGES_ADMIN_TOKEN

if (!repo || !defaultTok) {
  console.error('ensure-pages-workflow-build: missing GITHUB_REPOSITORY or GITHUB_TOKEN')
  process.exit(1)
}

const [owner, name] = repo.split('/')
if (!owner || !name) {
  console.error('ensure-pages-workflow-build: bad GITHUB_REPOSITORY', repo)
  process.exit(1)
}

const api = `https://api.github.com/repos/${owner}/${name}/pages`
const ver = '2022-11-28'

/** @param {string} token */
function headers(token) {
  return {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${token}`,
    'X-GitHub-Api-Version': ver,
    'Content-Type': 'application/json',
  }
}

/** @param {string} token */
async function getConfig(token) {
  const res = await fetch(api, { headers: headers(token) })
  const text = await res.text()
  let json = null
  try {
    json = text ? JSON.parse(text) : null
  } catch {
    json = null
  }
  return { res, json, text }
}

/** @param {string} token @param {string} method @param {unknown} body */
async function writePages(token, method, body) {
  const res = await fetch(api, {
    method,
    headers: headers(token),
    body: JSON.stringify(body),
  })
  const text = await res.text()
  return { ok: res.ok, status: res.status, text }
}

/** GitHub often accepts workflow + placeholder source on create/update. */
const workflowBody = { build_type: 'workflow', source: { branch: 'main', path: '/' } }
const workflowBodyMinimal = { build_type: 'workflow' }

async function trySwitch(token, label) {
  const { res, json, text } = await getConfig(token)
  if (res.status === 200 && json?.build_type === 'workflow') {
    console.log(`ensure-pages-workflow-build: already workflow (${label})`)
    return true
  }
  const needsWorkflowSwitch =
    res.status === 200 && (json?.build_type === 'legacy' || json?.build_type == null || json?.build_type === '')
  if (needsWorkflowSwitch) {
    for (const body of [workflowBodyMinimal, workflowBody]) {
      const put = await writePages(token, 'PUT', body)
      if (put.ok || put.status === 204) {
        console.log(`ensure-pages-workflow-build: switched to workflow via PUT (${label})`)
        return true
      }
      console.error(`ensure-pages-workflow-build: PUT failed (${label})`, put.status, put.text?.slice(0, 500))
    }
    return false
  }
  if (res.status === 404) {
    for (const body of [workflowBody, workflowBodyMinimal]) {
      const post = await writePages(token, 'POST', body)
      if (post.ok || post.status === 201) {
        console.log(`ensure-pages-workflow-build: created Pages with workflow (${label})`)
        return true
      }
      console.error(`ensure-pages-workflow-build: POST failed (${label})`, post.status, post.text?.slice(0, 500))
    }
    return false
  }
  console.error(`ensure-pages-workflow-build: GET /pages unexpected`, res.status, text?.slice(0, 400))
  return false
}

async function main() {
  if (await trySwitch(defaultTok, 'GITHUB_TOKEN')) return

  if (adminTok && adminTok !== defaultTok) {
    console.error('ensure-pages-workflow-build: retrying with PAGES_ADMIN_TOKEN')
    if (await trySwitch(adminTok, 'PAGES_ADMIN_TOKEN')) return
  }

  console.error(
    [
      'ensure-pages-workflow-build: could not set Pages to GitHub Actions (workflow).',
      'Fix: https://github.com/' + repo + '/settings/pages → Build and deployment → Source → GitHub Actions.',
      'Or add repo secret PAGES_ADMIN_TOKEN (classic: repo scope; fine-grained: Administration + Contents on this repo).',
    ].join('\n'),
  )
  process.exit(1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
