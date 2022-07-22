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
import * as base from './base';
import { Contract as __Contract, Options as ContractOptions, EventData } from 'web3-eth-contract';
import {Transaction,TransactionReceipt } from 'web3-core';
import { Eth } from 'web3-eth';
import {AbiItem} from 'web3-utils';
import { MultipleProvider, Provider } from './provider';
import {Signature} from 'crypto-tx/sign';

export * from './base';
export * from './provider';

const requestManager = require('web3-core-requestmanager');
const crypto_tx = require('crypto-tx');

class ContractBase extends (require('web3-eth-contract') as typeof __Contract) {};

// type FindEventResult = base.FindEventResult;
type TxOptions = base.TxOptions;
type SendCallback = base.SendCallback;
type TransactionPromise = base.TransactionPromise;
type SerializedTx = base.SerializedTx;

class TxSigner {
	private _account: string;
	private _host: IWeb3;
	constructor(host: IWeb3, account: string) {
		this._host = host;
		this._account = '0x' + crypto_tx.toChecksumAddress(buffer.from(account.slice(2), 'hex'));
	}
	async sign(message: IBuffer) {
		if (!this._host.sign)
			throw Error.new(errno.ERR_IWEB3_SIGN_NOT_IMPL);
		var signature = await this._host.sign(buffer.from(message), this._account);
		return {
			signature: Buffer.from(signature.signature),
			recovery: signature.recovery,
		};
	}
}

function _throwTxCallError(err: Error, defaultErrno?: ErrnoCode) {
	if (err.message) {
		var msg = err.message.toLowerCase();
		if (msg.indexOf('insufficient funds') != -1) {
			err.errno = errno.ERR_INSUFFICIENT_FUNDS_FOR_TX[0];
		} else if (msg.indexOf('execution reverted') != -1) {
			err.errno = errno.ERR_EXECUTION_REVERTED[0];
		} else if (msg.indexOf('gas required exceeds allowance') != -1) { // gas required exceeds allowance (8000000)
			err.errno = errno.ERR_GAS_REQUIRED_LIMIT[0];
		} else if (!err.httpErr && defaultErrno) { //
			err.errno = defaultErrno[0];
		}
	}
	throw err;
}

async function setTx(self: IWeb3, tx: TxOptions, estimateGas?: (tx: TxOptions)=>Promise<number>) {
	estimateGas = estimateGas || ((tx: TxOptions)=>self.eth.estimateGas(tx));
	tx.from = tx.from || await self.defaultAccount();
	tx.nonce = tx.nonce || await self.eth.getTransactionCount(tx.from);
	tx.chainId = tx.chainId || await self.getChainId() || 0;
	tx.value = tx.value || '0x0';
	tx.data = tx.data || '0x';

	if (!tx.gas) {
		try {
			tx.gas = await estimateGas({
				from: tx.from,
				to: tx.to || '',
				value: tx.value,
				data: tx.data,
				gasPrice: 0,
				nonce: '0x' + tx.nonce.toString(16),
			} as any);
		} catch(err: any) {
			_throwTxCallError(err, errno.ERR_TRANSACTION_SEND_FAIL);
			return;
		}
	}

	if (!tx.gasLimit) // 程序运行时步数限制 default
		tx.gasLimit = parseInt(String(tx.gas * 1.2)); // suggested gas limit

	if (!tx.gasPrice) // 程序运行单步的wei数量wei default
		tx.gasPrice = await self.gasPrice() || base.DEFAULT_GAS_PRICE;

	if (self.gasPriceLimit) {
		tx.gasPrice = Math.min(self.gasPriceLimit, tx.gasPrice);
	}

	return {
		from: tx.from,
		to: tx.to || '',
		nonce: tx.nonce,
		chainId: tx.chainId,
		value: tx.value,
		data: tx.data,
		gas: tx.gas,
		gasLimit: tx.gasLimit,
		gasPrice: tx.gasPrice,
	};
}

export interface IWeb3 {
	readonly raw: base.Web3Raw;
	readonly eth: Eth;
	readonly gasPriceLimit: number;
	gasPrice(): Promise<number>;
	getChainId(): Promise<number>;
	defaultAccount(): Promise<string>;
	createContract(address: string, abi: AbiItem[]): Contract;
	sendTransaction(tx: TxOptions, cb?: SendCallback): TransactionPromise;
	sendSignTransaction(tx: TxOptions, cb?: SendCallback): TransactionPromise;
	sendSignedTransaction(serializedTx: IBuffer, opts?: TxOptions, cb?: SendCallback): TransactionPromise;
	getBlockNumber(): Promise<number>;
	getNonce(account?: string): Promise<number>;
	sign?(message: IBuffer, account?: string): Promise<Signature> | Signature;
	signTx(opts?: TxOptions): Promise<SerializedTx>;
}

export interface Contract extends ContractBase {
	readonly methods: {
		[method: string]: base.ContractMethod;
	};
	findEvent(event: string, transactionHash: string, blockNumber?: number): Promise<base.FindEventResult | null>;
}

export class Contract extends ContractBase {
	private _host: IWeb3;
	private __requestManager: any;

	constructor(host: IWeb3, jsonInterface: AbiItem[], address: string, options?: ContractOptions) {
		super(jsonInterface, address, options);
		this._host = host;
		this._Init(jsonInterface, address);
		(this as any).setProvider(host.eth);
	}

	private set _requestManager(v:any) {
		this.__requestManager = v;
	}
	
	private get _requestManager() {
		return this._host ? (this._host.raw as any)._requestManager: this.__requestManager;
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

		async function signTx(method: base.ContractSendMethod, opts?: TxOptions) {
			var _opts = Object.assign(opts || {}, {
				to: address,
				data: method.encodeABI(),
			});
			var ib = await self._host.signTx(_opts);
			return ib;
		}

		// TODO extend method signedTransaction() and sendSignedTransaction()
		jsonInterface.forEach(function({ name, type }) {
			if (name && type == 'function') {
				var { methods } = self;
				var raw = methods[name];

				methods[name] = (...args: any[])=>{
					var method = raw.call(methods, ...args) as base.ContractSendMethod;
					var call = method.call;
					method.signTx = e=>signTx(method, e);
					method.post = async (e, cb)=>{
						var opts = e || {};
						var tx = await signTx(method, opts);
						return await self._host.sendSignedTransaction(tx.data, opts, cb);
					};

					method.sendRaw = async (e,cb)=>{
						var opts = e || {};
						await setTx(self._host, opts, (tx)=>method.estimateGas(tx));
						return await self._host.sendTransaction(opts, cb);
					};

					method.call = async function(opts?: any, ...args: any[]) {
						var {from, gasPrice, gas} = opts || {};
						try {
							return await call.call(this, {from, gasPrice, gas}, ...args);
						} catch(err: any) {
							_throwTxCallError(err, errno.ERR_SOLIDITY_EXEC_ERROR);
						}
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

export class Web3 implements IWeb3 {
	private _raw?: base.Web3Raw;
	private _provider?: MultipleProvider;
	private _watchInterval = 1e4; // 10s
	private _getChainId = 0;
	private _gasPriceTimeout = 0;
	private _gasPrice = 0;
	private _getBlockNumber = 0;
	private _getBlockNumberTimeout = 0;
	private _gasPriceLimit = 0;

	get gasPriceLimit() {
		return this._gasPriceLimit;
	}

	set gasPriceLimit(val: number) {
		this._gasPriceLimit = val;
	}

	get watchInterval() {
		return this._watchInterval;
	}

	set watchInterval(val: number) {
		this._watchInterval = Math.max(Number(val) || 2e3, 2e3);
	}

	TRANSACTION_CHECK_TIME = base.TRANSACTION_CHECK_TIME;

	defaultProvider(): Provider | Provider[] {
		return 'http://127.0.0.1:8545';
	}

	get provider() {
		if (!this._provider) {
			this.setProvider(this.defaultProvider());
		}
		return this._provider as MultipleProvider;
	}

	setProvider(provider: Provider | Provider[]) {
		this._provider = Array.isArray(provider) || typeof provider == 'string' ?
			new MultipleProvider(provider): provider as MultipleProvider;
		if (this._raw) {
			this._raw.setProvider(this._provider as any);
		}
	}

	get raw() {
		if (!this._raw) {
			this._raw = new base.Web3Raw( this.provider as any );
			(this._raw.eth as any).Contract = {};
		}
		return this._raw as base.Web3Raw;
	}

	async defaultAccount() {
		return this.raw.defaultAccount || (await this.eth.getAccounts())[0] || '';
	}

	async getChainId() {
		if (!this._getChainId) {
			this._getChainId = Number(await utils.timeout(this.eth.getChainId(), 1e4)) || 0;
		}
		return this._getChainId;
	}

	async gasPrice() {
		if (!this._gasPrice || this._gasPriceTimeout < Date.now()) {
			this._gasPrice = Number(await utils.timeout(this.eth.getGasPrice(), 1e4)) || 0;
			this._gasPriceTimeout = Date.now() + 6e4; // 60s
		}
		return this._gasPrice;
	}

	async getBlockNumber() {
		if (!this._getBlockNumber || this._getBlockNumberTimeout < Date.now()) {
			this._getBlockNumber = Number(await utils.timeout(this.eth.getBlockNumber(), 1e4)) || 0;
			this._getBlockNumberTimeout = Date.now() + 1e4; // 10s
		}
		return this._getBlockNumber;
	}

	async getNonce(account?: string): Promise<number> {
		var nonce = Number(await utils.timeout(this.eth.getTransactionCount(account || await this.defaultAccount(), 'latest'), 1e4));
		utils.assert(!isNaN(nonce), 'Web3#getNonce asset, nonce >= 0');
		return nonce;
	}

	async getBalance(address: string) {
		var balance = Number(await this.eth.getBalance(address));
		utils.assert(!isNaN(balance), 'Web3#getBalance asset, balance >= 0');
		return balance;
	}

	get eth() {
		return this.raw.eth;
	}

	get utils() {
		return this.raw.utils;
	}

	get version() {
		return this.raw.version;
	}

	private _watchList: Map<string, {
		id: number;
		opts: TxOptions;
		resolve: any; reject: any;
		blockRange: number;
		blockNumber: number;
		timeout: number;
		noneConfirm: number;
	}> = new Map();

	private _watching = false;

	private async _checkTransaction(txid: string, opts?: TxOptions) {
		return utils.promise<any>(async (resolve, reject)=>{
			utils.assert(txid, 'Bad argument. txid cannot empty');
			opts = opts || {};
			var blockNumber = 0;
			try {
				blockNumber = await this.getBlockNumber();
			} catch(err) {}
			var timeout = (Number(opts.timeout) || base.TRANSACTION_TIMEOUT) + Date.now();
			var blockRange = Number(opts.blockRange) || base.TRANSACTION_BLOCK_RANGE_LIMIT;
			var id = utils.getId();
			console.log('send signed Transaction', id, txid);
			this._watchList.set(txid, {id, opts: opts || {}, resolve, reject, timeout, blockNumber, blockRange, noneConfirm: 0});
			this._watchTx();
		});
	}

	private async _watchTx() {
		if (this._watching) return;
		this._watching = true;

		var self = this;
		var time = Date.now();

		function error(txid: string, id: number, err: Error) {
			console.warn('send signed Transaction fail', id, txid);
			self._watchList.delete(txid);
			tx.reject(err);
		}

		for (var [txid,tx] of this._watchList) {
			try {
				// var receipt = await utils.timeout(this.checkTransaction(txid), 1e4);
				var receipt = await utils.timeout(self.eth.getTransactionReceipt(txid), 1e4);

				if (receipt) {
					if (receipt.status) {
						console.log('send signed Transaction complete', tx.id, txid);
						this._watchList.delete(txid);
						tx.resolve(receipt);
					} else {
						error( txid, tx.id, Error.new(errno.ERR_TRANSACTION_STATUS_FAIL).ext({ receipt }) );
					}
				}

				else if (tx.timeout < Date.now()) { // check timeout
					error( txid, tx.id, Error.new(errno.ERR_TRANSACTION_TIMEOUT) );
				}
				else {

					// check block range
					var blockNumber = await this.getBlockNumber();
					if (blockNumber) {
						if (tx.blockNumber) {
							var limit_block = tx.blockNumber + tx.blockRange;
							if (blockNumber > limit_block) {
								error( txid, tx.id, Error.new(errno.ERR_TRANSACTION_BLOCK_RANGE_LIMIT) ); continue;
							}
						} else {
							tx.blockNumber = blockNumber;
						}
					}

					var opts = tx.opts;

					// check nonce
					if (opts.from && opts.nonce) {
						var nonce = await self.getNonce(opts.from);
						if (nonce > opts.nonce) { //
							if (tx.noneConfirm) {
								if (blockNumber > tx.noneConfirm + 32)
									error( txid, tx.id, Error.new(errno.ERR_TRANSACTION_INVALID) );
							} else {
								tx.noneConfirm = blockNumber;
							}
						}
					}
				}

			} catch(err) {
			}
		}

		this._watching = false;

		if (this._watchList.size) {
			setTimeout(()=>this._watchTx(), Math.max(0, this._watchInterval - Date.now() + time));
		}
	}

	async checkTransaction(txid: string): Promise<TransactionReceipt | undefined> {
		var self = this;
		// send signed Transaction
		// event: transactionHash,receipt,confirmation

		var receipt;
		try {
			receipt = await self.eth.getTransactionReceipt(txid);
		} catch(err: any) {
			console.warn(err);
		}
		if (receipt && receipt.blockHash) {
			// return complete(undefined, receipt);
			return receipt;
		}
	}

	/**
	 * @func request() rpc
	*/
	request(method: string, params?: any[]) {
		return this.provider.request({ method, params });
	}

	createContract(contractAddress: string, abi: AbiItem[]): Contract {
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
		opts = opts || {};

		var opts_ = await setTx(this, opts || {});

		console.log('signTx, TxOptions =', opts);

		var tx = await crypto_tx.signTx(new TxSigner(this, opts.from as string), opts_);

		return {
			data: buffer.from(tx.serializedTx),
			hash: buffer.from(tx.hash),
		}
	}

	async sendRawTransaction(tx: IBuffer): Promise<string> {
		try {
			var txid = await this.request('eth_sendRawTransaction', ['0x' + tx.toString('hex')]);
		} catch(err: any) {
			_throwTxCallError(err);
		}
		utils.assert(txid, errno.ERR_SEND_RAW_TRANSACTION_FAIL);
		return txid;
	}

	/**
	 * @func sendTransaction(tx) 发送交易数据(不签名)
	 */
	async sendTransaction(tx: TxOptions, cb?: SendCallback): TransactionPromise {
		var tx_ = await setTx(this, tx);
		try {
			var txid = await this.request('eth_sendTransaction', [tx_]);
		} catch(err: any) {
			_throwTxCallError(err);
		}
		utils.assert(txid, errno.ERR_SEND_RAW_TRANSACTION_FAIL);
		if (cb)
			await cb(txid, tx);
		return this._checkTransaction(txid, tx);
	}

	/**
	 * @func sendTransaction(tx) 签名交易数据并发送
	 */
	async sendSignTransaction(opts: TxOptions, cb?: SendCallback): TransactionPromise {
		var tx = await this.signTx(opts);
		return await this.sendSignedTransaction(tx.data, opts, cb);
	}

	/**
	 * @func sendSignedTransaction(serializedTx) 发送签名后的交易数据
	 */
	async sendSignedTransaction(serializedTx: IBuffer, opts?: TxOptions, cb?: SendCallback) {
		var txid = await this.sendRawTransaction(serializedTx);
		if (cb)
			await cb(txid, opts || {});
		return this._checkTransaction(txid, opts);
	}

}