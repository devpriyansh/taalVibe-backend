import { v4 as uuid } from 'uuid'
import config from '../../configs/app.config'
import models, { sequelize } from '../../db/models'
import Logger from '../../libs/logger'
import socketEmitter from '../../libs/socketEmitter'

const transactionStatuses = ['commit', 'rollback']
const errorStatusCodes = ['4', '5']

/**
 *
 * @export
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 * It will create a context for each request the context will hold things like
 * traceId - id of the request
 * sequelize - sequelize database connection
 * dbModels - all sequelize models
 * logger - logger instance
 * socketEmitter - socket emitter for emitting data directly
 *
 * It will also start the transaction and at the end of the response it will commit it or rollback as per the data
 */
export default async function contextMiddleware (req, res, next) {
  const context = {}
  context.req = req
  context.reqTimeStamp = Date.now()
  context.traceId = uuid()
  context.sequelize = sequelize
  context.dbModels = models
  context.logger = Logger
  context.socketEmitter = socketEmitter

  if (config.get('automatic_transactions')) {
    /** @type {import('sequelize').Transaction} */
    context.sequelizeTransaction = await sequelize.transaction()

    const onFinishAndClose = async () => {
      try {
        if (~transactionStatuses.indexOf(context.sequelizeTransaction.finished)) {
          return
        }

        if (~errorStatusCodes.indexOf(res.statusCode.toString()[0]) || res.payload?.errors?.length || !res.payload) {
          await context.sequelizeTransaction.rollback()
          return
        }

        await context.sequelizeTransaction.commit()
      } catch (err) {
        context.logger?.warn?.(`Transaction cleanup error: ${err.message}`)
      }
    }

    res.on('finish', onFinishAndClose)
    res.on('close', onFinishAndClose)
  }

  req.context = context
  next()
}
