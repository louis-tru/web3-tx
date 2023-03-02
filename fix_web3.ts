/**
 * @copyright © 2018 Copyright dphone.com
 * @date 2018-06-14
 */

import 'somes';
import errno from './errno';
import * as utils from 'web3-utils';
import {formatters} from 'web3-core-helpers';
import {TransactionReceipt} from 'web3-core';

formatters.outputTransactionReceiptFormatter = function(receipt: TransactionReceipt) {
	if (typeof receipt !== 'object') {
		throw new Error('Received receipt is invalid: ' + receipt);
	}
	if (!(this as any).hexFormat) {
		if (receipt.blockNumber !== null)
			receipt.blockNumber = utils.hexToNumber(receipt.blockNumber);
		if (receipt.transactionIndex !== null)
			receipt.transactionIndex = utils.hexToNumber(receipt.transactionIndex);
		receipt.cumulativeGasUsed = utils.hexToNumber(receipt.cumulativeGasUsed);
		receipt.gasUsed = utils.hexToNumber(receipt.gasUsed);
		if (receipt.effectiveGasPrice) {
			// Fix: Error: Number can only safely store up to 53 bits
			receipt.effectiveGasPrice = Number(receipt.effectiveGasPrice); //utils.hexToNumber(receipt.effectiveGasPrice);
		}
	}
	if (Array.isArray(receipt.logs)) {
		receipt.logs = receipt.logs.map(formatters.outputLogFormatter);
	}
	if (receipt.contractAddress) {
		receipt.contractAddress = utils.toChecksumAddress(receipt.contractAddress);
	}
	if (typeof receipt.status !== 'undefined' && receipt.status !== null) {
		receipt.status = Boolean(parseInt(receipt.status as any));
	}
	return receipt;
};

function ConnectionTimeout(timeout: any) {
	return Error.new(errno.ERR_RPC_REQUEST_TIMEOUT).ext({timeout});
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

function sendOld(this: any, payload: any, callback: (err?: any, data?: any)=>void) {
	var _this = this;
	var request = this._prepareRequest();
	var complete = false;

	request.onreadystatechange = function() {
		if (request.readyState === 4 && request.timeout !== 1) {
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
		}
	};

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
// const rawSend = HttpProvider.prototype.send;
// HttpProvider.prototype.send = send;

export {}