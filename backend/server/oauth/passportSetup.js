import passport from 'passport'
import { Strategy as GoogleStrategy } from 'passport-google-oauth20'
import { Strategy as GitHubStrategy } from 'passport-github2'
import { Strategy as LinkedInStrategy } from 'passport-linkedin-oauth2'
import {
  githubAuthLoginCreds,
  googleOAuthCreds,
  isProviderConfigured,
  linkedInOAuthCreds,
} from './oauthConfig.js'

/**
 * @param {{ onOAuthProfile: (profile: object) => Promise<{ ok: boolean, user?: object, error?: string, message?: string }> }} hooks
 */
export function configurePassport(hooks) {
  passport.serializeUser((user, done) => done(null, user))
  passport.deserializeUser((user, done) => done(null, user))

  if (isProviderConfigured('google')) {
    const { clientId, clientSecret, callbackURL } = googleOAuthCreds()
    passport.use(
      new GoogleStrategy(
        {
          clientID: clientId,
          clientSecret: clientSecret,
          callbackURL,
          scope: ['profile', 'email'],
        },
        async (_accessToken, _refreshToken, profile, done) => {
          try {
            const email = String(profile?.emails?.[0]?.value || '').trim().toLowerCase()
            const result = await hooks.onOAuthProfile({
              provider: 'google',
              sub: String(profile?.id || ''),
              email,
              name: String(profile?.displayName || email || 'User').trim(),
              username: String(profile?.username || profile?.displayName || '').trim(),
              profileImage: String(profile?.photos?.[0]?.value || '').trim(),
            })
            if (!result.ok) return done(null, false, { message: result.error || result.message })
            return done(null, result.user)
          } catch (e) {
            return done(e)
          }
        },
      ),
    )
  }

  if (isProviderConfigured('github')) {
    const { clientId, clientSecret, callbackURL } = githubAuthLoginCreds()
    passport.use(
      new GitHubStrategy(
        {
          clientID: clientId,
          clientSecret: clientSecret,
          callbackURL,
          scope: ['user:email'],
        },
        async (_accessToken, _refreshToken, profile, done) => {
          try {
            const email = String(profile?.emails?.[0]?.value || profile?.email || '').trim().toLowerCase()
            const result = await hooks.onOAuthProfile({
              provider: 'github',
              sub: String(profile?.id || ''),
              email,
              name: String(profile?.displayName || profile?.username || email || 'User').trim(),
              username: String(profile?.username || '').trim(),
              profileImage: String(profile?.photos?.[0]?.value || profile?._json?.avatar_url || '').trim(),
            })
            if (!result.ok) return done(null, false, { message: result.error || result.message })
            return done(null, result.user)
          } catch (e) {
            return done(e)
          }
        },
      ),
    )
  }

  if (isProviderConfigured('linkedin')) {
    const { clientId, clientSecret, callbackURL } = linkedInOAuthCreds()
    passport.use(
      new LinkedInStrategy(
        {
          clientID: clientId,
          clientSecret: clientSecret,
          callbackURL,
          scope: ['r_emailaddress', 'r_liteprofile'],
          state: true,
        },
        async (_accessToken, _refreshToken, profile, done) => {
          try {
            const email = String(profile?.emails?.[0]?.value || '').trim().toLowerCase()
            const result = await hooks.onOAuthProfile({
              provider: 'linkedin',
              sub: String(profile?.id || ''),
              email,
              name: String(profile?.displayName || email || 'User').trim(),
              username: String(profile?.id || '').trim(),
              profileImage: String(profile?.photos?.[0]?.value || '').trim(),
            })
            if (!result.ok) return done(null, false, { message: result.error || result.message })
            return done(null, result.user)
          } catch (e) {
            return done(e)
          }
        },
      ),
    )
  }

  return passport
}
