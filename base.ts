/* ***** BEGIN LICENSE BLOCK *****
 * Distributed under the BSD license:
 *
 * Copyright (c) 2015, xuewen.chu
 * All rights reserved.
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are met:
 *     * Redistributions of source code must retain the above copyright
 *       notice, this list of conditions and the following disclaimer.
 *     * Redistributions in binary form must reproduce the above copyright
 *       notice, this list of conditions and the following disclaimer in the
 *       documentation and/or other materials provided with the distribution.
 *     * Neither the name of xuewen.chu nor the
 *       names of its contributors may be used to endorse or promote products
 *       derived from this software without specific prior written permission.
 *
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND
 * ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
 * WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
 * DISCLAIMED. IN NO EVENT SHALL xuewen.chu BE LIABLE FOR ANY
 * DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
 * (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES;
 * LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND
 * ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
 * (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS
 * SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 *
 * ***** END LICENSE BLOCK ***** */

import __Web3 from 'web3';
import { JsonRpcPayload, JsonRpcResponse } from 'web3-core-helpers';
import * as base from './base';
import {Contract as __Contract, Options as ContractOptions, 
	EventData, CallOptions, SendOptions, ContractSendMethod as ContractSendMethodRaw } from 'web3-eth-contract';
import {Transaction,TransactionReceipt } from 'web3-core';
import {BlockTransactionString as Block} from 'web3-eth';
import {IBuffer} from 'somes/buffer';

import './_fix_contract';
import './_fix_web3';

// class ContractBase extends (require('web3-eth-contract') as typeof __Contract) {};

export const SAFE_TRANSACTION_MAX_TIMEOUT = 300 * 1e3;  // 300秒
export const TRANSACTION_MAX_BLOCK_RANGE = 32;
export const TRANSACTION_CHECK_TIME = 1e4; // 10秒
export const DEFAULT_GAS_PRICE = 1e5; // default gas price

export type RpcCallback = (error?: Error, result?: JsonRpcResponse) => void;

export type RpcSend = (payload: JsonRpcPayload, callback: RpcCallback) => void;

export class Web3Raw extends (require('web3') as typeof __Web3) {};

export { ContractOptions, EventData, Transaction, TransactionReceipt, Block, CallOptions, SendOptions };

export const providers = base.Web3Raw.providers;

export interface FindEventResult {
	events: EventData[];
	transaction: Transaction;
	transactionReceipt: TransactionReceipt;
}

export interface TxOptions extends Dict {
	chainId?: number;
	from?: string;
	nonce?: number;
	to?: string;
	gas?: number;
	gasLimit?: number;
	gasPrice?: number;
	value?: number| string;
	data?: string;
	timeout?: number; // ext
	blockRange?: number; // ext
}

export type SendCallback = (hash: string, opts: TxOptions) => any;
export type TransactionPromise = Promise<TransactionReceipt>;

export interface SerializedTx {
	data: IBuffer;
	hash: IBuffer;
}

export interface ContractSendMethod extends ContractSendMethodRaw {
	/**
	 * returns serializedTx
	 */
	signTx(opts?: TxOptions): Promise<SerializedTx>;
	post(opts?: TxOptions, cb?: SendCallback): TransactionPromise;
	sendRaw(opts?: TxOptions, cb?: SendCallback): TransactionPromise;
}

export interface ContractMethod {
	<A extends any[]>(...args: A): ContractSendMethod;
}
