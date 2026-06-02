import { signAccessToken } from './jwt.js'
import { signRefreshToken } from './refreshTokens.js'
import { toPublicAuthUser } from './userPublic.js'

export function issueAuthResponse(user) {
  const publicUser = toPublicAuthUser(user)
  const base = {
    sub: String(user.id),
    email: user.email,
    role: publicUser.roleSlug,
  }
  const accessToken = signAccessToken(base)
  const refreshToken = signRefreshToken(base)
  return { publicUser, accessToken, refreshToken }
}
