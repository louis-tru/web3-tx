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
import {IWeb3} from './index';
import {List} from 'somes/event';
import errno from './errno';

const TRANSACTION_QUEUE_TIMEOUT = 180 * 1e3;  // 180秒
const TRANSACTION_NONCE_TIMEOUT = 180 * 1e3;  // 180秒
const TRANSACTION_NONCE_TIMEOUT_MAX = 300 * 1e3;  // 300秒

export interface DeOptions {
	from: string;
	nonce: number;
	gasPrice: number;
	nonceTimeout: number;
}

export interface Options {
	from?: string;
	retry?: number;
	queueTimeout?: number;
	nonceTimeout?: number;
}

interface queue_context {
	retry: number;
	options: Options;
	queueTimeout: number;
	timeout_reject: ()=>void;
	dequeue: (nonce: DeOptions | null)=>Promise<any>
}

interface Queue { list: List<queue_context>; running: boolean; }


export class TransactionQueue {

	private _host: IWeb3;
	private _tx_queues: Dict<Queue> = {};
	private _tx_nonceObjs: Dict<Dict<DeOptions>> = {};

	constructor(web3: IWeb3) {
		this._host = web3;
	}

	get host() {
		return this._host;
	}

	async beforeDequeue() {
	}

	private chaekTimeout_(queue: Queue) {
		var now = Date.now();
		var item = queue.list.first;
		while (item) {
			var next = item.next;
			var timeout = item.value.queueTimeout;
			if (timeout && now > timeout) { // timeout
				item.value.timeout_reject();
				queue.list.del(item);
			}
			item = next;
		}
	}

	private async _dequeue(queue: Queue) {
		this.chaekTimeout_(queue);
		var first = queue.list.first;
		if (first) {
			try {
				var ctx = first.value;
				await this.beforeDequeue();
				var nonce = await this.getNonce_(ctx.options.from, ctx.options.nonceTimeout);
				queue.list.shift();
				await ctx.dequeue(nonce);
			} catch (err) {
				console.warn(err);
				await utils.sleep(1e3); // sleep 1s
			}
			this._dequeue(queue);
		} else {
			queue.running = false;
		}
	}

	/**
	 * @func push(exec, options) 排队交易
	 */
	async push<R>(exec: (arg: DeOptions)=>Promise<R>, opts?: Options): Promise<R> {

		var options = {from: '', retry: 0, queueTimeout: TRANSACTION_QUEUE_TIMEOUT, ...opts};
		var from = (options.from = options.from || await this._host.defaultAccount()).toLowerCase();
		var retry = options.retry = Number(options.retry) || 0;
		var queueTimeout = options.queueTimeout = Number(options.queueTimeout) || 0;
		var queue = this._tx_queues[from];
		if (!queue) {
			this._tx_queues[from] = queue = { list: new List(), running: false };
		}

		return await new Promise((resolve, reject)=>{
			var ctx = {
				retry,
				options,
				queueTimeout: queueTimeout ? queueTimeout + Date.now(): 0,
				timeout_reject: ()=>{
					reject(Error.new(errno.ERR_TRANSACTION_TIMEOUT));
				},
				dequeue: async (opts: DeOptions | null)=>{
					try {
						if (opts) {
							resolve(await exec(opts));
						} else { // retry, wait nonce
							queue.list.unshift(ctx); // retry queue
							// if (queue.list.length == 1)
							await utils.sleep(5e3); // sleep 5s
						}
					} catch(err: any) {
						if ( err.errno == errno.ERR_TRANSACTION_STATUS_FAIL[0] // fail
							|| err.errno == errno.ERR_TRANSACTION_INVALID[0]    // invalid
							|| err.errno == errno.ERR_SOLIDITY_EXEC_ERROR[0] // exec 
							|| err.errno == errno.ERR_TRANSACTION_BLOCK_RANGE_LIMIT[0] // block limit
							|| err.errno == errno.ERR_REQUEST_TIMEOUT[0] // timeout
						) {
							if (ctx.retry--) {
								console.warn(err);
								queue.list.push(ctx); // retry back
							} else {
								reject(err);
							}
						} else { // force retry
							opts = opts as DeOptions;
							console.warn('TransactionQueue#push#dequeue ************* web3 tx fail *************', opts, err);
							queue.list.unshift(ctx); // retry queue
							if (queue.list.length == 1)
								await utils.sleep(5e3); // sleep 5s
						}
					}
				},
			} as queue_context;

			queue.list.push(ctx);
			// console.log('web3.enqueue', opts);

			if (!queue.running) {
				queue.running = true;
				this._dequeue(queue);
			}
		});
	}

	private async getNonce_(account?: string, _timeout?: number, greedy?: boolean): Promise<DeOptions | null> {
		var from = account || await this._host.defaultAccount();
		utils.assert(from, 'getNonce error account empty');

		var now = Date.now();
		var nonces = (this._tx_nonceObjs[from] || (this._tx_nonceObjs[from] = {}));
		var nonce = await this._host.getNonce(account);
		var nonceTimeout = Math.min(TRANSACTION_NONCE_TIMEOUT_MAX, _timeout || TRANSACTION_NONCE_TIMEOUT) + now;
		var gasPrice = await this._host.gasPrice();

		for (var i = nonce, o: DeOptions; (o = nonces[i]); i++) {
			if (now > o.nonceTimeout) { // pending and is timeout
				o.nonceTimeout = nonceTimeout;
				o.gasPrice = Math.max(gasPrice, o.gasPrice + 10);
				return o;
			}
		}

		if (greedy || nonce == i) {
			return o = nonces[i] = { from, nonce: i, nonceTimeout, gasPrice };
		}

		return null;
	}

	/**
	 * @func getNonce() 获取排队nonce
	 */
	async getNonce(account?: string, timeout?: number): Promise<DeOptions> {
		var nonce = await this.getNonce_(account, timeout, true);
		return nonce as DeOptions;
	}

}