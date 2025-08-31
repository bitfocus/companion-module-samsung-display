const { InstanceBase, InstanceStatus, TCPHelper, Regex, runEntrypoint } = require('@companion-module/base')
const { combineRgb } = require('@companion-module/base')
const SamsungD = require('samsung-lfd')
const UpgradeScripts = require('./upgrades.js')
const { PassThrough } = require('stream')

class SamsungDisplayInstance extends InstanceBase {
	processSamsungDData(data) {
		return data.dev.command.reduce(function (map, obj) {
			if (!(obj.value === undefined) && obj.value) {
				let values = obj.value
				if (!Array.isArray(values)) {
					values = [{ name: obj.name, item: values.item }]
				}
				map[obj.name] = values.reduce(function (valueArray, valueObj) {
					let valueMap = {}
					if ('name' in valueObj) {
						valueMap['name'] = valueObj.name
						if ('item' in valueObj) {
							valueMap['values'] = Array.from(valueObj.item).map((item) => item.name)
						} else {
							valueMap['values'] = []
						}
						valueArray.push(valueMap)
					}
					return valueArray
				}, [])
			} else {
				map[obj.name] = undefined
			}
			return map
		}, {})
	}

	generateChoices(data, command, value) {
		const items = data[command].find((element) => element.name == value)
		if (items && items.values) {
			var choices = []
			items.values.forEach((choice) => {
				choices.push({ id: choice, label: choice.charAt(0).toUpperCase() + choice.slice(1) })
			})
			return choices
		} else {
			return []
		}
	}

	init(config) {
		this.config = config
		this.DATA = {}

		this.CHOICES_ON_OFF = [
			{ id: 'off', label: 'Off' },
			{ id: 'on', label: 'On' },
		]

		this.CHOICES_MUTE = this.CHOICES_ON_OFF
		this.CHOICES_POWER = this.CHOICES_ON_OFF
		this.CHOICES_WALL = this.CHOICES_ON_OFF

		this.CHOICES_0_100 = [
			{ id: '0', label: '0' },
			{ id: '25', label: '25' },
			{ id: '50', label: '50' },
			{ id: '75', label: '75' },
			{ id: '100', label: '100' },
		]

		this.CHOICES_VOLUME = this.CHOICES_0_100
		this.CHOICES_CONTRAST = this.CHOICES_0_100
		this.CHOICES_BRIGHTNESS = this.CHOICES_0_100
		this.CHOICES_SHARPNESS = this.CHOICES_0_100
		this.CHOICES_SATURATION = this.CHOICES_0_100
		this.CHOICES_TINT = this.CHOICES_0_100

		var tunnel = new PassThrough()
		var tmpdev = new SamsungD({ stream: tunnel, id: 0 }, { disconnect: true })
		//this.log('debug', 'SamsungD data ' + JSON.stringify(tmpdev.data.dev.command))
		const commands = this.processSamsungDData(tmpdev.data)
		//this.log('debug', 'Processed SamsungD data ' + JSON.stringify(commands))

		this.log(
			'debug',
			'SamsungD wallMode wallMode ' + JSON.stringify(this.generateChoices(commands, 'wallMode', 'wallMode')),
		)

		this.CHOICES_INPUT = this.generateChoices(commands, 'input', 'input')

		this.CHOICES_WALL_MODE = this.generateChoices(commands, 'wallMode', 'wallMode')

		this.PRESETS_SETTINGS = [
			{
				action: 'input',
				setting: 'input_name',
				feedback: 'input',
				label: '',
				choices: this.CHOICES_INPUT,
				category: 'Input',
			},
			{
				action: 'mute',
				setting: 'state',
				feedback: 'mute',
				label: 'Mute ',
				choices: this.CHOICES_MUTE,
				category: 'Volume',
			},

			{
				action: 'volume',
				setting: 'volume',
				feedback: 'volume',
				label: 'Volume ',
				choices: this.CHOICES_VOLUME,
				category: 'Volume',
			},
			{
				action: 'contrast',
				setting: 'contrast',
				feedback: 'contrast',
				label: 'Contrast ',
				choices: this.CHOICES_CONTRAST,
				category: 'Picture',
			},
			{
				action: 'brightness',
				setting: 'brightness',
				feedback: 'brightness',
				label: 'Brightness ',
				choices: this.CHOICES_BRIGHTNESS,
				category: 'Picture',
			},
			{
				action: 'sharpness',
				setting: 'sharpness',
				feedback: 'sharpness',
				label: 'Sharpness ',
				choices: this.CHOICES_SHARPNESSS,
				category: 'Picture',
			},
			{
				action: 'saturation',
				setting: 'saturation',
				feedback: 'saturation',
				label: 'Saturation ',
				choices: this.CHOICES_SATURATION,
				category: 'Picture',
			},
			{
				action: 'tint',
				setting: 'tint',
				feedback: 'tint',
				label: 'Tint ',
				choices: this.CHOICES_TINT,
				category: 'Picture',
			},
			{
				action: 'wall',
				setting: 'state',
				feedback: 'wall',
				label: 'Wall ',
				choices: this.CHOICES_WALL,
				category: 'Wall',
			},
			{
				action: 'wallMode',
				setting: 'mode',
				feedback: 'wallMode',
				label: 'Wall Mode ',
				choices: this.CHOICES_WALL_MODE,
				category: 'Wall',
			},
		]

		this.actions(this) // export actions
		this.init_variables()
		this.init_feedbacks()
		this.init_presets()
		this.init_tcp()
	}

	configUpdated(config) {
		this.config = config

		if (this.socket !== undefined) {
			this.socket.destroy()
			delete this.socket
		}

		this.init_tcp()
	}

	init_tcp() {
		let self = this

		if (self.dev !== undefined) {
			self.dev.process('#close')
			delete self.dev
		}

		if (!self.config.host) {
			self.updateStatus(InstanceStatus.BadConfig, `IP address is missing`)
			return
		} else if (!self.config.port) {
			self.updateStatus(InstanceStatus.BadConfig, `Port is missing`)
			return
		} else if (self.config.id == undefined || self.config.id === '') {
			self.updateStatus(InstanceStatus.BadConfig, `ID is missing`)
			return
		}

		self.updateStatus(InstanceStatus.Connecting)

		// Disconnect = false to match the previous behaviour of the module, although we don't get as much connection feedback this way
		self.dev = new SamsungD(
			{ host: self.config.host, port: self.config.port, id: self.config.id },
			{ disconnect: false },
		)
		// self.dev.emitter.on('connectionData', (data) => self.log('debug', 'Conn Data ' + JSON.stringify(data)))
		self.dev.emitter.on('connectionStatus', (data) => {
			self.log('debug', 'Conn Status ' + JSON.stringify(data))
			if (data.status !== undefined && data.status != '') {
				switch (data.status) {
					case 'connected':
						self.updateStatus(InstanceStatus.Ok)
						break
					case 'closed':
						self.updateStatus(InstanceStatus.Disconnected)
						// Try to reconnect
						// TODO(Peter): Do some sort of backoff?
						if (self.dev !== undefined) {
							self.dev.process('#connect')
						}
						break
					case 'error':
						// TODO(Peter): Extract more status
						// e.g. "more":{"errno":-104,"code":"ECONNRESET","syscall":"read"}
						self.updateStatus(InstanceStatus.UnknownError)
						break
					default:
						self.updateStatus(InstanceStatus.ConnectionFailure, 'Failed to connect - ' + data.status)
						break
				}
			} else {
				self.updateStatus(InstanceStatus.UnknownError, 'Unknown failure connecting')
			}
		})
		self.dev.emitter.on('commandForDevice', (data) => self.log('debug', 'Tx: ' + JSON.stringify(data)))
		self.dev.emitter.on('responseFromDevice', (data) => {
			self.log('debug', 'Rx: ' + JSON.stringify(data))
			if (data.status !== undefined && data.status != '') {
				switch (data.status) {
					case 'OK':
						// TODO(Peter): Deduplicate this
						self.updateStatus(InstanceStatus.Ok)
						// Handle updated data
						if (typeof data.value === 'object' || Array.isArray(data.value)) {
							for (var k in data.value) {
								self.DATA[k] = data.value[k]
							}
						} else {
							self.DATA[data.req] = data.value
						}
						self.log('debug', 'Overall data: ' + JSON.stringify(self.DATA))
						// TODO(Peter): Could potentially be slightly more efficient here
						this.setVariableValues(self.DATA)
						// TODO(Peter): Could potentially be slightly more efficient here
						this.checkFeedbacks('input')
						this.checkFeedbacks('mute')
						this.checkFeedbacks('volume')
						this.checkFeedbacks('power')
						this.checkFeedbacks('contrast')
						this.checkFeedbacks('brightness')
						this.checkFeedbacks('sharpness')
						this.checkFeedbacks('saturation')
						this.checkFeedbacks('tint')
						this.checkFeedbacks('wall')
						this.checkFeedbacks('wallMode')
						this.checkFeedbacks('wallScreenNumber')

						// Sernum, screensize and possibly others only work when the device is powered on...
						if (data.req == 'status' && self.DATA['power'] == 'on') {
							// TODO(Peter): || data.req == 'power' - Need to sleep if we've only just powered on...
							self.dev.process(
								'model?',
								'screensize?',
								'sernum?',
								'software?',
								'contrast?',
								'brightness?',
								'sharpness?',
								'saturation?',
								'tint?',
								'fanspeed?',
								'wallmode?',
								'wallon?',
								'walldef?',
							)
						}
						break
					default:
						self.updateStatus(InstanceStatus.UnknownWarning, 'Request ' + data.req + ' failed')
				}
			} else {
				self.updateStatus(InstanceStatus.UnknownWarning, 'Unknown comms error')
			}
		})

		// We use lots of the statuses and expose the others as variables
		// It's also generally useful to trigger a connectionStatus message
		self.dev.process('status?')
	}

	// Return config fields for web config
	getConfigFields() {
		return [
			{
				type: 'textinput',
				id: 'host',
				label: 'Target IP',
				width: 6,
				regex: Regex.IP,
			},
			{
				type: 'textinput',
				id: 'port',
				label: 'Target Port',
				width: 6,
				default: '1515',
				regex: Regex.PORT,
			},
			{
				type: 'number',
				id: 'id',
				label: 'Target ID',
				tooltip:
					"This is the configured ID of this device, 0-253 (254 will broadcast to any ID but there won't be any feedback)",
				width: 6,
				// Zero seems to be the default ID out of the box
				default: 0,
				min: 0,
				max: 254,
				regex: Regex.Number,
			},
		]
	}

	// When module gets deleted
	destroy() {
		if (this.dev !== undefined) {
			this.dev.process('#close')
			delete this.dev
		}

		this.log('debug', 'destroy ' + this.id)
	}

	init_variables() {
		var variableDefinitions = []

		variableDefinitions.push({
			name: 'Power',
			variableId: 'power',
		})

		variableDefinitions.push({
			name: 'Volume',
			variableId: 'volume',
		})

		variableDefinitions.push({
			name: 'Mute',
			variableId: 'mute',
		})

		variableDefinitions.push({
			name: 'Input',
			variableId: 'input',
		})

		variableDefinitions.push({
			name: 'Model',
			variableId: 'model',
		})

		variableDefinitions.push({
			name: 'Screen Size',
			variableId: 'screenSize',
		})

		variableDefinitions.push({
			name: 'Software',
			variableId: 'software',
		})

		variableDefinitions.push({
			name: 'Serial Number',
			variableId: 'sernum',
		})

		variableDefinitions.push({
			name: 'Contrast',
			variableId: 'contrast',
		})

		variableDefinitions.push({
			name: 'Brightness',
			variableId: 'brightness',
		})

		variableDefinitions.push({
			name: 'Sharpness',
			variableId: 'sharpness',
		})

		variableDefinitions.push({
			name: 'Saturation',
			variableId: 'saturation',
		})

		variableDefinitions.push({
			name: 'Tint',
			variableId: 'tint',
		})

		variableDefinitions.push({
			name: 'Fan Speed',
			variableId: 'fanspeed',
		})

		variableDefinitions.push({
			name: 'Wall Mode',
			variableId: 'wallMode',
		})

		variableDefinitions.push({
			name: 'Wall Status',
			variableId: 'wallOn',
		})

		variableDefinitions.push({
			name: 'Wall Monitor Number',
			variableId: 'Wall_SNo',
		})

		// TODO(Peter): Add and expose other variables
		// "aspect":1,"NTimeNF":0,"FTimeNF":0,"Wall_Div":"off","Wall_SNo":0

		this.setVariableDefinitions(variableDefinitions)
	}

	init_feedbacks() {
		// feedbacks
		var feedbacks = []

		feedbacks['power'] = {
			type: 'boolean',
			name: 'Power',
			description: 'If the power is in the specified state, give feedback',
			options: [
				{
					type: 'dropdown',
					label: 'Power',
					id: 'state',
					choices: this.CHOICES_POWER,
				},
			],
			defaultStyle: {
				color: combineRgb(0, 0, 0),
				bgcolor: combineRgb(255, 255, 0),
			},
			callback: (feedback, bank) => {
				return this.DATA.power == feedback.options.state
			},
		}

		feedbacks['input'] = {
			type: 'boolean',
			name: 'Input',
			description: 'If the input specified is the current input, give feedback',
			options: [
				{
					type: 'dropdown',
					label: 'Input',
					id: 'input_name',
					choices: this.CHOICES_INPUT,
				},
			],
			defaultStyle: {
				color: combineRgb(0, 0, 0),
				bgcolor: combineRgb(255, 255, 0),
			},
			callback: (feedback, bank) => {
				return this.DATA.input == feedback.options.input_name
			},
		}

		feedbacks['mute'] = {
			type: 'boolean',
			name: 'Mute',
			description: 'If the system is in the current mute state, give feedback',
			options: [
				{
					type: 'dropdown',
					label: 'Mute',
					id: 'state',
					choices: this.CHOICES_MUTE,
				},
			],
			defaultStyle: {
				color: combineRgb(0, 0, 0),
				bgcolor: combineRgb(255, 255, 0),
			},
			callback: (feedback, bank) => {
				return this.DATA.mute == feedback.options.state
			},
		}

		feedbacks['volume'] = {
			type: 'boolean',
			name: 'Volume',
			description: 'If the system volume is at the selected volume, give feedback',
			options: [
				{
					type: 'number',
					label: 'Volume',
					id: 'volume',
					default: 50,
					min: 0,
					max: 100,
					required: true,
					step: 1,
				},
			],
			defaultStyle: {
				color: combineRgb(0, 0, 0),
				bgcolor: combineRgb(255, 255, 0),
			},
			callback: (feedback, bank) => {
				return this.DATA.volume == parseInt(feedback.options.volume)
			},
		}

		feedbacks['contrast'] = {
			type: 'boolean',
			name: 'Contrast',
			description: 'If the system contrast is at the selected level, give feedback',
			options: [
				{
					type: 'number',
					label: 'Contrast',
					id: 'contrast',
					default: 50,
					min: 0,
					max: 100,
					required: true,
					step: 1,
				},
			],
			defaultStyle: {
				color: combineRgb(0, 0, 0),
				bgcolor: combineRgb(255, 255, 0),
			},
			callback: (feedback, bank) => {
				return this.DATA.contrast == parseInt(feedback.options.contrast)
			},
		}

		feedbacks['brightness'] = {
			type: 'boolean',
			name: 'Brightness',
			description: 'If the system brightness is at the selected level, give feedback',
			options: [
				{
					type: 'number',
					label: 'Brightness',
					id: 'brightness',
					default: 50,
					min: 0,
					max: 100,
					required: true,
					step: 1,
				},
			],
			defaultStyle: {
				color: combineRgb(0, 0, 0),
				bgcolor: combineRgb(255, 255, 0),
			},
			callback: (feedback, bank) => {
				return this.DATA.brightness == parseInt(feedback.options.brightness)
			},
		}

		feedbacks['sharpness'] = {
			type: 'boolean',
			name: 'Sharpness',
			description: 'If the system sharpness is at the selected level, give feedback',
			options: [
				{
					type: 'number',
					label: '',
					id: '',
					default: 50,
					min: 0,
					max: 100,
					required: true,
					step: 1,
				},
			],
			defaultStyle: {
				color: combineRgb(0, 0, 0),
				bgcolor: combineRgb(255, 255, 0),
			},
			callback: (feedback, bank) => {
				return this.DATA.sharpness == parseInt(feedback.options.sharpness)
			},
		}

		feedbacks['saturation'] = {
			type: 'boolean',
			name: 'Saturation',
			description: 'If the system saturation is at the selected level, give feedback',
			options: [
				{
					type: 'number',
					label: 'Saturation',
					id: 'saturation',
					default: 50,
					min: 0,
					max: 100,
					required: true,
					step: 1,
				},
			],
			defaultStyle: {
				color: combineRgb(0, 0, 0),
				bgcolor: combineRgb(255, 255, 0),
			},
			callback: (feedback, bank) => {
				return this.DATA.saturation == parseInt(feedback.options.saturation)
			},
		}

		feedbacks['tint'] = {
			type: 'boolean',
			name: 'Tint',
			description: 'If the system tint is at the selected level, give feedback',
			options: [
				{
					type: 'number',
					label: 'Tint',
					id: 'tint',
					default: 50,
					min: 0,
					max: 100,
					required: true,
					step: 1,
				},
			],
			defaultStyle: {
				color: combineRgb(0, 0, 0),
				bgcolor: combineRgb(255, 255, 0),
			},
			callback: (feedback, bank) => {
				return this.DATA.tint == parseInt(feedback.options.tint)
			},
		}

		feedbacks['wall'] = {
			type: 'boolean',
			name: 'Wall',
			description: 'If the system is in the current wall state, give feedback',
			options: [
				{
					type: 'dropdown',
					label: 'Wall',
					id: 'state',
					choices: this.CHOICES_WALL,
				},
			],
			defaultStyle: {
				color: combineRgb(0, 0, 0),
				bgcolor: combineRgb(255, 255, 0),
			},
			callback: (feedback, bank) => {
				return this.DATA.wallOn == feedback.options.state
			},
		}

		feedbacks['wallMode'] = {
			type: 'boolean',
			name: 'Wall Mode',
			description: 'If the wall mode is the current state, give feedback',
			options: [
				{
					type: 'dropdown',
					label: 'Mode',
					id: 'mode',
					choices: this.CHOICES_WALL_MODE,
				},
			],
			defaultStyle: {
				color: combineRgb(0, 0, 0),
				bgcolor: combineRgb(255, 255, 0),
			},
			callback: (feedback, bank) => {
				return this.DATA.wallMode == feedback.options.mode
			},
		}

		feedbacks['wallScreenNumber'] = {
			type: 'boolean',
			name: 'Wall Screen Number',
			description: 'If the wall screen number is the selected wall screen number, give feedback',
			options: [
				{
					type: 'number',
					label: 'Screen Number',
					id: 'screenNumber',
					default: 1,
					min: 0,
					max: 100,
					required: true,
					step: 1,
				},
			],
			defaultStyle: {
				color: combineRgb(0, 0, 0),
				bgcolor: combineRgb(255, 255, 0),
			},
			callback: (feedback, bank) => {
				return this.DATA.Wall_SNo == parseInt(feedback.options.screenNumber)
			},
		}

		this.setFeedbackDefinitions(feedbacks)
	}

	init_presets() {
		let presets = []
		presets.push({
			category: 'Basics',
			name: 'Power on',
			type: 'button',
			style: {
				text: `Power On`,
				size: '14',
				color: combineRgb(255, 255, 255),
				bgcolor: combineRgb(0, 0, 0),
			},
			steps: [{ down: [{ actionId: 'powerOn' }] }],
			feedbacks: [
				{
					feedbackId: 'power',
					style: {
						bgcolor: combineRgb(255, 255, 0),
						color: combineRgb(0, 0, 0),
					},
					options: { state: 'on' },
				},
			],
		})
		presets.push({
			category: 'Basics',
			name: 'Power off',
			type: 'button',
			style: {
				text: `Power Off`,
				size: '14',
				color: combineRgb(255, 255, 255),
				bgcolor: combineRgb(0, 0, 0),
			},
			steps: [{ down: [{ actionId: 'powerOff' }] }],
			feedbacks: [
				{
					feedbackId: 'power',
					style: {
						bgcolor: combineRgb(255, 255, 0),
						color: combineRgb(0, 0, 0),
					},
					options: { state: 'off' },
				},
			],
		})

		for (var type in this.PRESETS_SETTINGS) {
			for (var choice in this.PRESETS_SETTINGS[type].choices) {
				var optionData = {}
				optionData[this.PRESETS_SETTINGS[type].setting] = this.PRESETS_SETTINGS[type].choices[choice].id
				presets[`${this.PRESETS_SETTINGS[type].action}_${this.PRESETS_SETTINGS[type].choices[choice].id}`] = {
					category: this.PRESETS_SETTINGS[type].category,
					name: this.PRESETS_SETTINGS[type].label + this.PRESETS_SETTINGS[type].choices[choice].label,
					type: 'button',
					style: {
						text: this.PRESETS_SETTINGS[type].label + this.PRESETS_SETTINGS[type].choices[choice].label,
						size: '14',
						color: combineRgb(255, 255, 255),
						bgcolor: combineRgb(0, 0, 0),
					},
					feedbacks: [
						{
							feedbackId: this.PRESETS_SETTINGS[type].feedback,
							style: {
								bgcolor: combineRgb(255, 255, 0),
								color: combineRgb(0, 0, 0),
							},
							options: optionData,
						},
					],
					steps: [
						{
							down: [
								{
									actionId: this.PRESETS_SETTINGS[type].action,
									options: optionData,
								},
							],
							up: [],
						},
					],
				}
			}
		}

		this.setPresetDefinitions(presets)
	}

	actions(system) {
		system.setActionDefinitions({
			powerOn: {
				name: 'Power On Display',
				options: [],
				callback: async (action) => {
					await system.doAction('power on')
				},
			},
			powerOff: {
				name: 'Power Off Display',
				options: [],
				callback: async (action) => {
					await system.doAction('power off')
				},
			},
			input: {
				name: 'Input',
				options: [
					{
						type: 'dropdown',
						label: 'Input',
						id: 'input_name',
						choices: system.CHOICES_INPUT,
						//default: 'HDMI1-PC',
					},
				],
				callback: async (action) => {
					await system.doAction('input ' + action.options.input_name)
				},
			},
			mute: {
				name: 'Mute',
				options: [
					{
						type: 'dropdown',
						label: 'Mute',
						id: 'state',
						choices: system.CHOICES_MUTE,
						default: 'off',
					},
				],
				callback: async (action) => {
					await system.doAction('mute ' + action.options.state)
				},
			},
			volume: {
				name: 'Volume',
				options: [
					{
						type: 'number',
						label: 'Volume',
						id: 'volume',
						default: 50,
						min: 0,
						max: 100,
						required: true,
						step: 1,
					},
				],
				callback: async (action) => {
					await system.doAction('volume ' + action.options.volume)
				},
			},
			contrast: {
				name: 'Contrast',
				options: [
					{
						type: 'number',
						label: 'Contrast',
						id: 'contrast',
						default: 50,
						min: 0,
						max: 100,
						required: true,
						step: 1,
					},
				],
				callback: async (action) => {
					await system.doAction('contrast ' + action.options.contrast)
				},
			},
			brightness: {
				name: 'Brightness',
				options: [
					{
						type: 'number',
						label: 'Brightness',
						id: 'brightness',
						default: 50,
						min: 0,
						max: 100,
						required: true,
						step: 1,
					},
				],
				callback: async (action) => {
					await system.doAction('brightness ' + action.options.brightness)
				},
			},
			sharpness: {
				name: 'Sharpness',
				options: [
					{
						type: 'number',
						label: 'Sharpness',
						id: 'sharpness',
						default: 50,
						min: 0,
						max: 100,
						required: true,
						step: 1,
					},
				],
				callback: async (action) => {
					await system.doAction('sharpness ' + action.options.sharpness)
				},
			},
			saturation: {
				name: 'Saturation',
				options: [
					{
						type: 'number',
						label: 'Saturation',
						id: 'saturation',
						default: 50,
						min: 0,
						max: 100,
						required: true,
						step: 1,
					},
				],
				callback: async (action) => {
					await system.doAction('saturation ' + action.options.saturation)
				},
			},
			tint: {
				name: 'Tint',
				options: [
					{
						type: 'number',
						label: 'Tint',
						id: 'tint',
						default: 50,
						min: 0,
						max: 100,
						required: true,
						step: 1,
					},
				],
				callback: async (action) => {
					await system.doAction('tint ' + action.options.tint)
				},
			},
			wall: {
				name: 'Wall',
				options: [
					{
						type: 'dropdown',
						label: 'Wall',
						id: 'state',
						choices: system.CHOICES_WALL,
						default: 'off',
					},
				],
				callback: async (action) => {
					await system.doAction('wallOn ' + action.options.state)
				},
			},
			wallMode: {
				name: 'Wall Mode',
				options: [
					{
						type: 'dropdown',
						label: 'Mode',
						id: 'mode',
						choices: system.CHOICES_WALL_MODE,
						default: 'natural',
					},
				],
				callback: async (action) => {
					await system.doAction('wallMode ' + action.options.mode)
				},
			},
			wallMode: {
				name: 'Wall Mode',
				options: [
					{
						type: 'dropdown',
						label: 'Mode',
						id: 'mode',
						choices: system.CHOICES_WALL_MODE,
						default: 'natural',
					},
				],
				callback: async (action) => {
					await system.doAction('wallMode ' + action.options.mode)
				},
			},
			customCommand: {
				name: 'Custom Command',
				options: [
					{
						type: 'textinput',
						label: 'Command',
						id: 'command',
						default: 'volume $(internal:time_s)',
						useVariables: true,
					},
				],
				callback: async (action, context) => {
					const command = await context.parseVariablesInString(action.options.command)
					await system.doAction(command)
				},
			},
		})
	}

	doAction(cmd) {
		let self = this
		if (cmd !== undefined && cmd != '') {
			self.log('debug', 'sending "' + cmd + '" to ' + this.config.host)

			// This is using parts of the library that aren't publicly exposed and may change
			if (
				this.dev !== undefined &&
				this.dev.mode == 'tcp' &&
				this.dev.socket !== undefined &&
				this.dev.socket.readyState === 'open'
			) {
				this.dev.process(cmd)
			} else {
				// TODO(Peter): Should probably allow the internal # commands through regardless here
				this.log('debug', 'Socket not connected :(')
			}
		}
	}
}
runEntrypoint(SamsungDisplayInstance, UpgradeScripts)
