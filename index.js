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

var utils = require('nxkit');
var errno = require('./errno');
var Web3Class = require('web3');
var { Notification, List } = require('nxkit/event');
var _fix_web3 = require('./_fix_web3');

var SAFE_TRANSACTION_MAX_TIMEOUT = 300 * 1e3;  // 180秒
var TRANSACTION_MAX_BLOCK_RANGE = 32;
var TRANSACTION_CHECK_TIME = 3e4; // 3秒
var DEFAULT_GAS_LIMIT = 1e8;
var DEFAULT_GAS_PRICE = 1e5;

/**
 * @func web3Instance()
 */
function web3Instance(self) {
	if (!self.m_web3) {
		var url = self.m_url; // utils.config.ethereumPosNode;
		var { HttpProvider, WebsocketProvider } = Web3Class.providers;
		var provider;
		if (/^https?:/.test(url)) {
			provider = new HttpProvider(url, { timeout: SAFE_TRANSACTION_MAX_TIMEOUT });
		} else if (/^wss?:/.test(url)) {
			provider = new WebsocketProvider(url, { timeout: SAFE_TRANSACTION_MAX_TIMEOUT });
		} else {
			throw Error(`Can't create 'Web3 provider`);
		}
		self.m_web3 = new Web3Class(provider);
		self.m_web3.eth.defaultAccount = self.defaultAccount;
	}
	return self.m_web3;
}

/**
 * @func createContract()
 */
function createContract(self, address, abi, name = '') {
	var account = self.defaultAccount;
	var web3 = web3Instance(self);
	var contract = new web3.eth.Contract(abi, address, { 
		from: account, gas: self.gasLimit, gasLimit: self.gasLimit,
	});

	/**
	 * @func signTx(param) 对交易进行签名
	 */
	async function signTx(tx, param) { //
		var data = tx.encodeABI();
		var gasLimit = self.gasLimit;
		var gasPrice = self.gasPrice + utils.random(0, 1000);

		var rawTx = Object.assign({
				from: account,
				gas: gasLimit,
				gasLimit: gasLimit,
				gasPrice: gasPrice, value: '0x00',
			},
			param, { to: address, data: data }
		);
		var signatureData = await self.sign(rawTx);
		return signatureData;
	}

	/**
	 * @func sendSignTransaction(param) 对交易进行签名并发送
	 */
	function Inl_sendSignTransaction(tx, param) {
		return new Promise(async function(resolve, reject) {
			try {
				var signatureData = await signTx(tx, param); // sign Transaction data
			} catch(err) {
				reject(err);
				return;
			}
			try {
				resolve(await self.sendSignTransaction(signatureData, param));
			} catch(err) {
				reject(err);
			}
		});
	}

	// TODO extend method signedTransaction() and sendSignedTransaction()
	abi.forEach(function({ name }) {
		var { methods } = contract;
		var func = methods[name];
		methods[name] = (...args)=>{
			var tx = func.call(methods, ...args);
			tx.sign = e=>signTx(tx, e);
			tx.sendSignTransaction = e=>Inl_sendSignTransaction(tx, e);
			return tx;
		};
	});
	// end

	if (name) {
		self.m_contract[name] = contract;
	}
	self.m_contract[address] = contract;

	return contract;
}

/**
 * @func dequeue()
 */
async function dequeue(self, queue) {
	var first = queue.list.first;
	if (!first) {
		queue.runing = 0;
		return;
	}
	try {
		var ctx = first.value;
		var {account} = ctx.options;
		await self.beforeSafeTransaction(ctx);
		self.trigger('SignTransaction', ctx);
		var web3 = web3Instance(self);
		var nonce = await self.getNonce(account);
		var args = { web3, account, nonce, ctx: queue.list.shift() };
		await args.ctx.dequeue(args);
	} catch (err) {
		console.error(err);
		await utils.sleep(1e3); // sleep 1s
	}
	dequeue(self, queue);
}

/**
 * @class SafeWeb3
 */
class SafeWeb3 extends Notification {

	constructor(url, defaultAccount = '', safe_web3 = null) {
		super();
		this.m_url = url || 'http://127.0.0.1:8545';
		this.m_prevSafeTransactionTime = {};
		this.m_default_account = defaultAccount || '';
		this.m_contract = {};
		this.m_gasLimit = DEFAULT_GAS_LIMIT;
		this.m_gasPrice = DEFAULT_GAS_PRICE;
		this.m_transaction_queues = safe_web3 ? safe_web3.m_transaction_queues: {};
	}

	get gasLimit() {
		return this.m_gasLimit;
	}

	set gasLimit(value) {
		this.m_gasLimit = Number(value) || DEFAULT_GAS_LIMIT;
	}

	get gasPrice() {
		return this.m_gasPrice;
	}

	set gasPrice(value) {
		this.m_gasPrice = Number(value) || DEFAULT_GAS_PRICE;
	}

	get core() {
		return web3Instance(this);
	}

	get defaultAccount() {
		return this.getDefaultAccount();
	}

	createContract(address, abi, name = '') {
		var r = this.m_contract[address] || this.m_contract[name];
		if (!r) {
			r = createContract(this, address, abi, name);
		}
		return r;
	}

	/**
	 * @func sendSignTransaction(param) 对交易进行签名并发送
	 */
	sendSignTransaction(signatureData, param = {}) {
		var self = this;
		var web3 = web3Instance(self);
		var TIMEOUT_ERRNO = errno.ERR_REQUEST_TIMEOUT[0];

		return new Promise(async function(resolve, reject) {

			try {
				var blockNumber = await self.getBlockNumber();
			} catch(err) {
				reject(err);
				return;
			}

			param = param || {};

			var timeout = (Number(param.timeout) || SAFE_TRANSACTION_MAX_TIMEOUT) + Date.now();
			var block_range = Number(param.blockRange) || TRANSACTION_MAX_BLOCK_RANGE;
			var limit_block = blockNumber + block_range;
			var completed = false
			var is_check = false;
			var transactionHash = '';

			function complete(err, receipt) {
				if (!completed) {
					completed = true;
					err ? reject(err): resolve(receipt);
				}
			}

			async function check_receipt(hash) {
				utils.assert(hash);

				if (is_check) return;
				is_check = true;
				transactionHash = hash;

				do {
					await utils.sleep(TRANSACTION_CHECK_TIME);
					if (!completed) {
						var receipt;
						try {
							receipt = await web3.eth.getTransactionReceipt(transactionHash);
						} catch(err) {
							if (err.code != TIMEOUT_ERRNO) { // timeout
								console.error(err);
							} else {
								console.warn(err);
							}
						}
						if (receipt && receipt.blockHash) {
							complete(null, receipt);
							break;
						} else if (timeout < Date.now()) {
							complete(Error.new(errno.ERR_REQUEST_TIMEOUT));
							break;
						} else {
							try {
								var blockNumber = await self.getBlockNumber();
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
			web3.eth.sendSignedTransaction(signatureData.hex)
			.on('transactionHash', e=>check_receipt(e).catch(console.error))
			.then(e=>check_receipt(e.transactionHash).catch(console.error))
			.catch(async e=>{
				if (!completed) {
					if (transactionHash) {
						try {
							var receipt = await web3.eth.getTransactionReceipt(transactionHash);
							if (receipt && receipt.blockHash) {
								complete(null, receipt);
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
	 * @func safeTransaction(exec) 开始安全交易
	 */
	safeTransaction(exec, options = {}) {

		var { account = '', retry = 0, timeout = 0 } = options;

		account = options.account = account || this.defaultAccount;
		retry = options.retry = Number(retry) || 0;
		timeout = options.timeout = Number(timeout) || 0;

		var queue = this.m_transaction_queues[account];
		var now = Date.now();

		if (!queue) {
			this.m_transaction_queues[account] = queue = { list: new List(), runing: 0 };
		}

		return new Promise((resolve, reject)=>{
			var tid = 0;
			var setTimeout = time=>{
				if (time) {
					now = Date.now();
					tid = (function() {
						queue.list.del(item);
						reject(Error.new(errno.ERR_TRANSACTION_TIMEOUT));
					}).setTimeout(time);
				}
			};

			var ctx = {
				retry,
				options,
				dequeue: async (...args)=>{
					if (tid)
						clearTimeout(tid);
					try {
						resolve(await exec(...args));
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
			};

			setTimeout(timeout);

			var item = queue.list.push(ctx);
			if (!queue.runing) {
				queue.runing = 1;
				dequeue(this, queue);
			}
		});
	}

	// Rewrite by method

	getDefaultAccount() {
		return this.m_default_account;
	}

	async getBlockNumber() {
		var web3 = web3Instance(this);
		var blockNumber = await Promise.race([web3.eth.getBlockNumber(), utils.sleep(1e4, -1)]);
		if (blockNumber == -1) {
			throw Error.new(errno.ERR_REQUEST_TIMEOUT);
		}
		return blockNumber;
	}

	async getNonce(account = '') {
		account = account || this.defaultAccount;
		var web3 = web3Instance(this);
		return await web3.eth.getTransactionCount(account, 'latest');
	}

	async sign(txData) {
		throw Error.new(errno.ERR_METHOD_UNREALIZED);
	}

	async beforeSafeTransaction() {
	}

};

exports.SafeWeb3 = SafeWeb3;
