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
import * as base from './base';
import errno from './errno';

export interface Options {
	from?: string;
	retry?: number;
	nonceTimeout?: number;
}

export interface DeOptions {
	from: string;
	nonce: number;
	gasPrice: number;
}

interface DeOptionsInl extends DeOptions {
	nonceTimeout: number;
}

interface QueueItem {
	retry: number;
	options: Options;
	dequeue: (nonce: DeOptionsInl | null)=>Promise<any>
}

interface Queue {
	list: List<QueueItem>;
	running: boolean;
}


export class MemoryTransactionQueue {

	private _host: IWeb3;
	private _tx_queues: Dict<Queue> = {};
	private _tx_nonceQueue: Dict<List<DeOptionsInl>> = {};

	constructor(web3: IWeb3) {
		this._host = web3;
	}

	get host() {
		return this._host;
	}

	async beforeDequeue() {}

	private async _dequeue(queue: Queue) {
		var first = queue.list.first;
		if (first) {
			try {
				var ctx = first.value;
				await this.beforeDequeue();
				var opts = await this.getNonce_(ctx.options.from, ctx.options.nonceTimeout);
				queue.list.shift();
				await ctx.dequeue(opts);
			} catch (err) {
				console.warn('TransactionQueue#_dequeue', err);
				await utils.sleep(2e3); // sleep 1s
			}
			utils.nextTick(()=>this._dequeue(queue));
		} else {
			queue.running = false;
		}
	}

	/**
	 * @func push(exec, options) 排队交易
	 */
	async push<R>(exec: (arg: DeOptions)=>Promise<R>, opts?: Options): Promise<R> {

		var options = {from: '', retry: 0, ...opts};
		var from = (options.from = options.from || await this._host.defaultAccount()).toLowerCase();
		var retry = options.retry = Number(options.retry) || 0;
		var queue = this._tx_queues[from];
		if (!queue) {
			this._tx_queues[from] = queue = { list: new List(), running: false };
		}

		return await new Promise((resolve, reject)=>{
			var item: QueueItem = {
				retry,
				options,
				dequeue: async (opts: DeOptionsInl | null)=>{
					try {
						if (opts) {
							resolve(await exec({...opts}));
						} else { // retry, wait nonce
							queue.list.unshift(item); // retry queue
							await utils.sleep(1e4); // sleep 10s
							return;
						}
					} catch(err: any) {
						var opts_ = opts as DeOptionsInl;
						var errnos: ErrnoCode[] = [
							errno.ERR_TRANSACTION_STATUS_FAIL, // fail
							errno.ERR_TRANSACTION_SEND_FAIL, // send tx fail
							errno.ERR_TRANSACTION_INVALID,    // invalid
							errno.ERR_EXECUTION_REVERTED, // exec fail
							errno.ERR_SOLIDITY_EXEC_ERROR, // exec fail
							errno.ERR_INSUFFICIENT_FUNDS_FOR_TX, // insufficient funds for transaction
							errno.ERR_TRANSACTION_BLOCK_RANGE_LIMIT, // block limit
							errno.ERR_GAS_REQUIRED_LIMIT, // gas limit
							errno.ERR_TRANSACTION_TIMEOUT, // timeout
						];
						if ( errnos.find(([e])=>err.errno==e) ) {
							if (item.retry--) {
								console.warn(err);
								queue.list.push(item); // retry back
							} else {
								if (err.errno != errno.ERR_INSUFFICIENT_FUNDS_FOR_TX[0])
									opts_.nonceTimeout = Date.now() + 3e4; // wait 30s
								reject(err);
							}
						} else { // force retry
							console.warn('TransactionQueue_push_dequeue, web3 tx fail force retry *********', opts, err);
							opts_.nonceTimeout = 0; // disable wait nonce Timeout
							queue.list.unshift(item); // retry queue
							await utils.sleep(2e3); // sleep 2s
						}
					}
				},
			};

			queue.list.push(item);
			// console.log('web3.enqueue', opts);

			if (!queue.running) {
				queue.running = true;
				this._dequeue(queue);
			}
		});
	}

	/**
	 * @func clear() junk data
	*/
	async clear(from: string) {
		var curNonce = await this._host.getNonce(from);
		var list = (this._tx_nonceQueue[from] || (this._tx_nonceQueue[from] = new List()));
		// delete complete
		var item = list.first;
		while (item && item.value.nonce < curNonce) {
			var tmp = item;
			item = item.next;
			list.delete(tmp);
		}
		return curNonce;
	}

	// @private getNonce_()
	private async getNonce_(account?: string, _timeout?: number, greedy?: boolean): Promise<DeOptionsInl | null> {
		var from = account || await this._host.defaultAccount();
		utils.assert(from, 'getNonce error account empty');

		var now = Date.now();
		var gasPrice = await this._host.gasPrice();
		var nonceTimeout = (Number(_timeout) || base.TRANSACTION_NONCE_TIMEOUT) + now;
		var curNonce = await this.clear(from);
		var list = this._tx_nonceQueue[from];

		var item = list.first;
		var nonce = curNonce;
		while (item) {
			var opt = item.value;
			utils.assert(nonce == opt.nonce, 'TransactionQueue#getNonce_, nonce no match');
			if (now > opt.nonceTimeout) { // pending and is timeout
				opt.nonceTimeout = nonceTimeout; // new tomeiut
				opt.gasPrice = opt.gasPrice ? Math.max(gasPrice, opt.gasPrice + 1): gasPrice;
				return opt;
			}
			nonce++;
			item = item.next;
		}

		if (greedy || curNonce == nonce) {
			var opt = { from, nonce, gasPrice, nonceTimeout };
			list.push(opt);
			return opt;
		}

		return null;
	}

	/**
	 * @func getNonce() 获取排队nonce
	 */
	async getNonce(account?: string, timeout?: number): Promise<DeOptions> {
		var  { nonceTimeout, ...opts} = await this.getNonce_(account, timeout, true) as DeOptionsInl;
		return opts;
	}

}