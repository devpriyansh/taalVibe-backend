import express from 'express'
import userRoutes from './user.routes'
import musicRoutes from './music.routes'

const v1Router = express.Router()

v1Router.use('/user', userRoutes)
v1Router.use('/music', musicRoutes)

export default v1Router
