/**
 * @copyright © 2020 Copyright hardchain
 * @date 2021-01-04
 */

import somes from 'somes';
import {IWeb3, TransactionPromise, TransactionReceipt, EventData} from './index';
import {MemoryTransactionQueue} from './queue';
import {AbiItem, AbiOutput} from 'web3-utils/types';
import { Contract, ContractSendMethod, SendCallback } from './index';
import abi from 'web3-eth-abi';
import buffer from 'somes/buffer';

export interface ContractMethod {
	<A extends any[]>(...args: A): ContractSendMethod;
}

export interface SolidityInfo {
	contractName: string;
	abi: any[];
	contractAddress: string;
}

export interface Opts {
	from?: string;
	value?: string;
	gasPrice?: number;
	gasLimit?: number;
	tryCall?: boolean;
}

export interface Result<T = void> {
	post(opts?: Opts, cb?: SendCallback): TransactionPromise;
	call(opts?: Opts): Promise<T>;
	estimateGas(opts?: Opts): Promise<number>;
	encodeABI(): string;
}

/**
* @class HappyContract<T> 快乐的调用协约
*/
export default class HappyContract<T> {
	private static _contracts: Dict<HappyContract<any>> = {};
	private _contract: Contract;
	private _methods: Dict<ContractMethod>;
	private _abis: Dict<AbiItem>;
	private _apis?: T;
	private _info: SolidityInfo;
	private _web3: IWeb3;
	private _queue?: MemoryTransactionQueue;

	constructor(info: SolidityInfo, web3: IWeb3 | MemoryTransactionQueue) {
		this._info = info;
		if (web3 instanceof MemoryTransactionQueue) {
			this._web3 = web3.host;
			this._queue = web3;
		} else {
			this._web3 = web3;
		}
		somes.assert(this._info);
		this._abis = {};
		for (var abi of this._info.abi) {
			this._abis[String(abi.name)] = abi;
		}
		this._contract = this._web3.createContract(this._info.contractAddress, this._info.abi);
		this._methods = this._contract.methods;
	}

	get contract() {
		return this._contract;
	}

	private parseTupleOutputs(out: AbiOutput, item: any) {
		var touts = out.components as AbiOutput[];
		var tdatas = this.parseOutputs(item, touts);
		var obj = {} as Dict;
		for (var j = 0; j < touts.length; j++) {
			var tdata = tdatas[j];
			obj[touts[j].name] = tdata;
		}
		return obj;
	}

	private parseItemOutputs(type: string, out: AbiOutput, item: any) {
		switch(type) {
			case 'tuple':
				item = this.parseTupleOutputs(out, item);
				break;
			case 'int256':
			case 'uint256':
				item = BigInt(item);
				break;
			case 'uint8':
			case 'uint16':
			case 'uint32':
			case 'int8':
			case 'int16':
			case 'int32':
				item = Number(item);
				break;
		}
		return item;
	}

	private parseOutputs(data: any, outputs: AbiOutput[]) {

		if (outputs.length === 0) {
			return data;
		}
		if (outputs.length == 1) {
			data = [data]; // Array.isArray(data) ? data: [data];
		}
		var new_data = [];

		for (var i = 0; i < outputs.length; i++) {
			var item = data[i];
			var out = outputs[i];
			var type = out.type;

			if (type.substring(type.length - 2) == '[]') {
				item = (item as any[]).map(e=>this.parseItemOutputs(type.substring(0, type.length - 2), out, e));
			} else {
				item = this.parseItemOutputs(type, out, item);
			}

			new_data.push(item);
		}

		return new_data;
	}

	private _errorsSignature: Dict<{signature: string, abi: AbiItem}> | null = null;

	errorsSignatures() {
		let abis = ([] as any[]).concat(...Object.values(HappyContract._contracts).map(e=>e._info.abi));
		if (!this._errorsSignature) {
			this._errorsSignature = {};
			let errors = this._errorsSignature!;
			let signatures = abis.filter(e=>(e as any).type=='error').map((e: AbiItem)=>({signature: abi.encodeFunctionSignature(e), abi: e}));
			for (let {signature,abi} of signatures) {
				errors[signature] = {signature, abi};
			}
		}
		return this._errorsSignature;
	}

	private async methocCall(method: ContractSendMethod, opts?: Opts) {
		try {
			return await method.call(opts as any);
		} catch(err: any) {
			let flag = 'execution reverted';
			let idx = err.message.indexOf(flag);
			if (idx != -1) {
				let msg = err.message.substring(idx + flag.length);
				try {
					let originalError = JSON.parse(msg).originalError; /*as {
						code: number, data: string, message: string
					};*/
					if (originalError) {
						let errorsSignatures = this.errorsSignatures();
						let data = buffer.from(originalError.data.slice(2), 'hex');
						let signature = '0x' + data.slice(0, 4).toString('hex');
						let mat = errorsSignatures[signature];
						if (mat) {
							let signatureStr = `${mat.abi.name}(${mat.abi.inputs!.map(e=>e.type).join(',')})`;
							originalError.description = signatureStr;
							originalError.message += ': ' + signatureStr;
							originalError.returnValues = abi.decodeParameters(mat.abi.inputs || [], '0x' + data.slice(4).toString('hex'));
						}
						let child = Error.new(originalError);
						err.originalError = child;
						err.child = [child];
					}
				} catch(err){}
			}
			throw err;
		}
	}

	private async abiCall(prop: string, method: ContractSendMethod, opts?: Opts) {
		var {_web3} = this;
		var abi = this._abis[prop];

		opts = opts || {};
		opts.from = opts.from || await _web3.defaultAccount();

		// call
		var rawOutputs = await this.methocCall(method, opts);
		var abiOutputs = abi.outputs as AbiOutput[];
		var outputs = this.parseOutputs(rawOutputs, abiOutputs);

		if (abiOutputs.length) {
			if (outputs.length == 1) {
				return outputs[0];
			} else if (outputs.length === 0) {
				return void(0);
			} else {
				var newOutputs = {} as Dict;
				var newOutputs_len = 0;
				for (var i = 0; i < abiOutputs.length; i++) {
					var item = outputs[i];
					var out = abiOutputs[i];
					if (out.name) {
						newOutputs_len++;
						newOutputs[out.name] = item;
					}
				}
				if (newOutputs_len > 1 && newOutputs_len == outputs.length) {
					return newOutputs;
				} else {
					return outputs;
				}
			}
		}
	}

	private async post(method: ContractSendMethod, {tryCall, ...opts}: Opts = {}, cb?: SendCallback) {
		var {_queue,_web3} = this;

		if (tryCall)
			await this.methocCall(method, opts as any); // try call
		opts = opts || {};
		opts.from = opts.from || await _web3.defaultAccount();
		var receipt: any;
		// post
		if (_web3.sign) {
			if (_queue) {
				receipt = _queue.push(e=>method.post({...opts, ...e}, cb), opts);
			} else {
				receipt = method.post(opts, cb);
			}
		} else {
			if (_queue) {
				receipt = _queue.push(e=>method.post({...opts, ...e}, cb), opts);
			} else {
				receipt = method.post(opts, cb);
			}
		}
		return receipt;
	}

	get api(): T {
		if (!this._apis) {
			var self = this;
			var methods = this._methods;
			var apis = this._apis = {} as any;

			Object.entries(methods).forEach(function([name, func]) {
				apis[name] = (...args: any[])=>{
					var method = func.call(methods, ...args) as ContractSendMethod;
					var api = Object.create(method);
					api.call = (e: any)=>self.abiCall(name, method, e);
					api.post = (e: any, cb: any)=>self.post(method, e, cb);
					return api;
				};
			});
		}
		return this._apis as any;
	}

	get address(): string {
		return this._contract.options.address;
	}

	async findEvent(event: string, transactionHash: string, blockNumber?: number): Promise<EventData[] | null> {
		var evt = await this._contract.findEvent(event, transactionHash, blockNumber);
		return evt?.events || null;
	}

	async findEventFromReceipt(event: string, receipt: TransactionReceipt): Promise<EventData[]> {
		if (receipt.events && receipt.events[event]) {
			var e = receipt.events[event];
			return (Array.isArray(e) ? e: [e]) as EventData[];
		} else {
			var evt = await this.findEvent(event, receipt.transactionHash,  receipt.blockNumber);
			somes.assert(evt, `not event Sell ${event}`);
			return evt as EventData[];
		}
	}

	static instance<T>(info: SolidityInfo, web3: IWeb3 | MemoryTransactionQueue, name?: string): HappyContract<T> {
		var contractName = name || info.contractName;
		if (!this._contracts[contractName])
			this._contracts[contractName] = new HappyContract<T>(info, web3);
		return this._contracts[contractName];
	}

}