module.exports = [
	/*
	 * Place your upgrade scripts here
	 * Remember that once it has been added it cannot be removed!
	 */
	function addPort(context, props) {
		var result = {
			updatedConfig: null,
			updatedActions: [],
			updatedFeedbacks: [],
		}
		if (props.config !== null && !props.config.port) {
			result.updatedConfig = props.config
			result.updatedConfig.port = 1515
		}
		console.log(JSON.stringify(result))
		return result
	},
	function addId(context, props) {
		var result = {
			updatedConfig: null,
			updatedActions: [],
			updatedFeedbacks: [],
		}
		if (props.config !== null && (props.config.id == undefined || props.config.id == '')) {
			result.updatedConfig = props.config
			// Set ID to 1 on upgrade for backwards compatibility with original module
			result.updatedConfig.id = 1
		}
		console.log(JSON.stringify(result))
		return result
	},
]
