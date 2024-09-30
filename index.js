const { InstanceBase, InstanceStatus, TCPHelper, Regex, runEntrypoint } = require('@companion-module/base')
const { combineRgb } = require('@companion-module/base')

class SamsungDisplayInstance extends InstanceBase {
	init(config) {
		this.config = config
		this.actions() // export actions
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

		if (self.socket !== undefined) {
			self.socket.destroy()
			delete self.socket
		}

		self.updateStatus(InstanceStatus.Connecting)

		if (self.config.host) {
			self.socket = new TCPHelper(self.config.host, 1515)

			self.socket.on('status_change', (status, message) => {
				self.updateStatus(status, message)
			})

			self.socket.on('error', (err) => {
				self.log('debug', 'Network error', err)
				self.log('error', 'Network error: ' + err.message)
			})

			self.socket.on('connect', () => {
				self.log('debug', 'Connected')
			})

			self.socket.on('data', (data) => {
				// self.log('debug', data)
				let powerOff = new Buffer.from([0xaa, 0xff, 0x01, 0x03, 0x41, 0x11, 0x00, 0x55], 'latin1')
				let powerOn = new Buffer.from([0xaa, 0xff, 0x01, 0x03, 0x41, 0x11, 0x01, 0x56], 'latin1')
				if (Buffer.compare(data, powerOff) === 0) {
					self.log('info', 'POWER OFF command received by Display')
				}
				if (Buffer.compare(data, powerOn) === 0) {
					self.log('info', 'POWER ON command received by Display')
				}
			})
		}
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
		]
	}

	// When module gets deleted
	destroy() {
		this.socket.destroy()

		this.log('debug', 'destroy ' + this.id)
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
			feedbacks: [],
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
			feedbacks: [],
		})
		this.setPresetDefinitions(presets)
	}

	actions(system) {
		this.setActionDefinitions({
			powerOn: {
				name: 'Power On Display',
				options: [],
				callback: async (action) => {
					await this.doAction(action)
				},
			},
			powerOff: {
				name: 'Power Off Display',
				options: [],
				callback: async (action) => {
					await this.doAction(action)
				},
			},
		})
	}

	doAction(action) {
		let cmd
		let end

		switch (action.actionId) {
			case 'powerOn':
				// response aa ff 01 03 41 11 01 56
				cmd = Buffer.from(
					['0xAA', '0x11', '0x01', '0x01', '0x01', '0x14', '0xAA', '0x11', '0xFE', '0x01', '0x01', '0x11'],
					'latin1',
				)
				break
			case 'powerOff':
				// response aa ff 01 03 41 11 00 55
				cmd = Buffer.from(
					['0xAA', '0x11', '0x01', '0x01', '0x00', '0x13', '0xAA', '0x11', '0xFE', '0x01', '0x00', '0x10'],
					'latin1',
				)
				break
			default:
				this.log('debug', 'unknown action')
				break
		}

		/*
		 * create a binary buffer pre-encoded 'latin1' (8bit no change bytes)
		 * sending a string assumes 'utf8' encoding
		 * which then escapes character values over 0x7F
		 * and destroys the 'binary' content
		 */
		// let sendBuf = Buffer.from(cmd + end, 'latin1')
		let sendBuf = cmd

		if (sendBuf != '') {
			this.log('debug', 'sending ' + sendBuf + ' to ' + this.config.host)

			if (this.socket !== undefined && this.socket.isConnected) {
				this.socket.send(sendBuf)
			} else {
				this.log('debug', 'Socket not connected :(')
			}
		}
	}
}
runEntrypoint(SamsungDisplayInstance, [])
