import bodyParser from 'body-parser'
import cors from 'cors'
import express from 'express'
import helmet from 'helmet'
import morgan from 'morgan'
import routes from '../rest-resources/routes'
import errorHandlerMiddleware from './middlewares/errorHandler.middleware'
import initPassport from './middlewares/passport.middleware'

const app = express()

app.set('trust proxy', true)

app.use(helmet({ crossOriginResourcePolicy: false }))

app.use(bodyParser.json())

app.use(morgan('tiny'))

// CORS Configuration
const corsOptions = {
  credentials: true,
  origin: '*',
  methods: ['GET, POST, PUT, PATCH, DELETE']
}

app.use(cors(corsOptions))

app.use('/public', express.static('public'))

app.use(routes)

app.use(async (req, res) => {
  res.status(404).json({ status: 'Not Found' })
})

app.use(errorHandlerMiddleware)

export default app
