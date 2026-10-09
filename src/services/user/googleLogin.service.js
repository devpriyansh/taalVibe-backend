import axios from 'axios'
import db from '../../db/models'
import serviceBase from '../../libs/serviceBase'
import ajv from '../../libs/ajv'
import { signAccessToken, signRefreshToken, generateRandomUserName, encryptPassword } from '../../utils/common.util'
import { createNewEntity, getOne } from '../../helpers/crud'

const schema = {
  type: 'object',
  properties: {
    accessToken: { type: 'string' }
  },
  required: ['accessToken']
}

const constraints = ajv.compile(schema)

export default class GoogleLogin extends serviceBase {
  get constraints () {
    return constraints
  }

  async run () {
    const { accessToken } = this.args
    const t = this.context.sequelizeTransaction

    try {
      // 1. Verify the access token with Google and get user info
      let userInfo
      try {
        const response = await axios.get('https://www.googleapis.com/oauth2/v3/userinfo', {
          headers: { Authorization: `Bearer ${accessToken}` }
        })
        userInfo = response.data
      } catch (err) {
        return this.addError(
          'InvalidTokenErrorType',
          'Failed to verify Google access token.'
        )
      }

      if (!userInfo || !userInfo.email) {
        return this.addError(
          'InvalidTokenErrorType',
          'Google token did not provide an email address.'
        )
      }

      const email = userInfo.email.toLowerCase()

      // 2. Check if user already exists
      let user = await getOne({
        model: db.User,
        data: { email },
        transaction: t
      })

      // 3. If user doesn't exist, create a new one
      if (!user) {
        // Generate a random, secure password since they login via Google
        const randomPassword = Math.random().toString(36).slice(-10) + Math.random().toString(36).slice(-10)
        // Note: encryptPassword expects base64 in the util, so we encode it first
        const b64Password = Buffer.from(randomPassword).toString('base64')
        const hashedPassword = await encryptPassword(b64Password)
        const randomUserName = await generateRandomUserName()

        const newUser = {
          userName: randomUserName,
          password: hashedPassword,
          email,
          firstName: userInfo.given_name || userInfo.name,
          lastName: userInfo.family_name || '',
          profilePicture: userInfo.picture
        }

        user = await createNewEntity({
          model: db.User,
          data: newUser,
          transaction: t
        })
      }

      // 4. Create UserSession
      const userSession = await db.UserSession.create({
        user_id: user.id
      }, { transaction: t })

      // 5. Sign tokens
      const loginToken = await signAccessToken({
        id: user.id,
        userName: user.userName,
        email: user.email,
        sessionId: userSession.id
      })

      const refreshToken = await signRefreshToken({
        id: user.id,
        userName: user.userName,
        sessionId: userSession.id
      })

      return {
        message: "You've successfully logged in with Google.",
        status: 200,
        result: {
          user: {
            id: user.id,
            userName: user.userName,
            email: user.email,
            firstName: user.firstName,
            lastName: user.lastName,
            profilePicture: user.profilePicture,
            role: user.role
          },
          loginToken,
          refreshToken,
          sessionId: userSession.id
        }
      }
    } catch (error) {
      console.error('Google Login Error:', error)
      return this.addError(
        'InternalServerErrorType',
        'Something went wrong on our side. Please try again.'
      )
    }
  }
}
