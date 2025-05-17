const { InstanceBase, InstanceStatus, TCPHelper, Regex, runEntrypoint } = require('@companion-module/base')
const { combineRgb } = require('@companion-module/base')
const SamsungD = require('samsung-lfd')
const UpgradeScripts = require('./upgrades.js')

class SamsungDisplayInstance extends InstanceBase {
	init(config) {
		this.config = config
		this.DATA = {}

		this.CHOICES_INPUT = [
			{ id: 'Component', label: 'Component' },
			{ id: 'S-Video', label: 'S-Video' },
			{ id: 'AV', label: 'AV' },
			{ id: 'AV2', label: 'AV2' },
			{ id: 'PC', label: 'PC' },
			{ id: 'SCART1', label: 'SCART1' },
			{ id: 'DVI', label: 'DVI' },
			{ id: 'BNC', label: 'BNC' },
			{ id: 'DVI-Video', label: 'DVI-Video' },
			{ id: 'MagicInfo', label: 'MagicInfo' },
			{ id: 'HDMI1', label: 'HDMI1' },
			{ id: 'HDMI1-PC', label: 'HDMI1-PC' },
			{ id: 'HDMI2', label: 'HDMI2' },
			{ id: 'HDMI2-PC', label: 'HDMI2-PC' },
			{ id: 'DP', label: 'DP' },
			{ id: 'DP2', label: 'DP2' },
			{ id: 'DP3', label: 'DP3' },
			{ id: 'HDMI3', label: 'HDMI3' },
			{ id: 'HDMI3-PC', label: 'HDMI3-PC' },
			{ id: 'HDMI4', label: 'HDMI4' },
			{ id: 'HDMI4-PC', label: 'HDMI4-PC' },
			{ id: 'TV-DTV', label: 'TV-DTV' },
			{ id: 'HD-BaseT', label: 'HD-BaseT' },
			{ id: 'OCM', label: 'OCM' },
			{ id: 'MagicInfo-S', label: 'MagicInfo-S' },
			{ id: 'Screen Mirroring', label: 'Screen Mirroring' },
			{ id: 'USB', label: 'USB' },
			{ id: 'URL Launcher', label: 'URL Launcher' },
			{ id: 'Whiteboard', label: 'Whiteboard' },
			{ id: 'Web Browser', label: 'Web Browser' },
			{ id: 'Remote Workspace', label: 'Remote Workspace' },
		]

		this.CHOICES_ON_OFF = [
			{ id: 'off', label: 'Off' },
			{ id: 'on', label: 'On' },
		]

		this.CHOICES_MUTE = this.CHOICES_ON_OFF
		this.CHOICES_POWER = this.CHOICES_ON_OFF
		this.CHOICES_WALL = this.CHOICES_ON_OFF

		this.CHOICES_WALL_MODE = [
			{ id: 'natural', label: 'Natural' },
			{ id: 'full', label: 'Full' },
		]

		this.CHOICES_VOLUME = [
			{ id: '0', label: '0' },
			{ id: '25', label: '25' },
			{ id: '50', label: '50' },
			{ id: '75', label: '75' },
			{ id: '100', label: '100' },
		]

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
					default:
						self.updateStatus(InstanceStatus.ConnectionFailure, 'Failed to connect - ' + data.status)
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
						this.checkFeedbacks('wall')
						this.checkFeedbacks('wallMode')
						this.checkFeedbacks('wallScreenNumber')
						break
					default:
						self.updateStatus(InstanceStatus.UnknownWarning, 'Failed to send request ' + data.req)
				}
			} else {
				self.updateStatus(InstanceStatus.UnknownWarning, 'Unknown comms error')
			}
		})

		// We use lots of the statuses and expose the others as variables
		// It's also generally useful to trigger a connectionStatus message
		self.dev.process(
			'status?',
			'model?',
			'screensize?',
			'sernum?',
			'software?',
			'fanspeed?',
			'wallmode?',
			'wallon?',
			'walldef?',
		)
		// TODO(Peter): Sernum, screensize and possibly others only work when the device is powered on...
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
						step: 5,
					},
				],
				callback: async (action) => {
					await system.doAction('volume ' + action.options.volume)
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
				this.log('debug', 'Socket not connected :(')
			}
		}
	}
}
runEntrypoint(SamsungDisplayInstance, UpgradeScripts)
