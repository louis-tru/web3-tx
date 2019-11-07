
var Contract = require('web3-eth-contract');
var _ = require('underscore');
var utils = require('web3-utils');

Contract.prototype._generateEventOptions = function() {
	var args = Array.prototype.slice.call(arguments);

	// get the callback
	var callback = this._getCallback(args);

	// get the options
	var options = (_.isObject(args[args.length - 1])) ? args.pop() : {};

	var eventName = (_.isString(args[0])) ? args[0] : 'allevents';
	var event = (eventName.toLowerCase() === 'allevents') ? {
					name: 'ALLEVENTS',
					jsonInterface: this.options.jsonInterface
			} : this.options.jsonInterface.find(function (json) {
					return (json.type === 'event' && (json.name === eventName || json.signature === '0x'+ eventName.replace('0x','')));
			});

	if (!event) {
			throw new Error('Event "' + eventName + '" doesn\'t exist in this contract.');
	}

	if (!utils.isAddress(this.options.address)) {
			throw new Error('This contract object doesn\'t have address set yet, please set an address first.');
	}

	return {
			params: this._encodeEventABI(event, options),
			event: event,
			callback: callback
	};
};