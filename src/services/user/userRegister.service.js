import db, { sequelize } from '../../db/models'
import serviceBase from '../../libs/serviceBase'
import ajv from '../../libs/ajv'
import { encryptPassword, generateRandomUserName } from '../../utils/common.util'
import { createNewEntity, getOne } from '../../helpers/crud'
import { memoryStore } from '../../libs/memoryStore'

const schema = {
  type: 'object',
  properties: {
    email: { type: 'string', format: 'email' },
    password: { type: 'string' },
    confirmPassword: { type: 'string' },
    firstName: { type: 'string' },
    lastName: { type: 'string' }
  },
  required: ['email', 'password', 'confirmPassword']
}

const constraints = ajv.compile(schema)

export default class UserRegister extends serviceBase {
  get constraints() {
    return constraints
  }

  async run() {
    const { email, password, confirmPassword, firstName, lastName } = this.args
    const t = this.context.sequelizeTransaction

    try {
      if (password !== confirmPassword) {
        return this.addError('PasswordMismatchErrorType', 'Passwords don’t match.')
      }

      // Check if email was verified
      const isVerified = memoryStore.get(`verified:${email.toLowerCase()}`)
      if (!isVerified) {
        return this.addError('EmailNotVerifiedErrorType', 'Email address has not been verified. Please verify your email first.')
      }

      const existingUser = await getOne({
        model: db.User,
        data: { email: email.toLowerCase() },
        attributes: ['id', 'email'],
        transaction: t
      })

      if (existingUser) {
        return this.addError('UserAlreadyExistsErrorType', 'An account with this email already exists.')
      }

      const hashedPassword = await encryptPassword(password)
      const randomUserName = await generateRandomUserName()

      const newUser = {
        userName: randomUserName,
        password: hashedPassword,
        email: email.toLowerCase(),
        firstName,
        lastName
      }

      const createUser = await createNewEntity({
        model: db.User,
        data: newUser,
        transaction: t
      })

      // Clean up verification flag
      memoryStore.del(`verified:${email.toLowerCase()}`)

      delete createUser.password

      return { message: 'Registration successful!', status: 200, result: { createUser } }
    } catch (error) {
      console.error('Signup Error: ', error)
      return this.addError('InternalServerErrorType', error.message || 'Something went wrong on our side. Please try again.')
    }
  }
}
