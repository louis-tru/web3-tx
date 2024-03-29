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
import req from 'somes/request';
import {RequestArguments } from 'web3-core';
import {errors,JsonRpcPayload, JsonRpcResponse,
	HttpProviderBase,HttpProviderOptions} from 'web3-core-helpers';
import {TRANSACTION_REQUEST_TIMEOUT, Web3Raw, RpcCallback} from './base';

if (utils.haveNode) {
	var net  = require('net');
}

export { JsonRpcPayload, JsonRpcResponse };

export interface BaseProvider {
	readonly rpc: string;
	send(payload: JsonRpcPayload, callback: RpcCallback): void;
}

export type Provider = BaseProvider | string;

export enum MPSwitchMode {
	kRandom,
	kFixed
}

class HttpProvider implements HttpProviderBase {
	readonly host: string;
	readonly connected = false;
	readonly options: HttpProviderOptions & {logs?: number};
	readonly logs: number; // print logs

	constructor(host: string, opts?:HttpProviderOptions) {
		this.host = host;
		this.options = opts || {};
		this.logs = this.options.logs || 0;
	}
	send(payload: JsonRpcPayload, callback: (error: Error | null, result?: JsonRpcResponse)=>void) {
		this.request(payload).then(e=>callback(null, e)).catch(callback);
	}
	sendAsync(payload: JsonRpcPayload, callback: (error: Error | null, result?: JsonRpcResponse)=>void) {
		this.request(payload).then(e=>callback(null, e)).catch(callback);
	}
	async request(payload: JsonRpcPayload) {
		let headers: Dict = {
			'Accept-Encoding': 'gzip, deflate, br', // use gzip
		};
		for (let {name,value} of this.options.headers || []) {
			headers[name] = value;
		}
		let jsonStr = '';
		try {
			let response = await req.request(this.host, {
				params: payload, method: 'POST', dataType: 'json',
				headers: headers,
				timeout: this.options.timeout,
				logs: !!this.logs,
			});
			jsonStr = response.data.toString('utf-8');
		} catch(err:any) {
			throw errors.ErrorResponse(err);
		}

		let result;
		try {
			result = JSON.parse(jsonStr);
		} catch(e:any) {
			throw errors.InvalidResponse(Error.new(e).ext({response:jsonStr}));
		}
		return result;
	}
	supportsSubscriptions() {
		return false;
	}
	disconnect() {
		return false;
	}
}

export class MultipleProvider implements BaseProvider {
	private _SendId = utils.getId();
	private _BaseProvider: { provider: BaseProvider, priority: number }[];
	private _switchMode: MPSwitchMode;
	private _providerIndex = 0;

	logs: number = 0; // print logs

	constructor(provider: Provider | Provider[], priority?: number[], mode?: MPSwitchMode, timeout?: number) {
		var priority_ = priority || [];
		this._BaseProvider = (Array.isArray(provider) ? provider : [provider]).map((provider: any, j)=>{
			var { WebsocketProvider, IpcProvider } = Web3Raw.providers;
			var baseProvider: BaseProvider = provider;

			if (typeof provider == 'string') {
				var priority = 1;
				var m = provider.match(/^(\d+)\//);
				// 16/http://165.154.5.166:8545    random priority = 16
				// 10/http://103.210.22.186:8545   random priority = 10
				if (m) {
					priority = Number(m[1]) || 1;
					provider = provider.substring(m[0].length);
				}
				if (priority_[j]) {
					priority = Number(priority_[j]) || priority;
				}

				if (/^https?:/.test(provider)) { // http
					baseProvider = new HttpProvider(provider, { timeout: timeout || TRANSACTION_REQUEST_TIMEOUT }) as any;
				} else if (/^wss?:/.test(provider)) { // web socket
					baseProvider = new WebsocketProvider(provider, { timeout: timeout || TRANSACTION_REQUEST_TIMEOUT }) as any;
				} else if (/^[\\/]/.test(provider)) { // ipc
					baseProvider = new IpcProvider(provider, net) as any;
				} else {
					throw Error(`Can't create 'Web3 provider`);
				}
				Object.assign(baseProvider, { rpc: provider });

			} else {
				var priority = Number(priority_[j]) || 1;
			}

			return { provider: baseProvider, priority };
		});
		this._switchMode = mode || MPSwitchMode.kRandom;
	}

	get baseProviders() {
		return this._BaseProvider.map(e=>e.provider);
	}

	get size() {
		return this._BaseProvider.length;
	}

	get rpc() {
		return this.baseProvider.rpc;
	}

	get baseProvider() {
		utils.assert(this._BaseProvider.length, 'no provider available');
		if (this._BaseProvider.length == 1) {
			return this._BaseProvider[0].provider;
		} else if (this._switchMode == MPSwitchMode.kRandom) {
			this.setRandomProviderIndex();
		}
		return this._BaseProvider[this._providerIndex].provider;
	}

	get switchMode() {
		return this._switchMode;
	}

	set switchMode(mode: MPSwitchMode) {
		this._switchMode = mode;
	}

	get providerIndex() {
		return this._providerIndex;
	}

	baseProviderAt(idx: number) {
		return this._BaseProvider[idx];
	}

	setProviderIndex(idx: number) {
		idx = Number(idx) || 0;
		utils.assert(idx < this._BaseProvider.length, 'no provider available');
		if (this._providerIndex != idx) {
			this._providerIndex = idx;
			return true;
		}
		return false;
	}

	setRandomProviderIndex(duplicatesNoAllowed?: boolean) {
		if (this._BaseProvider.length > 1) {
			do {
				var idx = utils.fixRandom(0, ...this._BaseProvider.map(e=>e.priority)) - 1;
			} while (duplicatesNoAllowed && idx == this._providerIndex);
			this.setProviderIndex(idx);
		}
	}

	sendAsync(payload: JsonRpcPayload, callback: RpcCallback) {
		this.send(payload, callback);
	}

	send(payload: JsonRpcPayload, callback: RpcCallback, idx?: number): void {
		var provider = idx === undefined ? this.baseProvider: this._BaseProvider[idx].provider;
		var rpc = provider.rpc;
		if (this.logs) {
			if (this.logs > 1) {
				(provider as any).logs = 2;
			} else {
				console.log('send rpc =>', provider.rpc, payload);
			}
		}
		provider.send(payload, (error?: Error, result?: JsonRpcResponse)=>{
			if (error) {
				callback(Error.new(error).ext({ httpErr: true, url: provider.rpc }));
			} else if (result) {
				this.onResult(result, rpc);

				if (result.error) {
					callback(Error.new(result.error));
				} else {
					callback(undefined, result);
				}
			} else {
				callback(Error.new('JsonRpcResponse be empty'));
			}
		});
	}

	onResult(res: JsonRpcResponse, rpc: string) {
		// child impl
	}

	request<T = any>(args: RequestArguments, idx?: number): Promise<T> {
		var payload: JsonRpcPayload = {
			jsonrpc: '2.0',
			method: args.method,
			params: args.params || [],
			id: args.id || this._SendId++,
		};
		return new Promise<T>((resolve, reject) => {
			this.send(payload, (error?: Error, result?: JsonRpcResponse) => {
				if (result) {
					result.error ? reject(result.error): resolve(result.result);
				} else {
					reject(error);
				}
			});
		});
	}
}