import serviceBase from '../../libs/serviceBase'
import ajv from '../../libs/ajv'
import db from '../../db/models'

const schema = {
  type: 'object',
  properties: {
    userId: { type: 'integer' },
    firstName: { type: 'string', minLength: 1 },
    lastName: { type: 'string' },
    phone: { type: 'string' }
  },
  required: ['userId', 'firstName']
}

const constraints = ajv.compile(schema)

export default class updateProfileService extends serviceBase {
  get constraints () {
    return constraints
  }

  async run () {
    const { userId, firstName, lastName, phone } = this.args
    try {
      const user = await db.User.findOne({ where: { id: userId } })
      if (!user) {
        return this.addError('UserNotFoundErrorType', 'User not found.')
      }

      await user.update({
        firstName,
        lastName: lastName || null,
        phone: phone || null
      }, {
        transaction: this.context.sequelizeTransaction
      })

      const updatedUser = {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        userName: user.userName,
        phone: user.phone,
        geminiApiKey: user.geminiApiKey,
        role: user.role
      }

      return {
        result: { user: updatedUser },
        message: 'Profile updated successfully.',
        status: 200
      }
    } catch (error) {
      console.log(error)
      return this.addError(
        'InternalServerErrorType',
        'Something went wrong on our side. Please try again.'
      )
    }
  }
}
