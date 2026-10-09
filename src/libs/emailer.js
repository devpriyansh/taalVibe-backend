import nodemailer from 'nodemailer'
import logger from './logger'

export const sendEmail = async ({ to, subject, html, text }) => {
  try {
    // If SMTP credentials aren't provided in .env, just log it for testing
    if (!process.env.SMTP_HOST) {
      logger.info('================= MOCK EMAIL =================')
      logger.info(`To: ${to}`)
      logger.info(`Subject: ${subject}`)
      logger.info(`Body: ${text}`)
      logger.info('==============================================')
      return { success: true, message: 'Mock email sent' }
    }

    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: process.env.SMTP_PORT || 587,
      secure: process.env.SMTP_SECURE === 'true', // true for 465, false for other ports
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
      }
    })

    const info = await transporter.sendMail({
      from: `"TaalVibe" <${process.env.SMTP_USER || 'noreply@taalvibe.com'}>`,
      to,
      subject,
      text,
      html
    })

    logger.info(`Message sent: ${info.messageId}`)
    return { success: true, messageId: info.messageId }
  } catch (error) {
    console.error('Nodemailer Error:', error)
    logger.error('Error sending email:', error)
    return { success: false, error: error.message || String(error) }
  }
}
