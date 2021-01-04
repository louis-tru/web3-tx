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
import { List } from 'somes/event';
import './_fix_contract';
import './_fix_web3';
import Web3 from 'web3';
import * as net from 'net';
import {Contract as ContractRaw, Options as ContractOptions, 
	EventData, CallOptions, SendOptions, ContractSendMethod as ContractSendMethodRaw } from 'web3-eth-contract';
import {Transaction,TransactionReceipt} from 'web3-core';
import {BlockTransactionString as Block} from 'web3-eth';

export { Web3, ContractOptions, EventData, Transaction, TransactionReceipt, Block, CallOptions, SendOptions };

const crypto_tx = require('crypto-tx');

const __Web3__ = require('web3');

(exports as any).Web3 = __Web3__;

const SAFE_TRANSACTION_MAX_TIMEOUT = 300 * 1e3;  // 180秒
const TRANSACTION_MAX_BLOCK_RANGE = 32;
const TRANSACTION_CHECK_TIME = 1e4; // 10秒
const DEFAULT_GAS_LIMIT = 1e8;
const DEFAULT_GAS_PRICE = 1e5;

export interface FindEventResult {
	event: EventData;
	transaction: Transaction;
}

export interface SendTransactionOprions extends Dict {
	timeout?: number;
	blockRange?: number;
}

export type STOptions = SendTransactionOprions;

export interface TxOptions extends STOptions {
	from?: string;
	to?: string;
	value?: string;
	gas?: number;
	gasLimit?: number;
	gasPrice?: number;
	data?: string;
	nonce?: number;
	chainId?: number;
}

export interface ContractSendMethod extends ContractSendMethodRaw {
	/**
	 * returns serializedTx
	 */
	signTx(options?: TxOptions): Promise<IBuffer>;
	sendSignTransaction(options?: TxOptions): Promise<TransactionReceipt>;
}

export interface ContractMethod {
	<A extends any[]>(...args: A): ContractSendMethod;
}

export interface Contract extends ContractRaw {
	readonly methods: {
		[method: string]: ContractMethod;
	};
	findEvent(event: string, blockNumber: number, transactionHash: string): Promise<FindEventResult | null>;
}

export interface ABIDef {
	address: string;
	abi: any[];
}

export interface Signature {
	signature: IBuffer;
	recovery: number;
}

export interface IWeb3Z {
	defaultAccount: string;
	createContract(address: string, abi: any[], name?: string): Contract;
	signTx(opts?: TxOptions): Promise<IBuffer>;
	sendTransaction(opts?: TxOptions): Promise<TransactionReceipt>;
	sendSignedTransaction(serializedTx: IBuffer, options?: STOptions): Promise<TransactionReceipt>;
	getBlockNumber(): Promise<number>;
	getNonce(account?: string): Promise<number>;
	sign(message: IBuffer, account?: string): Promise<Signature> | Signature;
}

class TxSigner {
	private _account: string;
	private _host: IWeb3Z;
	constructor(host: IWeb3Z, account: string) {
		this._host = host;
		this._account = account;
	}
	async sign(message: IBuffer) {
		var signature = await this._host.sign(buffer.from(message), this._account);
		return {
			signature: Buffer.from(signature.signature),
			recovery: signature.recovery,
		};
	}
}

export abstract class Web3Z implements IWeb3Z {
	private _url: string;
	private _defaultAccount: string;
	private _gasLimit = DEFAULT_GAS_LIMIT;
	private _gasPrice = DEFAULT_GAS_PRICE;
	private __raw__?: Web3;
	private _chainId = 0;

	TRANSACTION_CHECK_TIME = TRANSACTION_CHECK_TIME;

	constructor(url: string, defaultAccount = '') {
		this._url = url || 'http://127.0.0.1:8545';
		this._defaultAccount = defaultAccount || '';
	}

	get gasLimit() {
		return this._gasLimit;
	}

	set gasLimit(value) {
		this._gasLimit = Number(value) || DEFAULT_GAS_LIMIT;
	}

	get gasPrice() {
		return this._gasPrice;
	}

	set gasPrice(value) {
		this._gasPrice = Number(value) || DEFAULT_GAS_PRICE;
	}

	get chainId() {
		return this._chainId;
	}

	private async _getChainId() {
		return this.raw.eth.getChainId();
	}

	get defaultAccount() {
		return this._defaultAccount;
	}

	set defaultAccount(account) {
		this._defaultAccount = account;
		if (this.raw)
			this.raw.eth.defaultAccount = account;
	}

	get raw() {
		if (!this.__raw__) {
			var url = this._url;
			var { HttpProvider, WebsocketProvider, IpcProvider } = __Web3__.providers;
			var provider;
			if (/^https?:/.test(url)) {
				provider = new HttpProvider(url, { timeout: SAFE_TRANSACTION_MAX_TIMEOUT });
			} else if (/^wss?:/.test(url)) {
				provider = new WebsocketProvider(url, { timeout: SAFE_TRANSACTION_MAX_TIMEOUT });
			} else if (/^[\\/]/.test(url)) {
				provider = new IpcProvider(url, net);
			} else {
				// TODO ipc file ...
				throw Error(`Can't create 'Web3 provider`);
			}
			var __raw__ = new __Web3__(provider);
			__raw__.eth.defaultAccount = this.defaultAccount;
			this.__raw__ = __raw__;
		}
		return this.__raw__ as Web3;
	}

	createContract(contractAddress: string, abi: any[]) {
		var self = this;
		var account = self.defaultAccount;
		var contract = new self.raw.eth.Contract(abi, contractAddress, { 
			from: account, 
			// TODO pos相夫本节点配置了这个"gas"参数所有协约get rpc请求均不能访问
			/*gas: self.gasLimit, gasLimit: self.gasLimit,*/
		}) as Contract;

		contract.findEvent = (event: string, blockNumber: number, hash: string)=>this._findEvent(contract, event, blockNumber, hash);

		async function signTx(method: ContractSendMethod, opts?: TxOptions) {
			var _opts = Object.assign({ from: account, value: '0x00' }, opts, {
				to: contractAddress,
				data: method.encodeABI(),
			});
			var ib = await self.signTx(_opts);
			return ib;
		}

		async function sendSignTransaction(method: ContractSendMethod, opts?: TxOptions) {
			return self.sendSignedTransaction(await signTx(method, opts));
		}

		// TODO extend method signedTransaction() and sendSignedTransaction()
		abi.forEach(function({ name }) {
			var { methods } = contract;
			var raw = methods[name];
			methods[name] = (...args: any[])=>{
				var method = raw.call(methods, ...args) as ContractSendMethod;
				method.signTx = e=>signTx(method, e),
				method.sendSignTransaction = e=>sendSignTransaction(method, e);
				return method;
			};
		});

		return contract as Contract;
	}

	private async _findEvent(contract: Contract, eventName: string, blockNumber: number, transactionHash: string): Promise<FindEventResult | null> {
		var j = 10;

		while (j--) { // 确保本块已同步
			var num = await this.raw.eth.getBlockNumber();
			if (num >= blockNumber) {
				break;
			}
			await utils.sleep(1e4); // 10s
		}

		j = 10;

		// read event data
		var tx: Transaction | null = null;
		var transactionIndex: number;
		var event: EventData | undefined;
		var events: EventData[];

		while (j--) { // 重试10次,10次后仍然不能从链上查询到txid,丢弃
			try {
				var block = await this.raw.eth.getBlock(blockNumber);// as Transaction[];
				if (block) {
					var transactions = block.transactions as string[];
					var transactionIndex = transactions.indexOf(transactionHash);
					if (transactionIndex != -1) {
						if ( (tx = await this.raw.eth.getTransactionFromBlock(blockNumber, transactionIndex)) )
							break;
					}
				}
				return null;
			} catch(err) {
				if (j) await utils.sleep(1e3); else throw err; // 1s
			}
		}

		if (!tx)
			return null;

		var transaction = tx
		// var contract = await this.contract(transaction.to);

		j = 10;

		while (j--) {
			try {
				events = await contract.getPastEvents(eventName, {
					fromBlock: blockNumber, toBlock: blockNumber,
				});
				if (events.some(e=>e.transactionHash)) { // have transactionHash
					event = events.find(e=>e.transactionHash==transactionHash);
				} else {
					event = events.find(e=>e.blockHash==transaction.blockHash&&e.transactionIndex==transactionIndex);
				}
				return event ? { event: event as EventData, transaction }: null;
			} catch(err) {
				if (j)
					await utils.sleep(1e3);
				else
					console.error(err); //throw err; // 1s
			}
		}

		return null;
	}

	/**
	 * @func signTx(param) 对交易进行签名
	 */
	async signTx(opts?: TxOptions): Promise<IBuffer> {
		var _opts = Object.assign({
			from: this.defaultAccount,
			gas: this.gasLimit, // 该交易的执行时使用gas的上限
			gasLimit: this.gasLimit, // 使用gas上限
			gasPrice: this.gasPrice + utils.random(0, 1000), // gasprice就是起到一个汇率的作用
			value: '0x00',
			chainId: await this._getChainId(),
		}, opts);

		console.log('signTx, TxOptions =', opts);

		var signatureData = await crypto_tx.signTx(new TxSigner(this, _opts.from), _opts);

		return signatureData.signTx;
	}

	/**
	 * @func sendSignTransaction(param) 对交易进行签名并发送
	 */
	sendTransaction(opts?: TxOptions): Promise<TransactionReceipt> {
		var self = this;
		return new Promise(async function(resolve, reject) {
			try {
				var serializedTx = await self.signTx(opts); // sign Transaction data
			} catch(err) {
				reject(err);
				return;
			}
			try {
				resolve(await self.sendSignedTransaction(serializedTx, opts));
			} catch(err) {
				reject(err);
			}
		});
	}

	/**
	 * @func sendSignTransaction(serializedTx) 发送签名后的交易
	 */
	sendSignedTransaction(serializedTx: IBuffer, opts: STOptions = {}): Promise<TransactionReceipt> {
		var self = this;
		var raw = this.raw;
		var TIMEOUT_ERRNO = errno.ERR_REQUEST_TIMEOUT[0];

		return new Promise(async function(resolve, reject) {

			try {
				var blockNumber = await self.getBlockNumber();
			} catch(err) {
				reject(err);
				return;
			}

			opts = opts || {};

			var timeout = (Number(opts.timeout) || SAFE_TRANSACTION_MAX_TIMEOUT) + Date.now();
			var block_range = Number(opts.blockRange) || TRANSACTION_MAX_BLOCK_RANGE;
			var limit_block = blockNumber + block_range;
			var completed = false
			var is_check = false;
			var transactionHash = '';

			function complete(err?: Error, receipt?: TransactionReceipt) {
				if (!completed) {
					completed = true;
					console.log('send signed Transaction complete', id, err, receipt);
					err ? reject(err): resolve(receipt as TransactionReceipt);
				}
			}

			async function check_receipt(hash: string) {
				utils.assert(hash);
				
				if (is_check) return;
				is_check = true;
				transactionHash = hash;

				do {
					await utils.sleep(self.TRANSACTION_CHECK_TIME);
					if (!completed) {
						var receipt;
						try {
							receipt = await raw.eth.getTransactionReceipt(transactionHash);
						} catch(err) {
							if (err.code != TIMEOUT_ERRNO) { // timeout
								console.error(err);
							} else {
								console.warn(err);
							}
						}
						if (receipt && receipt.blockHash) {
							complete(undefined, receipt);
							break;
						} else if (timeout < Date.now()) {
							complete(Error.new(errno.ERR_REQUEST_TIMEOUT));
							break;
						} else {
							var blockNumber = 0;
							try {
								blockNumber = await self.getBlockNumber();
							} catch(err) {
								console.error(err);
							}
							if (blockNumber && blockNumber > limit_block) {
								complete(Error.new(errno.ERR_ETH_TRANSACTION_FAIL));
								break;
							}
						}
					}
				} while(!completed);
			}

			// 
			// send signed Transaction
			var id = utils.getId();
			console.log('send signed Transaction', id);
			// event: transactionHash,receipt,confirmation
			(raw.eth.sendSignedTransaction('0x' + serializedTx.toString('hex')) as any)
			.on('transactionHash', (e: string)=>check_receipt(e).catch(console.error))
			.then((e:TransactionReceipt)=>check_receipt(e.transactionHash).catch(console.error))
			.catch(async (e: Error)=>{
				if (!completed) {
					if (transactionHash) {
						try {
							var receipt = await raw.eth.getTransactionReceipt(transactionHash);
							if (receipt && receipt.blockHash) {
								complete(undefined, receipt);
							}
						} catch(err) {
							if (err.code != TIMEOUT_ERRNO) {
								console.error(err);
							} else {
								console.warn(err);
							}
						}
					} else if (e.code != TIMEOUT_ERRNO) {
						complete(e);
					}
				}
			});

		});
	}

	/**
	 * @func sign message long bytes32
	 */
	abstract sign(message: IBuffer, account?: string): Promise<Signature> | Signature;

	// Rewrite by method

	async getBlockNumber() {
		return await utils.timeout(this.raw.eth.getBlockNumber(), 1e4);
	}

	async getNonce(account = '') {
		account = account || this.defaultAccount;
		return await this.raw.eth.getTransactionCount(account, 'latest');
	}
}

export interface EnqueueExecArg {
	from: string;
	nonce: number;
}

export interface EnqueueOptions {
	from?: string;
	retry?: number;
	timeout?: number;
}

interface transaction_queue_context { 
	retry: number;
	options: EnqueueOptions;
	dequeue: (arg: EnqueueOptions)=>Promise<any>
}

interface queue {
	list: List<transaction_queue_context>; running: boolean;
}

export class TransactionQueue {

	private _host: IWeb3Z;
	private _tx_queues: Dict<queue> = {};

	constructor(web3: IWeb3Z) {
		this._host = web3;
	}

	get host() {
		return this._host;
	}

	async beforeDequeue() {
	}

	private async _dequeue(queue: queue) {
		var first = queue.list.first;
		if (!first) {
			queue.running = false;
			return;
		}
		try {
			var ctx = first.value as transaction_queue_context;
			var {from} = ctx.options;
			await this.beforeDequeue();
			var nonce = await this._host.getNonce(from);
			var ctx = queue.list.shift() as transaction_queue_context;
			var args = { from, nonce/*, ctx*/ } as EnqueueExecArg;
			await ctx.dequeue(args);
		} catch (err) {
			console.error(err);
			await utils.sleep(1e3); // sleep 1s
		}
		this._dequeue(queue);
	}

	/**
	 * @func enqueue(exec, options) 排队交易
	 */
	enqueue<R>(exec: (arg: EnqueueExecArg)=>Promise<R>, opts?: EnqueueOptions): Promise<R> {

		var options: EnqueueOptions = { from: '', retry: 0, timeout: 0, ...opts };
		var account = options.from = options.from || this._host.defaultAccount;
		var retry = options.retry = Number(options.retry) || 0;
		var timeout = options.timeout = Number(options.timeout) || 0;

		var queue = this._tx_queues[account];
		var now = Date.now();

		if (!queue) {
			this._tx_queues[account] = queue = { list: new List(), running: false };
		}

		return new Promise((resolve, reject)=>{
			var tid = 0;
			var setTimeout = (time: number)=>{
				if (time) {
					now = Date.now();
					tid = (function() {
						queue.list.del(item);
						reject(Error.new(errno.ERR_TRANSACTION_TIMEOUT));
					}).setTimeout(time);
				}
			};

			var ctx = {
				retry, options,
				dequeue: async (arg: EnqueueExecArg)=>{
					if (tid)
						clearTimeout(tid);
					try {
						resolve(await exec(arg));
					} catch(err) {
						if (ctx.retry--) {
							if (timeout) {
								timeout = timeout - Date.now() + now;
								if (timeout <= 0) { // timeout
									return reject(err);
								} else {
									setTimeout(timeout);
								}
							}
							console.error(err);
							item = queue.list.push(ctx); // retry back
						} else {
							reject(err);
						}
					}
				},
			} as transaction_queue_context;

			setTimeout(timeout);

			console.log('web3.enqueue', opts);

			var item = queue.list.push(ctx);
			if (!queue.running) {
				queue.running = true;
				this._dequeue(queue);
			}
		});
	}

}