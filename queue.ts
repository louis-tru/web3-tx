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
import {IWeb3Z} from './index';
import {List} from 'somes/event';
import errno from './errno';

const TRANSACTION_NONCE_TIMEOUT = 180 * 1e3;  // 180秒
const TRANSACTION_NONCE_TIMEOUT_MAX = 300 * 1e3;  // 300秒

export interface DeOptions {
	from: string;
	nonce: number;
	gasLimit: number;
}

interface Nonce extends DeOptions {
	timeout: number;
}

export interface Options {
	from?: string;
	retry?: number;
	timeout?: number;
}

interface queue_context {
	retry: number;
	options: Options;
	timeout: number;
	timeout_reject: ()=>void;
	dequeue: (nonce: Nonce | null)=>Promise<any>
}

interface Queue { list: List<queue_context>; running: boolean; }


export class TransactionQueue {

	private _host: IWeb3Z;
	private _tx_queues: Dict<Queue> = {};
	private _tx_nonceObjs: Dict<Dict<Nonce>> = {};

	constructor(web3: IWeb3Z) {
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
			if (now > item.value.timeout) { // timeout
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
				var nonce = await this.getNonce_(ctx.options.from);
				queue.list.shift();
				await ctx.dequeue(nonce);
			} catch (err) {
				console.error(err);
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
	push<R>(exec: (arg: DeOptions)=>Promise<R>, opts?: Options): Promise<R> {

		var options = {from: '', retry: 0, timeout: TRANSACTION_NONCE_TIMEOUT, ...opts};
		var from = options.from = options.from || this._host.web3.defaultAccount || '';
		var retry = options.retry = Number(options.retry) || 0;
		var timeout = options.timeout = Number(options.timeout) || 0;
		var queue = this._tx_queues[from];
		if (!queue) {
			this._tx_queues[from] = queue = { list: new List(), running: false };
		}

		return new Promise((resolve, reject)=>{
			var ctx = {
				retry,
				options,
				timeout: timeout ? timeout + Date.now(): Infinity,
				timeout_reject: ()=>{
					reject(Error.new(errno.ERR_TRANSACTION_TIMEOUT));
				},
				dequeue: async (nonce: Nonce | null)=>{
					try {
						if (nonce) {
							resolve(await exec(nonce));
						} else {
							queue.list.push(ctx);
							await utils.sleep(5e3); // sleep 5s
						}
					} catch(err) {
						if (ctx.retry--) {
							console.error(err);
							queue.list.push(ctx); // retry back
							return;
						} else {
							reject(err);
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

	private async getNonce_(account?: string, _timeout?: number, greedy?: boolean): Promise<Nonce | null> {
		var from = account || await this._host.getDefaultAccount();
		utils.assert(from, 'getNonce error account empty');

		var now = Date.now();
		var nonces = (this._tx_nonceObjs[from] || (this._tx_nonceObjs[from] = {}));
		var nonce = await this._host.getNonce(account);
		var timeout = Math.min(TRANSACTION_NONCE_TIMEOUT_MAX, _timeout || TRANSACTION_NONCE_TIMEOUT) + now;
		var gasLimit = this._host.gasLimit;

		for (var i = nonce, o: Nonce; (o = nonces[i]); i++) {
			if (o.timeout > now) { // pending and is timeout
				o.timeout = now;
				o.gasLimit++;
				return o;
			}
		}

		if (greedy || nonce == i) {
			nonces[i] = o = { from, nonce, timeout, gasLimit };
		} else {
			return null;
		}

		return o;
	}

	/**
	 * @func getNonce() 获取排队nonce
	 */
	async getNonce(account?: string, timeout?: number): Promise<Nonce> {
		var nonce = await this.getNonce_(account, timeout, true);
		return nonce as Nonce;
	}

}