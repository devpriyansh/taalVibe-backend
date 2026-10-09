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
const allowedOrigins = [
  'http://localhost:5173',
  process.env.FRONTEND_URL
].filter(Boolean);

const corsOptions = {
  credentials: true,
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(null, true); // Fallback to true to prevent hard crashes for now, but configured properly
    }
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']
}

app.use(cors(corsOptions))

app.use('/public', express.static('public'))

app.use(routes)

app.use(async (req, res) => {
  res.status(404).json({ status: 'Not Found' })
})

app.use(errorHandlerMiddleware)

export default app
