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
import {List,ListItem} from 'somes/event';
import * as base from './base';
import errno from './errno';

export interface Options {
	id?: number;
	from?: string;
	retry?: number;
	retryDelay?: number;
	nonceTimeout?: number; // pending nonce timeout
}

export interface DeOptions {
	from: string;
	nonce: number;
	gasPrice: number;
	retainNonceTimeout: number; // retain
}

interface QueueItem {
	id: number;
	retry: number;
	execTime: number;
	retryDelay: number;
	options: Options;
	dequeue: (listItem: ListItem<QueueItem>, nonce: DeOptions)=>Promise<any>
}

interface Queue {
	list: List<QueueItem>;
	running: boolean;
}

export class MemoryTransactionQueue {
	private _host: IWeb3;
	private _tx_queues: Dict<Queue> = {}; // from address => Queue
	private _tx_nonceQueue: Dict<List<DeOptions>> = {};
	private _listItems: Dict<ListItem<QueueItem>> = {};

	constructor(web3: IWeb3) {
		this._host = web3;
	}

	get host() {
		return this._host;
	}

	async beforeDequeue() {
		// subclass implementation
	}

	private async _dequeue(queue: Queue) {
		let first = queue.list.first;
		if (first) {
			if (first.value.execTime > Date.now()) {
				await utils.sleep(5e3); // sleep 5s
			} else {
				try {
					await this.beforeDequeue();
					let {from,nonceTimeout} = first.value.options;
					let opts = await this.getNonce_2(from, nonceTimeout);
					if (opts) {
						await first.value.dequeue(first, opts);
					} else {
						await utils.sleep(5e3); // sleep 5s
					}
				} catch (err) {
					console.warn('#TransactionQueue._dequeue', err);
					await utils.sleep(5e3); // sleep 5s
				}
			}
			utils.nextTick(()=>this._dequeue(queue));
		} else {
			queue.running = false;
		}
	}

	/**
	 * @func cancel() by id
	*/
	cancel(id: number) {
		let item = this._listItems[id];
		if (item) {
			this.deleteItem(item);
		}
	}

	private deleteItem(item: ListItem<QueueItem>) {
		if (item.host)
			item.host.delete(item);
		delete this._listItems[item.value.id];
	}

	/**
	 * @func push(exec, options) 排队交易
	 */
	async push<R>(exec: (arg: DeOptions)=>Promise<R>, opts?: Options) {

		let options = {from: '', retry: 0, ...opts};
		let from = (options.from = options.from || await this._host.defaultAccount()).toLowerCase();
		let retry = options.retry = Number(options.retry) || 0;
		let retryDelay = options.retryDelay = Math.max(Number(options.retryDelay) || 0, 1e4); // min 10s
		let queue = this._tx_queues[from];
		let id = options.id || utils.getId();

		if (!queue) {
			this._tx_queues[from] = queue = { list: new List(), running: false };
		}

		let promise = new Promise<R>((resolve,reject)=>{
			utils.assert(!this._listItems[id], errno.ERR_REPEAT_MEMORY_TX_QUEUE_ID);

			this._listItems[id] = queue.list.push({
				id, options, retry, retryDelay, execTime: 0,
				dequeue: async (item, opts)=>{
					let r: R, _err, isRetry = false;
					try {
						r = await exec({...opts});
					} catch(err: any) {
						opts.retainNonceTimeout = -1; // release nonce;
						_err = err;
						let errnos: ErrnoCode[] = [
							errno.ERR_EXECUTION_REVERTED, // call exec reverted
							errno.ERR_EXECUTION_REVERTED_Values_Invalid,
							errno.ERR_EXECUTION_CALL_FAIL, // exec fail
							errno.ERR_TRANSACTION_STATUS_FAIL, // fail
							errno.ERR_TRANSACTION_SEND_FAIL, // send tx fail
							errno.ERR_TRANSACTION_INVALID,    // invalid
							errno.ERR_TRANSACTION_INSUFFICIENT_FUNDS, // insufficient funds for transaction
							errno.ERR_TRANSACTION_BLOCK_RANGE_LIMIT, // block limit
							errno.ERR_TRANSACTION_GAS_LIMIT, // gas limit
							errno.ERR_TRANSACTION_TIMEOUT, // timeout
						];
						if ( errnos.find(([e])=>err.errno==e) ) { // match errors ok
							if (item.value.retry-- > 0) {
								isRetry = true; // continue wait retry
							} else {
								if (err.errno == errno.ERR_TRANSACTION_INSUFFICIENT_FUNDS[0]) {
									if (item.value.retry-- == 0) // force try once
										isRetry = true; // continue wait retry
								}
							}
						} else { // unknown error force retry, maybe http error
							console.warn('#TransactionQueue.push.dequeue, web3 tx fail force retry *********', opts);
							isRetry = true; // continue wait retry
						}
					}

					if (isRetry) {
						if (_err)
							console.warn(_err);
						item.value.execTime = Date.now() + item.value.retryDelay; // retry
					} else {
						this.deleteItem(item); // delete queue item
						if (_err) {
							reject(_err);
						} else {
							resolve(r!);
						}
					}
				},
			});
			// console.log('web3.enqueue', opts);

			if (!queue.running) {
				queue.running = true;
				this._dequeue(queue);
			}
		})

		return await promise;
	}

	/**
	 * @func clear() clear junk data
	*/
	private async clear(account: string) {
		var curNonce = await this._host.getNonce(account);
		var list = (this._tx_nonceQueue[account] || (this._tx_nonceQueue[account] = new List()));
		// delete complete
		var item = list.first;
		while (item && item.value.nonce < curNonce) {
			var tmp = item;
			item = item.next;
			list.delete(tmp);
		}
		return curNonce;
	}

	// @private getNonce_2()
	private async getNonce_2(account?: string, timeout?: number, greedy?: boolean): Promise<DeOptions | null> {
		let from = account || await this._host.defaultAccount();
		utils.assert(from, 'getNonce error account empty');

		let now = Date.now();
		let gasPrice = await this._host.gasPrice();
		let newRetainNonceTimeout = (Number(timeout) || base.TRANSACTION_NONCE_TIMEOUT) + now;
		let curNonce = await this.clear(from);
		let list = this._tx_nonceQueue[from];
		let item = list.first;
		let nonce = curNonce;

		while (item) {
			let opt = item.value;
			// list nonce must be contiguous
			utils.assert(nonce == opt.nonce, '#TransactionQueue.getNonce_2, nonce no match');
			if (now > opt.retainNonceTimeout) { // pending and is timeout
				opt.retainNonceTimeout = newRetainNonceTimeout; // new timeout
				opt.gasPrice = opt.gasPrice ? Math.max(gasPrice, opt.gasPrice + 1): gasPrice;
				return opt;
			}
			nonce++;
			item = item.next;
		}
		if (greedy || curNonce == nonce) {
			let opt = {
				from, nonce, gasPrice, retainNonceTimeout: newRetainNonceTimeout
			};
			list.push(opt);
			return opt;
		}

		return null;
	}

	/**
	 * @func getNonce() 获取排队nonce
	 */
	getNonce(account?: string, timeout?: number) {
		return this.getNonce_2(account, timeout, true);
	}

}