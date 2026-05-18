import { signAccessToken } from './jwt.js'
import { toPublicAuthUser } from './userPublic.js'

export function issueAuthResponse(user) {
  const publicUser = toPublicAuthUser(user)
  const accessToken = signAccessToken({
    sub: String(user.id),
    email: user.email,
    role: publicUser.roleSlug,
  })
  return { publicUser, accessToken }
}
