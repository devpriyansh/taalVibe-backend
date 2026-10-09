import db from '../../db/models'
import serviceBase from '../../libs/serviceBase'
import ajv from '../../libs/ajv'
import { comparePassword, signAccessToken, signRefreshToken } from '../../utils/common.util'

const schema = {
  type: 'object',
  properties: {
    email: { type: 'string', format: 'email' },
    password: { type: 'string' }
  },
  required: ['email', 'password']
}

const constraints = ajv.compile(schema)

export default class UserLogin extends serviceBase {
  get constraints () {
    return constraints
  }

  async run () {
    const { email, password } = this.args

    try {
      const user = await db.User.findOne({
        where: { email }
      })

      if (!user) {
        return this.addError(
          'InvalidCredentialsErrorType',
          'Invalid email or password.'
        )
      }

      const isValidPassword = await comparePassword(password, user.password)

      if (!isValidPassword) {
        return this.addError(
          'InvalidCredentialsErrorType',
          'Invalid email or password.'
        )
      }

      // Create UserSession
      const userSession = await db.UserSession.create({
        user_id: user.id
      }, { transaction: this.context.sequelizeTransaction })

      // Sign tokens
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
        message: "You've successfully logged in.",
        status: 200,
        result: {
          user: {
            id: user.id,
            userName: user.userName,
            email: user.email,
            role: user.role
          },
          loginToken,
          refreshToken,
          sessionId: userSession.id
        }
      }
    } catch (error) {
      console.error('Login Error:', error)
      return this.addError(
        'InternalServerErrorType',
        'Something went wrong on our side. Please try again.'
      )
    }
  }
}
