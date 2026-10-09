import passport from 'passport'
import { messages } from '../../utils/constants/error.constants'
import db from '../../db/models'

export function isUserAuthenticated (req, res, next) {
  let authHeader = req.headers.authorization

  // Fallback to query token for streaming audio tags
  if (!authHeader && req.query.token) {
    authHeader = `Bearer ${req.query.token}`;
    req.headers.authorization = authHeader;
  }

  // Check if the Authorization header exists
  if (!authHeader) {
    return res.status(401).json({ message: 'Unauthorized' })
  }

  // Authenticate using Passport's JWT strategy
  passport.authenticate('jwt', (err, data, info) => {
    if (err) {
      console.error('Authentication Error:', err)

      // Handle specific authentication errors
      if (err.message === messages.USER_DOES_NOT_EXISTS) {
        return res.status(404).json({ message: 'We couldn’t find your account.' })
      }

      return res.status(401).json({ message: 'You don’t have access to do that.' })
    }

    // Check if `data` or `data.detail` is undefined
    if (!data || !data.detail) {
      console.error('Authentication Error: Missing or invalid token payload.', info ? info.message : '')
      return res.status(401).json({ message: 'Unauthorized' })
    }

    // Wrap async logic inside an IIFE
    (async () => {
      try {
        /**
        * ---------------------------------------
        * SINGLE ACTIVE SESSION CHECK
        * ---------------------------------------
        */
        const sessionId = data.detail.sessionId
        const userId = data.detail.id

        if (!sessionId) {
          return res.status(401).json({
            message: 'Session expired. Please log in again.'
          })
        }

        const session = await db.UserSession.findOne({
          where: {
            id: sessionId,
            user_id: userId
          }
        })

        if (!session) {
          return res.status(401).json({
            message: 'Session expired. You were signed out because your account was used on another device.'
          })
        }

        // Populate `req.body` with user details for further processing
        req.body = req.body || {}
        req.body.user = data.detail
        req.userId = Number(data.detail.id)
        req.sessionId = data.detail.sessionId
        next()
      } catch (error) {
        console.error('Internal Server Error:', error)
        return res.status(500).json({ message: 'Internal server error' })
      }
    })()
  })(req, res, next)
}
