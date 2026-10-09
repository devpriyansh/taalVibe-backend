import serviceBase from '../../libs/serviceBase'
import ajv from '../../libs/ajv'
import { memoryStore } from '../../libs/memoryStore'
import { sendEmail } from '../../libs/emailer'

const schema = {
  type: 'object',
  properties: {
    email: { type: 'string', format: 'email' }
  },
  required: ['email']
}

const constraints = ajv.compile(schema)

export default class SendVerificationOtp extends serviceBase {
  get constraints () {
    return constraints
  }

  async run () {
    const { email } = this.args

    try {
      // Generate a 6 digit OTP
      const otp = Math.floor(100000 + Math.random() * 900000).toString()

      // Store in memory for 5 minutes (300 seconds)
      memoryStore.setEx(`otp:${email.toLowerCase()}`, 300, otp)

      const subject = 'Your TaalVibe Verification Code'
      const text = `Your email verification code is: ${otp}. It will expire in 5 minutes.`
      const html = `
      <div style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; max-width: 500px; margin: 0 auto; background-color: #121212; border-radius: 16px; overflow: hidden; color: #ffffff; text-align: center; border: 1px solid #2a2a2a; box-shadow: 0 4px 20px rgba(0,0,0,0.5);">
        <div style="background: linear-gradient(135deg, #a855f7 0%, #d946ef 100%); padding: 30px 20px;">
          <h2 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 800; letter-spacing: 1px;">TaalVibe</h2>
        </div>
        <div style="padding: 40px 30px;">
          <h3 style="margin-top: 0; color: #ffffff; font-size: 20px; font-weight: 600;">Verify Your Email</h3>
          <p style="color: #a3a3a3; font-size: 15px; line-height: 1.5; margin-bottom: 30px;">
            Welcome to TaalVibe! Please use the verification code below to complete your sign up. This code will expire in 5 minutes.
          </p>
          <div style="background-color: #1e1e1e; border-radius: 12px; padding: 20px; margin-bottom: 30px; border: 1px solid #333;">
            <h1 style="margin: 0; color: #d946ef; font-size: 42px; letter-spacing: 8px; font-weight: 700;">${otp}</h1>
          </div>
          <p style="color: #666666; font-size: 13px; margin: 0;">
            If you didn't request this code, you can safely ignore this email.
          </p>
        </div>
      </div>
      `

      const emailResponse = await sendEmail({ to: email, subject, text, html })

      if (!emailResponse.success) {
        return this.addError('EmailSendErrorType', 'Failed to send verification email. Please try again later.')
      }

      return { message: 'OTP sent successfully', status: 200, result: { success: true } }
    } catch (error) {
      console.error('Send OTP Error: ', error)
      return this.addError('InternalServerErrorType', error.message || 'Something went wrong while sending OTP.')
    }
  }
}
