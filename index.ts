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

import utils from 'somes';
import buffer, {IBuffer} from 'somes/buffer';
import errno from './errno';
import './_fix_contract';
import __Web3 from 'web3';
import * as net from 'net';
import {Contract as __Contract, Options as ContractOptions, 
	EventData, CallOptions, SendOptions, ContractSendMethod as ContractSendMethodRaw } from 'web3-eth-contract';
import {Transaction,TransactionReceipt,provider,PromiEvent } from 'web3-core';
import {BlockTransactionString as Block} from 'web3-eth';
import { Eth } from 'web3-eth';
import {AbiItem} from 'web3-utils';

import './_fix_web3';

class ContractBase extends (require('web3-eth-contract') as typeof __Contract) {};

var requestManager = require('web3-core-requestmanager');

export class Web3 extends (require('web3') as typeof __Web3) {};

export { ContractOptions, EventData, Transaction, TransactionReceipt, Block, CallOptions, SendOptions };

export const providers = Web3.providers;

const crypto_tx = require('crypto-tx');

export const SAFE_TRANSACTION_MAX_TIMEOUT = 300 * 1e3;  // 300秒
export const TRANSACTION_MAX_BLOCK_RANGE = 32;
export const TRANSACTION_CHECK_TIME = 1e4; // 10秒
export const DEFAULT_GAS_PRICE = 1e5; // default gas price

export interface FindEventResult {
	events: EventData[];
	transaction: Transaction;
	transactionReceipt: TransactionReceipt;
}

export interface SendTransactionOprions extends Dict {
	timeout?: number;
	blockRange?: number;
}

export type STOptions = SendTransactionOprions;

export interface TxOptions extends STOptions {
	chainId?: number;
	from?: string;
	nonce?: number;
	to?: string;
	gas?: number;
	gasLimit?: number;
	gasPrice?: number;
	value?: number| string;
	data?: string;
}

export interface ContractSendMethod extends ContractSendMethodRaw {
	/**
	 * returns serializedTx
	 */
	signTx(options?: TxOptions): Promise<SerializedTx>;
	post(options?: TxOptions, callback?: (hash: string) => void): TransactionPromise;
	sendRaw(opts: TxOptions, callback?: (hash: string) => void): TransactionPromise;
}

export interface ContractMethod {
	<A extends any[]>(...args: A): ContractSendMethod;
}

export interface Contract extends ContractBase {
	readonly methods: {
		[method: string]: ContractMethod;
	};
	findEvent(event: string, transactionHash: string, blockNumber?: number): Promise<FindEventResult | null>;
}

export interface Signature {
	signature: IBuffer;
	recovery: number;
}

export interface SerializedTx {
	data: IBuffer;
	hash: IBuffer;
}

export type SendCallback = (hash: string) => void;

export interface IWeb3Z {
	readonly web3: Web3;
	readonly eth: Eth;
	gasPrice(): Promise<number>;
	defaultAccount(): Promise<string>;
	createContract(address: string, abi: any[]): Contract;
	sendTransaction(tx: TxOptions): TransactionPromise;
	sendSignTransaction(tx: TxOptions, callback?: SendCallback): TransactionPromise;
	sendSignedTransaction(serializedTx: IBuffer, opts?: STOptions): TransactionPromise;
	getBlockNumber(): Promise<number>;
	getNonce(account?: string): Promise<number>;
	sign?(message: IBuffer, account?: string): Promise<Signature> | Signature;
	signTx(opts?: TxOptions): Promise<SerializedTx>;
}

class TxSigner {
	private _account: string;
	private _host: IWeb3Z;
	constructor(host: IWeb3Z, account: string) {
		this._host = host;
		this._account = '0x' + crypto_tx.toChecksumAddress(buffer.from(account.slice(2), 'hex'));
	}
	async sign(message: IBuffer) {
		if (!this._host.sign)
			throw Error.new(errno.ERR_IWEB3Z_SIGN_NOT_IMPL);
		var signature = await this._host.sign(buffer.from(message), this._account);
		return {
			signature: Buffer.from(signature.signature),
			recovery: signature.recovery,
		};
	}
}

export interface TransactionPromise extends Promise<TransactionReceipt> {
	// sending
	// sent
	// transactionHash
	// receipt
	// confirmation
	// error
	hash(cb: SendCallback): this;
}

export class TransactionPromiseIMPL extends utils.PromiseNx<TransactionReceipt> implements TransactionPromise {
	private _hash?: SendCallback;
	hash(cb: SendCallback) {
		this._hash = cb;
		return this;
	}
	getHash() {
		return this._hash;
	}
	static proxy(exec: ()=>Promise<{promise:TransactionPromise}>): TransactionPromise {
		return new TransactionPromiseIMPL(async (r, j, p)=>{
			var p_ = p as TransactionPromiseIMPL;
			var e = await exec();
			e.promise.hash(_=>{
				var cb = p_.getHash();
				if (cb)
					cb(_);
			});
			r(await e.promise);
		});
	}
}

async function setTx(self: Web3Z, tx: TxOptions, estimateGas?: (tx: TxOptions)=>Promise<number>) {
	estimateGas = estimateGas || ((tx: TxOptions)=>self.eth.estimateGas(tx));
	tx.from = tx.from || await self.defaultAccount();
	tx.nonce = tx.nonce || await self.eth.getTransactionCount(tx.from);
	tx.chainId = tx.chainId || await self.eth.getChainId();
	tx.value = tx.value || '0x0';
	tx.data = tx.data || '0x';

	if (!tx.gas)
		tx.gas = await estimateGas({...tx,
			chainId: '0x' + tx.chainId.toString(16),
			nonce: '0x' + tx.nonce.toString(16),
		} as any);
	if (!tx.gasLimit) // 程序运行时步数限制 default
		tx.gasLimit = parseInt(String(tx.gas * 1.2)); // suggested gas limit
	if (!tx.gasPrice) // 程序运行单步的wei数量wei default
		tx.gasPrice = await self.getGasPrice() || DEFAULT_GAS_PRICE;
}

function sendTransactionCheck(self: Web3Z, peceipt: PromiEvent<TransactionReceipt>, opts: STOptions = {}): TransactionPromise {
	var eth = self.eth;
	var TIMEOUT_ERRNO = errno.ERR_REQUEST_TIMEOUT[0];

	return new TransactionPromiseIMPL(async function (resolve, reject, p) {
		// send signed Transaction
		var id = utils.getId();
		console.log('send signed Transaction', id);
		// event: transactionHash,receipt,confirmation

		var pp = p as TransactionPromiseIMPL;
		var id = utils.getId();

		var blockNumber = await self.getBlockNumber();

		opts = opts || {};

		var timeout = (Number(opts.timeout) || SAFE_TRANSACTION_MAX_TIMEOUT) + Date.now();
		var block_range = Number(opts.blockRange) || TRANSACTION_MAX_BLOCK_RANGE;
		var limit_block = blockNumber + block_range;
		var completed = false
		var is_check = false;
		var txHash = '';
		var rawReceipt: TransactionReceipt | undefined;

		function complete(err?: Error, receipt?: TransactionReceipt) {
			if (!completed) {
				completed = true;
				if (receipt) {
					receipt = Object.assign(rawReceipt || {}, receipt);
					if (receipt.status) {
						err = undefined;
					} else {
						if (!err) {
							err = Error.new(errno.ERR_ETH_TRANSACTION_FAIL);
						}
					}
					receipt = utils.clone(receipt); // fix clear rawReceipt props error
				}
				console.log('send signed Transaction complete', id, err, receipt);
				err ? reject(Object.assign(Error.new(err), {receipt})): resolve(receipt as TransactionReceipt);
			}
		}

		async function check_receipt() {
			utils.assert(txHash, 'argument bad');
			if (is_check)
				return;
			is_check = true;

			while (!completed) {
				var receipt;
				try {
					receipt = await eth.getTransactionReceipt(txHash);
				} catch(err: any) {
					if (err.code != TIMEOUT_ERRNO) { // timeout
						console.warn(err);
					} else {
						console.warn(err);
					}
				}
				if (receipt && receipt.blockHash) {
					complete(undefined, receipt);
				} else if (timeout < Date.now()) {
					complete(Error.new(errno.ERR_REQUEST_TIMEOUT));
				} else {
					var blockNumber = 0;
					try {
						blockNumber = await self.getBlockNumber();
					} catch(err) {
						console.warn(err);
					}
					if (blockNumber && blockNumber > limit_block) {
						complete(Error.new(errno.ERR_ETH_TRANSACTION_FAIL));
					}
				}
				await utils.sleep(self.TRANSACTION_CHECK_TIME);
			}
		}

		peceipt
		.on('transactionHash', (hash: string)=>{
			txHash = hash;
			var cb = pp.getHash();
			if (cb)
				cb(hash);
		})
		.then(e=>{
			// console.log('_sendTransactionCheck . then', e);
			txHash = e.transactionHash;
			rawReceipt = e;
			check_receipt().catch(console.error);
		})
		.catch(async (e: Error)=>{
			if (!completed) {
				if (txHash) {
					try {
						var receipt = await eth.getTransactionReceipt(txHash);
						if (receipt && receipt.blockHash) {
							complete(e, receipt);
						}
					} catch(err) {
						console.warn(err);
					}
					if (!completed) {
						check_receipt().catch(console.error)
					}
				} else {
					complete(e);
				}
			}
		});

		// end
	});
}

export class Contract extends ContractBase {
	private _host: Web3Z;
	private __requestManager: any;

	constructor(host: Web3Z, jsonInterface: AbiItem[], address: string, options?: ContractOptions) {
		super(jsonInterface, address, options);
		this._host = host;
		this._Init(jsonInterface, address);
		(this as any).setProvider(host.eth);
	}

	private set _requestManager(v:any) {
		this.__requestManager = v;
	}
	
	private get _requestManager() {
		return this._host ? (this._host.web3 as any)._requestManager: this.__requestManager;
	}

	private set _provider(v:any) {}

	private get _provider() {
		return this._requestManager.provider;
	}

	private set BatchRequest(v: any) {}

	private get BatchRequest() {
		var self = this;
		return function (...args: any) {
			return requestManager.BatchManager(self._requestManager, ...args);
		}
	}

	private _Init(jsonInterface: AbiItem[], address: string) {
		var self = this;

		async function signTx(method: ContractSendMethod, opts?: TxOptions) {
			var _opts = Object.assign(opts, {
				to: address,
				data: method.encodeABI(),
			});
			var ib = await self._host.signTx(_opts);
			return ib;
		}

		function sendSignTransaction(method: ContractSendMethod, opts?: TxOptions, callback?: (hash: string) => void) {
			return TransactionPromiseIMPL.proxy(async ()=>{
				var tx = await signTx(method, opts);
				var promise = self._host.sendSignedTransaction(tx.data, opts, callback);
				return {promise};
			});
		}

		function sendTransaction(method: ContractSendMethod, _opts?: TxOptions, callback?: (hash: string) => void) {
			return TransactionPromiseIMPL.proxy(async ()=>{
				var opts = _opts || {};
				var cb = callback || function(){};
				await setTx(self._host, opts, (tx)=>method.estimateGas(tx));
				var promise1 = method.send(opts as SendOptions, (e,h)=>!e&&h&&cb(h)) as unknown as PromiEvent<TransactionReceipt>
				var promise = sendTransactionCheck(self._host, promise1, opts);
				return {promise};
			});
		}

		// TODO extend method signedTransaction() and sendSignedTransaction()
		jsonInterface.forEach(function({ name, type }) {
			if (name && type == 'function') {
				var { methods } = self;
				var raw = methods[name];
				methods[name] = (...args: any[])=>{
					var method = raw.call(methods, ...args) as ContractSendMethod;
					var call = method.call;
					method.signTx = e=>signTx(method, e);
					method.post = (e,cb)=>sendSignTransaction(method, e, cb);
					method.sendRaw = (e,cb)=>sendTransaction(method, e, cb);
					method.call = function(opts?: any, ...args: any[]) {
						var { event, retry, timeout, blockRange, ..._opts } = opts || {};
						return call.call(this, _opts, ...args);
					};
					return method;
				};
			}
		});
	}

	async findEvent(event: string, transactionHash: string, blockNumber?: number) {
		var j = 10;

		if (blockNumber) {
			while (j--) { // 确保本块已同步
				var num = await this._host.eth.getBlockNumber();
				if (num >= blockNumber) {
					break;
				}
				await utils.sleep(1e4); // 10s
			}
		}

		j = 10;

		// read event data
		var tx: Transaction | null = null;
		var tx_r: TransactionReceipt | null = null;
		var transactionIndex: number;
		var events: EventData[];

		while (j--) { // 重试10次,10次后仍然不能从链上查询到txid,丢弃
			try {
				tx = await this._host.eth.getTransaction(transactionHash);
				if (tx) {
					tx_r = await this._host.eth.getTransactionReceipt(transactionHash);
					break;
				}
			} catch(err) {
				if (j) await utils.sleep(1e3); else throw err; // 1s
			}
		}

		if (!tx || !tx_r)
			return null;

		var transaction = tx;
		var transactionReceipt = tx_r;
		// var contract = await this.contract(transaction.to);

		j = 10;

		while (j--) {
			try {
				events = await this.getPastEvents(event, {
					fromBlock: blockNumber, toBlock: blockNumber,
				});
				if (events.some(e=>e.transactionHash)) { // have transactionHash
					events = events.filter(e=>e.transactionHash==transactionHash);
				} else {
					events = events.filter(e=>e.blockHash==transaction.blockHash&&e.transactionIndex==transactionIndex);
				}
				return events.length ? { events, transaction, transactionReceipt }: null;
			} catch(err) {
				if (j)
					await utils.sleep(1e3);
				else
					console.error(err); //throw err; // 1s
			}
		}

		return null;
	}

}

export class Web3Z implements IWeb3Z {
	// private _gasPrice = DEFAULT_GAS_PRICE;
	private _web3?: Web3;

	TRANSACTION_CHECK_TIME = TRANSACTION_CHECK_TIME;

	private getProviderFrom(provider: provider) {

		var { HttpProvider, WebsocketProvider, IpcProvider } = Web3.providers;
		if (typeof provider == 'string') {
			if (/^https?:/.test(provider)) { // http
				provider = new HttpProvider(provider, { timeout: SAFE_TRANSACTION_MAX_TIMEOUT });
			} else if (/^wss?:/.test(provider)) { // web socket
				provider = new WebsocketProvider(provider, { timeout: SAFE_TRANSACTION_MAX_TIMEOUT });
			} else if (/^[\\/]/.test(provider)) { // ipc
				provider = new IpcProvider(provider, net);
			} else {
				throw Error(`Can't create 'Web3 provider`);
			}
		}
		return provider;
	}

	givenProvider(): provider {
		return 'http://127.0.0.1:8545';
	}

	get provider() {
		return this.web3.currentProvider;
	}

	set provider(provider: provider) {
		if (!this._web3) {
			this._web3 = new Web3(this.getProviderFrom(provider));
			(this._web3.eth as any).Contract = {}; // cause memory overflow error
		} else {
			this._web3.setProvider(this.getProviderFrom(provider));
		}
	}

	get web3() {
		if (!this._web3) {
			this._web3 = new Web3(this.getProviderFrom(this.givenProvider()));
			(this._web3.eth as any).Contract = {};
		}
		return this._web3 as Web3;
	}

	async defaultAccount() {
		return this.web3.defaultAccount || (await this.eth.getAccounts())[0] || '';
	}

	async getGasPrice() {
		return Number(await this.eth.getGasPrice());
	}

	get eth() {
		return this.web3.eth;
	}

	get utils() {
		return this.web3.utils;
	}

	get version() {
		return this.web3.version;
	}

	createContract(contractAddress: string, abi: AbiItem[]) {
		return new Contract(this, abi, contractAddress);
	}

	/**
	 * @func sign message long bytes32
	 */
	sign?(message: IBuffer, account?: string): Promise<Signature> | Signature;

	/**
	 * @func signTx(param) 对交易进行签名
	 */
	async signTx(opts?: TxOptions): Promise<SerializedTx> {
		if (opts) {
			for (var [key,val] of Object.entries(opts)) {
				if (val === undefined || val === null || val === '')
					delete opts[key];
			}
		}
		var { event, retry, timeout, blockRange, ..._opts } = Object.assign({}, opts);

		await setTx(this, _opts);

		console.log('signTx, TxOptions =', _opts);

		var tx = await crypto_tx.signTx(new TxSigner(this, _opts.from as string), _opts);

		return {
			data: buffer.from(tx.serializedTx),
			hash: buffer.from(tx.hash),
		}
	}

	/**
	 * @func sendTransaction(tx) 发送交易数据(不签名)
	 */
	sendTransaction(tx: TxOptions, callback?: (hash: string) => void) {
		var cb = callback || function(){};
		return TransactionPromiseIMPL.proxy(async()=>{
			await setTx(this, tx);
			var promise = sendTransactionCheck(this, this.eth.sendTransaction(tx, (e,h)=>!e&&h&&cb(h)), tx);
			return {promise};
		});
	}

	/**
	 * @func sendTransaction(tx) 签名交易数据并发送
	 */
	 sendSignTransaction(opts: TxOptions, callback?: (hash: string) => void) {
		return TransactionPromiseIMPL.proxy(async ()=>{
			var tx = await this.signTx(opts);
			var promise = this.sendSignedTransaction(tx.data, opts, callback);
			return {promise};
		});
	}

	/**
	 * @func sendSignedTransaction(serializedTx) 发送签名后的交易数据
	 */
	sendSignedTransaction(serializedTx: IBuffer, opts?: STOptions, callback?: (hash: string) => void) {
		var cb = callback || function(){};
		return sendTransactionCheck(this,
			this.eth.sendSignedTransaction('0x' + serializedTx.toString('hex'), (e,h)=>!e&&h&&cb(h)), opts);
	}

	// Rewrite by method

	async getBlockNumber() {
		return await utils.timeout(this.eth.getBlockNumber(), 1e4);
	}

	async getNonce(account?: string): Promise<number> {
		return await this.eth.getTransactionCount(account || await this.defaultAccount(), 'latest');
	}
}