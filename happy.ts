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

	private _parseOutputs(data: any, outputs: AbiOutput[]) {

		if (outputs.length === 0) {
			return data;
		}
		if (outputs.length == 1) {
			data = Array.isArray(data) ? data: [data];
		}
		var new_data = [];
		var new_data_obj = {} as Dict;
		var new_data_obj_len = 0;

		for (var i = 0; i < outputs.length; i++) {
			var item = data[i];
			var out = outputs[i];

			switch(out.type) {
				case 'tuple':
					var touts = out.components as AbiOutput[];
					var tdatas = this._parseOutputs(item, touts);
					var obj = {} as Dict;
					for (var j = 0; j < touts.length; j++) {
						var tdata = tdatas[j];
						obj[touts[j].name] = tdata;
					}
					item = obj;
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

			if (out.name) {
				new_data_obj_len++;
				new_data_obj[out.name] = item;
			}

			new_data.push(item);
		}

		if (new_data_obj_len > 1 && new_data_obj_len == new_data.length) {
			new_data = [new_data_obj];
		}

		return new_data;
	}

	happy(from?: string): T {
		var {_queue} = this;
		return new Proxy(this, {
			get(target: HappyContract<T>, p: PropertyKey, receiver: any) {

				var prop = String(p);
				var abi = target._abis[prop];
				var method = target._methods[prop];

				if (!method) {
					return;
				}

				return async function(...args: any[]) {

					if ( (abi.stateMutability as string).indexOf('view') == -1 ) {
						if (_queue) {
							var receipt = await _queue.push(e=>method.apply(target._methods, args).sendSignTransaction(e), {from});
						} else {
							var receipt = await method.apply(target._methods, args).sendSignTransaction({from});
						}
						return receipt;
					}
					else {
						var outputs = await method.apply(target._methods, args).call({from});
						var abiOutputs = abi.outputs as AbiOutput[];
						var outputs2 = target._parseOutputs(outputs, abiOutputs);

						if (abiOutputs.length) {
							if (outputs2.length == 1) {
								return outputs2[0];
							} else if (outputs2.length === 0) {
								return void(0);
							} else {
								return outputs2;
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