/**
 * @copyright © 2018 Copyright dphone.com
 * @date 2018-06-14
 */

import 'somes';
import errno from './errno';

function ConnectionTimeout() {
	return Error.new(errno.ERR_RPC_REQUEST_TIMEOUT);
}

function InvalidResponse(result: any) {
	// var message = !!result && !!result.error && !!result.error.message ? 
	// result.error.message : 'Invalid JSON RPC response: ' + JSON.stringify(result);
	return Error.new(errno.ERR_WEB3_RPC_INVALID_RESPONSE).ext({response: result});
}

function ErrorResponse(result: any) {
	// var message = !!result && !!result.error && !!result.error.message ? 
	// 	result.error.message : JSON.stringify(result);
	result = result || {};
	var err = result.error ? result.error: result;
	err.errno = err.code || -30000;
	if (err.errno == -32065) { // timeout
		err.errno = errno.ERR_RPC_REQUEST_TIMEOUT[0];
		return Error.new(err);
	} else {
		return Error.new(err);
	}
}

function send(this: any, payload: any, callback: (err?: any, data?: any)=>void) {
	var _this = this;
	var request = this._prepareRequest();
	var complete = false;

	request.onloadend = function() {
		if (complete) return;
		complete = true;
		var result = request.responseText;
		var error = null;
		try {
			result = JSON.parse(result);
		} catch(e) {
			error = errors.InvalidResponse(request.responseText);
		}
		_this.connected = true;
		callback(error, result);
	};

	request.ontimeout = function() {
		complete = true;
		_this.connected = false;
		callback(errors.ConnectionTimeout(this.timeout));
	};

	try {
		request.send(JSON.stringify(payload));
	} catch(error) {
		this.connected = false;
		callback(errors.InvalidConnection(this.host));
	}
};

var errors = require('web3-core-helpers').errors;
var HttpProvider = require('web3-providers-http');

errors.ConnectionTimeout = ConnectionTimeout;
errors.InvalidResponse = InvalidResponse;
errors.ErrorResponse = ErrorResponse;
HttpProvider.prototype.send = send;

export {}