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
import __Web3__ from 'web3';
import * as net from 'net';
import {Contract as ContractRaw, Options as ContractOptions, 
	EventData, CallOptions, SendOptions, ContractSendMethod as ContractSendMethodRaw } from 'web3-eth-contract';
import {Transaction,TransactionReceipt,provider,PromiEvent } from 'web3-core';
import {BlockTransactionString as Block} from 'web3-eth';

import './_fix_web3';

const Web3 = require('web3') as typeof __Web3__;

export { Web3, ContractOptions, EventData, Transaction, TransactionReceipt, Block, CallOptions, SendOptions };

const crypto_tx = require('crypto-tx');

const SAFE_TRANSACTION_MAX_TIMEOUT = 300 * 1e3;  // 300秒
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
	chainId?: number;
	from?: string;
	nonce?: number;
	to?: string;
	gasLimit?: number;
	gasPrice?: number;
	value?: string;
	data?: string;
}

export interface ContractSendMethod extends ContractSendMethodRaw {
	/**
	 * returns serializedTx
	 */
	signTx(options?: TxOptions): Promise<SerializedTx>;
	sendSignTransaction(options?: TxOptions): TransactionPromise;
	send2(opts: TxOptions): TransactionPromise;
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

export interface Signature {
	signature: IBuffer;
	recovery: number;
}

export interface SerializedTx {
	data: IBuffer;
	hash: IBuffer;
}

export interface IWeb3Z {
	readonly web3: __Web3__;
	readonly gasLimit: number;
	readonly gasPrice: number;
	getDefaultAccount(): Promise<string>;
	setDefaultAccount(account: string): void;
	createContract(address: string, abi: any[]): Contract;
	sendTransaction(tx: TxOptions, opts?: STOptions): Promise<TransactionReceipt>;
	sendSignTransaction(tx: TxOptions): Promise<TransactionReceipt>;
	sendSignedTransaction(serializedTx: IBuffer, opts?: STOptions): Promise<TransactionReceipt>;
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
		this._account = account;
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
	hash(cb: (hash: string)=>void): this;
}

class TransactionPromiseIMPL extends utils.PromiseNx<TransactionReceipt> implements TransactionPromise {
	private _hash?: (hash: string)=>void;
	hash(cb: (hash: string)=>void) {
		this._hash = cb;
		return this;
	}
	getHash() {
		return this._hash;
	}
	static proxy(exec: ()=>Promise<{promise:TransactionPromise}>) {
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

export class Web3Z implements IWeb3Z {
	private _gasLimit = DEFAULT_GAS_LIMIT;
	private _gasPrice = DEFAULT_GAS_PRICE;
	private _web3?: __Web3__;

	TRANSACTION_CHECK_TIME = TRANSACTION_CHECK_TIME;

	getProvider(): provider {
		return 'http://127.0.0.1:8545';
	}

	get web3() {
		if (!this._web3) {
			var provider = this.getProvider();
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
			this._web3 = new Web3(provider);
		}
		return this._web3 as __Web3__;
	}

	setDefaultAccount(account: string) {
		this.web3.defaultAccount = account;
		this.web3.eth.defaultAccount = account;
	}

	async getDefaultAccount() {
		return this.web3.defaultAccount || (await this.eth.getAccounts())[0] || '';
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

	get currentProvider() {
		return this.web3.currentProvider;
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

	createContract(contractAddress: string, abi: any[]) {
		var self = this;
		var account = self.web3.defaultAccount || '';
		var contract = new self.eth.Contract(abi, contractAddress, {
			from: account,
			// TODO pos相夫本节点配置了这个"gas"参数所有协约get rpc请求均不能访问
			/*gas: self.gasLimit, gasLimit: self.gasLimit,*/
		}) as Contract;

		// setProvider

		contract.findEvent = (event: string, blockNumber: number, hash: string)=>this._findEvent(contract, event, blockNumber, hash);

		async function signTx(method: ContractSendMethod, opts?: TxOptions) {
			var _opts = Object.assign({ from: account, value: '0x00' }, opts, {
				to: contractAddress,
				data: method.encodeABI(),
			});
			var ib = await self.signTx(_opts);
			return ib;
		}

		function sendSignTransaction(method: ContractSendMethod, opts?: TxOptions) {
			return TransactionPromiseIMPL.proxy(async ()=>{
				var tx = await signTx(method, opts);
				var promise = self.sendSignedTransaction(tx.data, opts);
				return {promise};
			});
		}

		function send2(method: ContractSendMethod, opts?: TxOptions) {
			return TransactionPromiseIMPL.proxy(async ()=>{
				var from = opts?.from || await self.getDefaultAccount();
				var opts_ = Object.assign(opts, {from}) as SendOptions;
				var promise1 = method.send(opts_) as unknown as PromiEvent<TransactionReceipt>
				var promise = self._sendTransactionCheck(promise1, opts_);
				return {promise};
			});
		}

		// TODO extend method signedTransaction() and sendSignedTransaction()
		abi.forEach(function({ name }) {
			var { methods } = contract;
			var raw = methods[name];
			methods[name] = (...args: any[])=>{
				var method = raw.call(methods, ...args) as ContractSendMethod;
				method.signTx = e=>signTx(method, e),
				method.sendSignTransaction = e=>sendSignTransaction(method, e);
				method.send2 = e=>send2(method, e);
				return method;
			};
		});

		return contract as Contract;
	}

	private async _findEvent(contract: Contract, eventName: string, blockNumber: number, transactionHash: string): Promise<FindEventResult | null> {
		var j = 10;

		while (j--) { // 确保本块已同步
			var num = await this.eth.getBlockNumber();
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
				var block = await this.eth.getBlock(blockNumber);// as Transaction[];
				if (block) {
					var transactions = block.transactions as string[];
					var transactionIndex = transactions.indexOf(transactionHash);
					if (transactionIndex != -1) {
						if ( (tx = await this.eth.getTransactionFromBlock(blockNumber, transactionIndex)) )
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
	 * @func sign message long bytes32
	 */
	sign?(message: IBuffer, account?: string): Promise<Signature> | Signature;

	/**
	 * @func signTx(param) 对交易进行签名
	 */
	async signTx(opts?: TxOptions): Promise<SerializedTx> {
		var _opts = Object.assign({
			from: this.web3.defaultAccount,
			// gas: this.gasLimit, // 该交易的执行时使用gas的上限
			gasLimit: this.gasLimit, // 该交易的执行时使用gas的上限
			gasPrice: this.gasPrice, // gasprice就是起到一个汇率的作用
			value: '0x00',
			chainId: await this.eth.getChainId(),
		}, opts);

		console.log('signTx, TxOptions =', opts);

		var tx = await crypto_tx.signTx(new TxSigner(this, _opts.from), _opts);

		return {
			data: buffer.from(tx.serializedTx),
			hash: buffer.from(tx.hash),
		}
	}

	/**
	 * @func _sendTransactionCheck()
	 * @private
	 */
	private _sendTransactionCheck(peceipt: PromiEvent<TransactionReceipt>, opts: STOptions = {}): TransactionPromise {
		var self = this;
		var eth = this.eth;
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
			var transactionHash = '';
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
					}
					console.log('send signed Transaction complete', id, err, receipt);
					err ? reject(Object.assign(Error.new(err), {receipt})): resolve(receipt as TransactionReceipt);
				}
			}

			async function check_receipt() {
				utils.assert(transactionHash, 'argument bad');
				if (is_check)
					return;
				is_check = true;

				while (!completed) {
					var receipt;
					try {
						receipt = await eth.getTransactionReceipt(transactionHash);
					} catch(err) {
						if (err.code != TIMEOUT_ERRNO) { // timeout
							console.error(err);
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
							console.error(err);
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
				transactionHash = hash;
				var cb = pp.getHash();
				if (cb)
					cb(hash);
			})
			.then(e=>{
				// console.log('_sendTransactionCheck . then', e);
				transactionHash = e.transactionHash;
				rawReceipt = e;
				check_receipt().catch(console.error);
			})
			.catch(async (e: Error)=>{
				if (!completed) {
					if (transactionHash) {
						try {
							var receipt = await eth.getTransactionReceipt(transactionHash);
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

	/**
	 * @func sendTransaction(tx) 签名交易数据并发送
	 */
	async sendSignTransaction(opts: TxOptions) {
		return TransactionPromiseIMPL.proxy(async ()=>{
			var tx = await this.signTx(opts);
			var promise = this.sendSignedTransaction(tx.data, opts);
			return {promise};
		});
	}

	/**
	 * @func sendTransaction(tx) 发送交易数据(不签名)
	 */
	sendTransaction(tx: TxOptions, opts?: STOptions) {
		return this._sendTransactionCheck(this.eth.sendTransaction(tx), opts);
	}

	/**
	 * @func sendSignedTransaction(serializedTx) 发送签名后的交易数据
	 */
	sendSignedTransaction(serializedTx: IBuffer, opts?: STOptions) {
		return this._sendTransactionCheck(this.eth.sendSignedTransaction('0x' + serializedTx.toString('hex')), opts);
	}

	// Rewrite by method

	async getBlockNumber() {
		return await utils.timeout(this.eth.getBlockNumber(), 1e4);
	}

	async getNonce(account?: string) {
		return await this.eth.getTransactionCount(account || await this.getDefaultAccount(), 'latest');
	}
}