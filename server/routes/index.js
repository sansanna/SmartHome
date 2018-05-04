const router = require('koa-router')()
const api = require('./api')
const auth = require('./auth')
module.exports = app => {
	router.use('/api', api.routes()).use(api.allowedMethods())
	router.use('/auth', auth.routes()).use(auth.allowedMethods())
	app.use(router.routes()).use(router.allowedMethods())
}
