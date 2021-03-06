const schedule = require('node-schedule')
const log = require('utils/log')
const Duration = require('./lib/duration')
const Codition = require('./lib/codition')
const Job = require('./lib/job')

class Task {
	async save(job, codition, duration, indentify) {
		Object.keys(indentify).forEach(e => {
			this[e] = indentify[e]
		})

		this._run = schedule.scheduleJob
		this.schedules = {}
		this.job = Job.Resolve(job, this.master)

		await this.generatorCodition(codition)
		this.generatorDuration(duration)

		return this
	}

	generatorDuration(duration) {
		const that = this
		this.duration = duration
		this.durationJob = this._run('0 0 0 * * *', this.runDurationJob.bind(that))
		this.runDurationJob()
	}
	async generatorCodition(codition) {
		const that = this
		this.execCodition = await Codition.ResolveExec(codition.startExec)

		//如果存在天气 每15分钟需要重新解析一下
		if (codition.weather && codition.weather.length > 0) {
			this.weather = codition.weather
			this.weatherJob = this._run('15 * * * *', this.runWeatherJob.bind(that))
			await this.runWeatherJob()

			if (codition.startExec && codition.relation) {
				this.relation = true
				;['hour', 'minutes', 'second'].forEach(e => {
					this[e] = codition.startExec[e]
				})
			}
		}
	}
	async runWeatherJob() {
		this.weatherCodition = await Codition.ResolveWeather(
			this.weather,
			this.address
		)
		await this.runWithWeather()
	}
	runDurationJob() {
		// '是否处在指定日期范围'
		try {
			const duration = {}
			;['start', 'end', 'specific'].forEach(e => {
				if (Reflect.has(this.duration, e)) {
					duration[e] = this.duration[e] || ''
				}
			})
			if (
				duration.specific &&
				duration.specific.start &&
				Object.values(duration.specific.start).length
			) {
				this.duration = Duration.ResolveSpecific(duration.specific)
			} else {
				this.duration = Duration.ResolveDuration(duration.start, duration.end)
			}
			!this.duration && this.stop()
		} catch (error) {
			log.error('判断日期功能出错')
			this.stop()
		}
	}
	debug() {
		if (!this.weatherCodition && !this.execCodition) {
			this.message = '任务的运行条件未定义！'
		}
		if (!this.job) {
			this.message = '任务的具体工作未定义！'
		}
		if (this.message) {
			this.disabled = true
			log.error(this.message)
		}
	}
	async run() {
		this.debug()
		if (this.disabled) {
			return { message: this.message, success: false }
		}
		await this.runWithWeather()
		this.runWithExec()

		this.message = `${this.id} 号任务已运行！`
		log.success(this.message)
		return { message: this.message, success: true }
	}
	async runWithWeather() {
		const that = this
		if (!this.weatherCodition || !this.weatherCodition.length) {
			return
		}
		if (this.relation) {
			const time = new Date()
			if (time.getHours() < this.hour) {
				return
			}
			if (time.getHours() === this.hour && time.getMinutes() < this.minutes) {
				return
			}
		}
		let ine = 0
		// 目前处于晴天或者阴天，符合运行条件，直接运行
		if (this.weatherCodition[0] === 'run') {
			await this.job()
			ine = 1
		}
		['sunUp', 'sunDown'].forEach((e, i) => {
			this.schedules[e] && this.schedules[e].cancel()
			this.schedules[e] = this._run(
				this.weatherCodition[i + ine],
				this.job.bind(that)
			)
		})
	}
	runWithExec() {
		const that = this
		if (!this.execCodition) {
			return
		}
		if (
			this.relation &&
			(!this.weatherCodition || !this.weatherCodition.length)
		) {
			return
		}
		this.schedules.execTime && this.schedules.execTime.cancel()
		this.schedules.execTime = this._run(this.execCodition, this.job.bind(that))
	}
	stopByTask(task) {
		if (!this.schedules) {
			this.message = '暂无运行中的任务！'
			log.error(this.message)
			return { success: false, message: this.message }
		}
		for (let [key, value] of Object.entries(this.schedules)) {
			if (key === task) {
				value.cancel()
			}
		}
		this.message = `${task} 任务暂停成功`
		log.success(this.message)
		return { message: this.message, success: true }
	}
	stop() {
		const tasks = Object.values(this.schedules)
		if (!tasks || !tasks.length) {
			return
		}
		tasks.forEach(task => {
			task && this.schedules[task].cancel()
		})
	}
}

module.exports = Task
