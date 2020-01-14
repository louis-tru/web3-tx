/**
 * @copyright © 2018 Copyright dphone.com
 * @date 2018-06-14
 */

var errno = require('./errno');
var package_json = require('./package');

function ConnectionTimeout(ms) {
	return Error.new(errno.ERR_REQUEST_TIMEOUT);
};

function InvalidResponse(result) {
	// var message = !!result && !!result.error && !!result.error.message ? 
	// result.error.message : 'Invalid JSON RPC response: ' + JSON.stringify(result);
	console.error('InvalidResponse', result);
	return Error.new(errno.ERR_ETHEREUM_FAULT_ERROR);
}

function ErrorResponse(result) {
	// var message = !!result && !!result.error && !!result.error.message ? 
	// 	result.error.message : JSON.stringify(result);
	result = result || {};
	var err = result.error ? result.error: result;
	err.rpcCode = err.code || -1;
	if (err.rpcCode == -32065) { // timeout
		err.errno = errno.ERR_REQUEST_TIMEOUT[0];
		return Error.new(err);
	} else {
		return Error.new(err);
	}
}

function send(payload, callback) {
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

var web3_version = package_json.dependencies.web3;

if (web3_version == '1.0.0-beta.37' || web3_version.indexOf('1.2.4') != 0) {

	var errors = require('web3-core-helpers').errors;
	var HttpProvider = require('web3-providers-http');

	errors.ConnectionTimeout = ConnectionTimeout;
	errors.InvalidResponse = InvalidResponse;
	errors.ErrorResponse = ErrorResponse;
	HttpProvider.prototype.send = send;
}

