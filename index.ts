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
import errno from './errno';
import { List } from 'somes/event';
import './_fix_contract';
import './_fix_web3';
import Web3 from 'web3';
import {Contract as ContractRaw, Options as ContractOptions, 
	EventData, CallOptions as MethodOptions, ContractSendMethod as ContractSendMethodRaw } from 'web3-eth-contract';
import {Transaction,TransactionReceipt} from 'web3-core';
import {BlockTransactionString as Block} from 'web3-eth';

export { Web3, ContractOptions, EventData, Transaction, TransactionReceipt, Block, MethodOptions };

const __Web3__ = require('web3');

(exports as any).Web3 = __Web3__;

const SAFE_TRANSACTION_MAX_TIMEOUT = 300 * 1e3;  // 180秒
const TRANSACTION_MAX_BLOCK_RANGE = 32;
const TRANSACTION_CHECK_TIME = 3e4; // 30秒
const DEFAULT_GAS_LIMIT = 1e8;
const DEFAULT_GAS_PRICE = 1e5;

// export interface Transaction {
// 	hash: string;// 32 Bytes - String: Hash of the transaction.
// 	nonce: number;// - Number: The number of transactions made by the sender prior to this one.
// 	blockHash: string;// 32 Bytes - String: Hash of the block where this transaction was in. null when its pending.
// 	blockNumber: number;// - Number: Block number where this transaction was in. null when its pending.
// 	transactionIndex: number;// - Number: Integer of the transactions index position in the block. null when its pending.
// 	from: string;// - String: Address of the sender.
// 	to: string;// - String: Address of the receiver. null when its a contract creation transaction.
// 	value: string;// - String: Value transferred in wei.
// 	gasPrice: string;// - String: Gas price provided by the sender in wei.
// 	gas: number;// - Number: Gas provided by the sender.
// 	input: string;// - String: The data sent along with the transaction.
// }

// export interface TransactionReceipt {
// 	status: boolean; // Boolean: TRUE if the transaction was successful, FALSE, if the EVM reverted the transaction.
// 	blockHash: string; // 32 Bytes - String: Hash of the block where this transaction was in.
// 	blockNumber: number; // Number: Block number where this transaction was in.
// 	transactionHash: string; // 32 Bytes - String: Hash of the transaction.
// 	transactionIndex: number; // Number: Integer of the transactions index position in the block.
// 	from: string; // String: Address of the sender.
// 	to: string; // String: Address of the receiver. null when its a contract creation transaction.
// 	contractAddress: string; // String: The contract address created, if the transaction was a contract creation, otherwise null.
// 	cumulativeGasUsed: number; // Number: The total amount of gas used when this transaction was executed in the block.
// 	gasUsed: number; // Number: The amount of gas used by this specific transaction alone.
// 	logs: string[]; // Array: Array of log objects, which this transaction generated.
// }

// export interface EventData {
// 	event: string; // String: The event name.
// 	signature: string | null; // String|Null: The event signature, null if it’s an anonymous event.
// 	address: string; // String: Address this event originated from.
// 	returnValues: Dict; // Object: The return values coming from the event, e.g. {myVar: 1, myVar2: '0x234...'}.
// 	logIndex: number; // Number: Integer of the event index position in the block.
// 	transactionIndex: number; // Number: Integer of the transaction’s index position the event was created in.
// 	transactionHash: string; // 32 Bytes - String: Hash of the transaction this event was created in.
// 	blockHash: string; // 32 Bytes - String: Hash of the block this event was created in. null when it’s still pending.
// 	blockNumber: number; // Number: The block number this log was created in. null when still pending.
// 	raw: {
// 		data: string; // String: The data containing non-indexed log parameter.
// 		topics: string[]; // Array: An array with max 4 32 Byte topics, topic 1-3 contains indexed
// 	};
// }

// export interface Block {
// 	number: number; // - Number: The block number. null when its pending block.
// 	hash: string; // 32 Bytes - String: Hash of the block. null when its pending block.
// 	parentHash: string; // 32 Bytes - String: Hash of the parent block.
// 	nonce: number; // 8 Bytes - String: Hash of the generated proof-of-work. null when its pending block.
// 	sha3Uncles: string; // 32 Bytes - String: SHA3 of the uncles data in the block.
// 	logsBloom: string; // 256 Bytes - String: The bloom filter for the logs of the block. null when its pending block.
// 	transactionsRoot: string; // 32 Bytes - String: The root of the transaction trie of the block
// 	stateRoot: string; // 32 Bytes - String: The root of the final state trie of the block.
// 	miner: string; // - String: The address of the beneficiary to whom the mining rewards were given.
// 	difficulty: string; // - String: Integer of the difficulty for this block.
// 	totalDifficulty: string; // - String: Integer of the total difficulty of the chain until this block.
// 	extraData: string; // - String: The “extra data” field of this block.
// 	size: number; // - Number: Integer the size of this block in bytes.
// 	gasLimit: number; // - Number: The maximum gas allowed in this block.
// 	gasUsed: number; // - Number: The total used gas by all transactions in this block.
// 	timestamp: number; // - Number: The unix timestamp for when the block was collated.
// 	transactions: (string /*| Transaction*/)[]; // - Array: Array of transaction objects, or 32 Bytes transaction hashes depending on the returnTransactionObjects parameter.
// 	uncles: string[]; // - Array: Array of uncle hashes.
// }

// export interface ContractOptions {
// 	address: string; // - String: The address where the contract is deployed. See options.address.
// 	jsonInterface?: string[]; // - Array: The json interface of the contract. See options.jsonInterface.
// 	data?: string; // - String: The byte code of the contract. Used when the contract gets deployed.
// 	from?: string; // - String: The address transactions should be made from.
// 	gasPrice?: string; // - String: The gas price in wei to use for transactions.
// 	gas?: number; // - Number: The maximum gas provided for a transaction (gas limit).
// }

// export interface MethodOptions {
// 	from?: string; // - String (optional): The address the call “transaction” should be made from.
// 	gas?: number; // - Number (optional): The maximum gas provided for this call “transaction” (gas limit).
// 	value?: number|string|bigint;
// 	gasPrice?: string; // - String (optional): The gas price in wei to use for this call “transaction”.
// }

export interface FindEventResult {
	event: EventData;
	transaction: Transaction;
}

export interface SendSignTransactionOprions extends Dict {
	timeout?: number;
	blockRange?: number;
}

export type SSTOptions = SendSignTransactionOprions;

export interface SignOptions extends SSTOptions {
	nonce?: number;
	from?: string;
	to?: string;
	gas?: number;
	gasLimit?: number;
	gasPrice?: number;
	value?: string | Buffer;
	data?: any;
}

export interface ContractSendMethod extends ContractSendMethodRaw {
	sign(options?: SignOptions): Promise<SignatureData>;
	sendSignTransaction(options?: SignOptions): Promise<TransactionReceipt>;
}

export interface ContractMethod {
	<A extends any[]>(...args: A): ContractSendMethod;
}

export interface Contract extends ContractRaw {
	findEvent(event: string, blockNumber: number, transactionHash: string): Promise<FindEventResult | null>;
}

export interface SignatureData {
	rsvHex: {
		r: string;
		s: string;
		v: string;
	},
	hex: string;
}

export interface ABIDef {
	address: string;
	abi: any[];
}

export interface IWeb3Z {
	defaultAccount: string;
	createContract(address: string, abi: any[], name?: string): Contract;
	sendSignTransaction(signatureData: SignatureData, options?: SSTOptions): Promise<TransactionReceipt>;
	getBlockNumber(): Promise<number>;
	getNonce(account?: string): Promise<number>;
	sign(options: SignOptions): Promise<SignatureData> | SignatureData;
}

export abstract class Web3Z implements IWeb3Z {
	private _url: string;
	private _default_account: string;
	private _gasLimit = DEFAULT_GAS_LIMIT;
	private _gasPrice = DEFAULT_GAS_PRICE;
	private __web3__?: Web3;

	constructor(url: string, defaultAccount = '') {
		this._url = url || 'http://127.0.0.1:8545';
		this._default_account = defaultAccount || '';
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

	get defaultAccount() {
		return this._default_account;
	}

	set defaultAccount(account) {
		this._default_account = account;
		if (this.__)
			this.__.eth.defaultAccount = account;
	}

	get __() {
		if (!this.__web3__) {
			var url = this._url;
			var { HttpProvider, WebsocketProvider } = __Web3__.providers;
			var provider;
			if (/^https?:/.test(url)) {
				provider = new HttpProvider(url, { timeout: SAFE_TRANSACTION_MAX_TIMEOUT });
			} else if (/^wss?:/.test(url)) {
				provider = new WebsocketProvider(url, { timeout: SAFE_TRANSACTION_MAX_TIMEOUT });
			} else {
				throw Error(`Can't create 'Web3 provider`);
			}
			var __web3__ = new __Web3__(provider);
			__web3__.eth.defaultAccount = this.defaultAccount;
			this.__web3__ = __web3__;
		}
		return this.__web3__ as Web3;
	}

	createContract(address: string, abi: any[]) {
		var self = this;
		var account = self.defaultAccount;
		var contract = new self.__.eth.Contract(abi, address, { 
			from: account, 
			// TODO pos相夫本节点配置了这个"gas"参数所有协约get rpc请求均不能访问
			/*gas: self.gasLimit, gasLimit: self.gasLimit,*/
		}) as Contract;

		contract.findEvent = (event: string, blockNumber: number, hash: string)=>this._findEvent(contract, event, blockNumber, hash);

		/**
		 * @func signTx(param) 对交易进行签名
		 */
		async function signTx(ctx: ContractSendMethod, opts?: SignOptions): Promise<SignatureData> { //
			var data = ctx.encodeABI();
			var gasLimit = self.gasLimit;
			var gasPrice = self.gasPrice + utils.random(0, 1000);

			var rawTx = Object.assign({
					from: account,
					gas: gasLimit,
					gasLimit: gasLimit,
					gasPrice: gasPrice, value: '0x00',
				},
				opts, { to: address, data: data }
			);
			var signatureData = await self.sign(rawTx);
			return signatureData;
		}

		/**
		 * @func sendSignTransaction(param) 对交易进行签名并发送
		 */
		function Inl_sendSignTransaction(ctx: ContractSendMethod, opts?: SignOptions): Promise<TransactionReceipt> {
			return new Promise(async function(resolve, reject) {
				try {
					var signatureData = await signTx(ctx, opts); // sign Transaction data
				} catch(err) {
					reject(err);
					return;
				}
				try {
					resolve(await self.sendSignTransaction(signatureData, opts));
				} catch(err) {
					reject(err);
				}
			});
		}

		// TODO extend method signedTransaction() and sendSignedTransaction()
		abi.forEach(function({ name }) {
			var { methods } = contract;
			var raw = methods[name];
			methods[name] = (...args: any[])=>{
				var ctx = raw.call(methods, ...args) as ContractSendMethod;
				ctx.sign = e=>signTx(ctx, e);
				ctx.sendSignTransaction = e=>Inl_sendSignTransaction(ctx, e);
				return ctx;
			};
		});

		return contract as Contract;
	}

	private async _findEvent(contract: Contract, eventName: string, blockNumber: number, transactionHash: string): Promise<FindEventResult | null> {
		var j = 10;

		while (j--) { // 确保本块已同步
			var num = await this.__.eth.getBlockNumber();
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
				var block = await this.__.eth.getBlock(blockNumber);// as Transaction[];
				if (block) {
					var transactions = block.transactions as string[];
					var transactionIndex = transactions.indexOf(transactionHash);
					if (transactionIndex != -1) {
						if ( (tx = await this.__.eth.getTransactionFromBlock(blockNumber, transactionIndex)) )
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
	 * @func sendSignTransaction(param) 对交易进行签名并发送
	 */
	sendSignTransaction(signatureData: SignatureData, opts: SSTOptions = {}): Promise<TransactionReceipt> {
		var self = this;
		var __ = this.__;
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
					err ? reject(err): resolve(receipt);
				}
			}

			async function check_receipt(hash: string) {
				utils.assert(hash);
				
				if (is_check) return;
				is_check = true;
				transactionHash = hash;

				do {
					await utils.sleep(TRANSACTION_CHECK_TIME);
					if (!completed) {
						var receipt;
						try {
							receipt = await __.eth.getTransactionReceipt(transactionHash);
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

			// send signed Transaction
			// event: transactionHash,receipt,confirmation
			(__.eth.sendSignedTransaction(signatureData.hex) as any)
			.on('transactionHash', (e: string)=>check_receipt(e).catch(console.error))
			.then((e:TransactionReceipt)=>check_receipt(e.transactionHash).catch(console.error))
			.catch(async (e: Error)=>{
				if (!completed) {
					if (transactionHash) {
						try {
							var receipt = await __.eth.getTransactionReceipt(transactionHash);
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

	abstract sign(txData: SignOptions): Promise<SignatureData> | SignatureData;

	// Rewrite by method

	async getBlockNumber() {
		return await utils.timeout(this.__.eth.getBlockNumber(), 1e4);
	}

	async getNonce(account = '') {
		account = account || this.defaultAccount;
		return await this.__.eth.getTransactionCount(account, 'latest');
	}
}

export interface EnqueueExecArg {
	account: string;
	nonce: number;
}

export interface EnqueueOptions {
	account?: string;
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
			var {account} = ctx.options;
			await this.beforeDequeue();
			var nonce = await this._host.getNonce(account);
			var ctx = queue.list.shift() as transaction_queue_context;
			var args = { account, nonce/*, ctx*/ } as EnqueueExecArg;
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

		var options: EnqueueOptions = { account: '', retry: 0, timeout: 0, ...opts };
		var account = options.account = options.account || this._host.defaultAccount;
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

			var item = queue.list.push(ctx);
			if (!queue.running) {
				queue.running = true;
				this._dequeue(queue);
			}
		});
	}

}