/**
 * @copyright © 2018 Copyright dphone.com
 * @date 2018-06-14
 */

import 'somes';
import errno_ from 'somes/errno';
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
			receipt.blockNumber = Number(utils.hexToNumber(receipt.blockNumber));
		if (receipt.transactionIndex !== null)
			receipt.transactionIndex = Number(utils.hexToNumber(receipt.transactionIndex));
		receipt.cumulativeGasUsed = Number(utils.hexToNumber(receipt.cumulativeGasUsed));
		receipt.gasUsed = Number(utils.hexToNumber(receipt.gasUsed));
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
	return Error.new(errno.ERR_WEB3_RPC_REQUEST_TIMEOUT).ext({timeout});
}

function InvalidResponse(result: any) {
	return Error.new(errno.ERR_WEB3_RPC_INVALID_RESPONSE).ext({response: result});
}

function ErrorResponse(result: any) {
	result = result || {};
	let err = result.error ? result.error: result;
	err.errno = err.code || -30000;

	if (err.errno == -32065) { // timeout
		err.errno = errno.ERR_WEB3_RPC_REQUEST_TIMEOUT[0];
	} if (err.errno == errno_.ERR_HTTP_REQUEST_TIMEOUT[0]) { 
		err.errno = errno.ERR_WEB3_RPC_REQUEST_TIMEOUT[0];
	}
	return Error.new(err);
}

var errors = require('web3-core-helpers').errors;
// var HttpProvider = require('web3-providers-http');

errors.ConnectionTimeout = ConnectionTimeout;
errors.InvalidResponse = InvalidResponse;
errors.ErrorResponse = ErrorResponse;
// const rawSend = HttpProvider.prototype.send;
// HttpProvider.prototype.send = send;

export {}