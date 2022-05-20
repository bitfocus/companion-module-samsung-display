const tcp = require('../../tcp')
const udp = require('../../udp')
const instance_skel = require('../../instance_skel')

class instance extends instance_skel {
	/**
	 * Create an instance of the module
	 *
	 * @param {EventEmitter} system - the brains of the operation
	 * @param {string} id - the instance ID
	 * @param {Object} config - saved user configuration parameters
	 * @since 1.0.0
	 */
	constructor(system, id, config) {
		super(system, id, config)
		this.actions() // export actions
		this.init_presets() // export presets
	}

	updateConfig(config) {
		this.init_presets()

		if (this.socket !== undefined) {
			this.socket.destroy()
			delete this.socket
		}

		this.config = config

		this.init_tcp()
	}

	init() {
		this.init_presets()
		this.init_tcp()
	}

	init_tcp() {
		if (this.socket !== undefined) {
			this.socket.destroy()
			delete this.socket
		}

		this.status(this.STATE_WARNING, 'Connecting')

		if (this.config.host) {
			this.socket = new tcp(this.config.host, 1515)

			this.socket.on('status_change', (status, message) => {
				this.status(status, message)
			})

			this.socket.on('error', (err) => {
				this.debug('Network error', err)
				this.status(this.STATE_ERROR, err)
				this.log('error', 'Network error: ' + err.message)
			})

			this.socket.on('connect', () => {
				this.status(this.STATE_OK)
				this.debug('Connected')
			})

			this.socket.on('data', (data) => {
				console.log(data.toString())
			})
		}
	}

	// Return config fields for web config
	config_fields() {
		return [
			{
				type: 'textinput',
				id: 'host',
				label: 'Target IP',
				width: 6,
				regex: this.REGEX_IP,
			},
		]
	}

	// When module gets deleted
	destroy() {
		this.socket.destroy()

		this.debug('destroy', this.id)
	}

	CHOICES_END = [
		{ id: '', label: 'None' },
		{ id: '\n', label: 'LF - \\n (Common UNIX/Mac)' },
		{ id: '\r\n', label: 'CRLF - \\r\\n (Common Windows)' },
		{ id: '\r', label: 'CR - \\r (Old MacOS)' },
		{ id: '\x00', label: 'NULL - \\x00 (Can happen)' },
		{ id: '\n\r', label: 'LFCR - \\n\\r (Just stupid)' },
	]

	init_presets() {
		let presets = []
		presets.push({
			category: 'Basics',
			label: 'Power on',
			bank: {
				style: 'text',
				text: `Power On`,
				size: '14',
				color: this.rgb(255, 255, 255),
				bgcolor: this.rgb(0, 0, 0),
			},
			actions: [{ action: 'powerOn', options: [] }],
			feedbacks: [],
		})
		presets.push({
			category: 'Basics',
			label: 'Power off',
			bank: {
				style: 'text',
				text: `Power Off`,
				size: '14',
				color: this.rgb(255, 255, 255),
				bgcolor: this.rgb(0, 0, 0),
			},
			actions: [{ action: 'powerOff', options: [] }],
			feedbacks: [],
		})
		this.setPresetDefinitions(presets)
	}

	actions(system) {
		this.setActions({
			powerOn: {
				label: 'Power On Display',
				options: [
					{
						type: 'dropdown',
						id: 'id_end',
						label: 'Command End Character:',
						default: '\n',
						choices: this.CHOICES_END,
					},
				],
			},
			powerOff: {
				label: 'Power Off Display',
				options: [
					{
						type: 'dropdown',
						id: 'id_end',
						label: 'Command End Character:',
						default: '\n',
						choices: this.CHOICES_END,
					},
				],
			},
			sendCustom: {
				label: 'Send Custom Command',
				options: [
					{
						type: 'textwithvariables',
						id: 'id_send',
						label: 'Command:',
						tooltip: 'Use %hh to insert Hex codes',
						default: '',
						width: 6,
					},
					{
						type: 'dropdown',
						id: 'id_end',
						label: 'Command End Character:',
						default: '\n',
						choices: this.CHOICES_END,
					},
				],
			},
		})
	}

	action(action) {
		let cmd
		let end

		switch (action.action) {
			case 'sendCustom':
				this.parseVariables(action.options.id_send, (value) => {
					cmd = unescape(value)
				})
				end = action.options.id_end
				break
			case 'powerOn':
				cmd = Buffer.from([
					'0xAA',
					'0x11',
					'0x01',
					'0x01',
					'0x01',
					'0x14',
					'0xAA',
					'0x11',
					'0xFE',
					'0x01',
					'0x01',
					'0x11',
				])
				end = action.options.id_end
				break
			case 'powerOff':
				cmd = Buffer.from([
					'0xAA',
					'0x11',
					'0x01',
					'0x01',
					'0x00',
					'0x13',
					'0xAA',
					'0x11',
					'0xFE',
					'0x01',
					'0x00',
					'0x10',
				])
				end = action.options.id_end
				break
		}

		/*
		 * create a binary buffer pre-encoded 'latin1' (8bit no change bytes)
		 * sending a string assumes 'utf8' encoding
		 * which then escapes character values over 0x7F
		 * and destroys the 'binary' content
		 */
		let sendBuf = Buffer.from(cmd + end, 'latin1')

		if (sendBuf != '') {
			this.debug('sending ', sendBuf, 'to', this.config.host)

			if (this.socket !== undefined && this.socket.connected) {
				this.socket.send(sendBuf)
			} else {
				this.debug('Socket not connected :(')
			}
		}
	}
}
exports = module.exports = instance
