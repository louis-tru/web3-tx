
import {ErrnoList as BaseErrnoList} from 'somes/errno'

export class ErrnoList extends BaseErrnoList {
	ERR_WEB3_RPC_REQUEST_TIMEOUT: ErrnoCode = [101001, 'ERR_WEB3_RPC_REQUEST_TIMEOUT', 'request timeout']
	ERR_WEB3_RPC_INVALID_RESPONSE: ErrnoCode = [101002, 'ERR_WEB3_RPC_INVALID_RESPONSE', 'Ethereum device failure']
	ERR_WEB3_RPC_NETWORK_ERROR: ErrnoCode = [101003, 'ERR_WEB3_RPC_NETWORK_ERROR']
	ERR_WEB3_SIGN_NOT_IMPL: ErrnoCode = [101004, 'Web3.sign Not implemented']
	// call exec reverted
	ERR_EXECUTION_REVERTED: ErrnoCode = [101005, 'ERR_EXECUTION_REVERTED', 'Check if the contract method exists']
	ERR_EXECUTION_REVERTED_Values_Invalid: ErrnoCode = [101006, "Returned values aren't valid", 'Check if the contract method exists']
	ERR_EXECUTION_CALL_FAIL: ErrnoCode = [101007, 'ERR_EXECUTION_CALL_FAIL']

	ERR_TRANSACTION_TIMEOUT: ErrnoCode = [101008, 'ERR_TRANSACTION_TIMEOUT']
	ERR_TRANSACTION_INVALID: ErrnoCode = [101009, 'ERR_TRANSACTION_INVALID']
	ERR_TRANSACTION_BLOCK_RANGE_LIMIT: ErrnoCode = [101010, 'ERR_TRANSACTION_BLOCK_RANGE_LIMIT']
	ERR_TRANSACTION_INSUFFICIENT_FUNDS: ErrnoCode = [101011, 'insufficient funds for transaction']
	ERR_TRANSACTION_SEND_FAIL: ErrnoCode = [101012, 'ERR_TRANSACTION_SEND_FAIL']
	ERR_TRANSACTION_GAS_LIMIT: ErrnoCode = [101013, 'ERR_TRANSACTION_GAS_LIMIT']
	ERR_TRANSACTION_STATUS_FAIL: ErrnoCode = [101014, 'ERR_TRANSACTION_STATUS_FAIL', 'send transaction fail']
	//
	ERR_REPEAT_MEMORY_TX_QUEUE_ID: ErrnoCode = [101015, 'ERR_REPEAT_MEMORY_TX_QUEUE_ID']
};

export default new ErrnoList();