/**
 * @copyright © 2020 Copyright hardchain
 * @date 2021-01-04
 */

import somes from 'somes';
import {IWeb3Z, Web3Z} from './index';
import {TransactionQueue} from './queue';
import {AbiItem, AbiOutput} from 'web3-utils/types';
import { Contract, ContractSendMethod } from './index';

export interface ContractMethod {
	<A extends any[]>(...args: A): ContractSendMethod;
}

export interface SolidityInfo {
	contractName: string;
	abi: any[];
	contractAddress: string;
}

/**
 * @class HappyContract<T> 快乐的调用协约
 */
export default class HappyContract<T> {
	private _contract: Contract;
	private _methods: Dict<ContractMethod>;
	private _abis: Dict<AbiItem>;
	private _info: SolidityInfo;
	private _web3: IWeb3Z;
	private _queue?: TransactionQueue;

	constructor(info: SolidityInfo, web3: Web3Z | TransactionQueue) {
		this._info = info;
		if (web3 instanceof Web3Z) {
			this._web3 = web3;
		} else {
			this._web3 = web3.host;
			this._queue = web3;
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

	private _parseTupleOutputs(out: AbiOutput, item: any) {
		var touts = out.components as AbiOutput[];
		var tdatas = this._parseOutputs(item, touts);
		var obj = {} as Dict;
		for (var j = 0; j < touts.length; j++) {
			var tdata = tdatas[j];
			obj[touts[j].name] = tdata;
		}
		return obj;
	}

	private _parseItemOutputs(type: string, out: AbiOutput, item: any) {
		switch(type) {
			case 'tuple':
				item = this._parseTupleOutputs(out, item);
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

	private _parseOutputs(data: any, outputs: AbiOutput[]) {

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

			if (type.substr(type.length - 2) == '[]') {
				item = (item as any[]).map(e=>this._parseItemOutputs(type.substr(0, type.length - 2), out, e));
			} else {
				item = this._parseItemOutputs(type, out, item);
			}

			new_data.push(item);
		}

		return new_data;
	}

	happy(from?: string): T {
		var {_queue,_web3} = this;
		return new Proxy(this, {
			get(target: HappyContract<T>, p: PropertyKey, receiver: any) {

				var prop = String(p);
				var abi = target._abis[prop];
				var method = target._methods[prop];

				if (!method) {
					return;
				}

				return async function(...args: any[]) {
					from = from || await _web3.getDefaultAccount();

					if ( (abi.stateMutability as string).indexOf('view') == -1 ) {
						if (_web3.sign) {
							if (_queue) {
								var receipt = await _queue.push(e=>method.apply(target._methods, args).sendSignTransaction(e), {from});
							} else {
								var receipt = await method.apply(target._methods, args).sendSignTransaction({from});
							}
						} else {
							if (_queue) {
								var receipt = await _queue.push(e=>method.apply(target._methods, args).send2(e), {from});
							} else {
								var receipt = await method.apply(target._methods, args).send2({from});
							}
						}
						return receipt;
					}
					else {
						var rawOutputs = await method.apply(target._methods, args).call({from});
						var abiOutputs = abi.outputs as AbiOutput[];
						var outputs = target._parseOutputs(rawOutputs, abiOutputs);

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
				}
				// function end
			}
		}) as unknown as T;
	}

	private static _contracts: Dict<HappyContract<any>> = {};

	static instance<T>(info: SolidityInfo, web3: Web3Z | TransactionQueue): HappyContract<T> {
		if (!this._contracts[info.contractName])
			this._contracts[info.contractName] = new HappyContract<T>(info, web3);
		return this._contracts[info.contractName];
	}

}