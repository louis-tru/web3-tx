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
import { List } from 'somes/event';
import errno from './errno';

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
	push<R>(exec: (arg: EnqueueExecArg)=>Promise<R>, opts?: EnqueueOptions): Promise<R> {

		var options: EnqueueOptions = { from: '', retry: 0, timeout: 0, ...opts };
		var account = options.from = options.from || this._host.web3.defaultAccount || '';
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