
import {ErrnoList as BaseErrnoList} from 'somes/errno'

export class ErrnoList extends BaseErrnoList {
	ERR_WEB3_RPC_INVALID_RESPONSE: ErrnoCode = [100235, 'ERR_WEB3_RPC_INVALID_RESPONSE', 'Ethereum device failure']
	ERR_TRANSACTION_STATUS_FAIL: ErrnoCode = [100241, 'ERR_TRANSACTION_STATUS_FAIL', 'send eth transaction fail']
	ERR_RPC_REQUEST_TIMEOUT: ErrnoCode = [100232, 'ERR_RPC_REQUEST_TIMEOUT', 'request timeout']
	ERR_TRANSACTION_TIMEOUT: ErrnoCode = [100256, 'TRANSACTION TIMEOUT']
	ERR_IWEB3_SIGN_NOT_IMPL: ErrnoCode = [100257, 'IWeb3.sign Not implemented']
	ERR_TRANSACTION_INVALID: ErrnoCode = [100258, 'ERR_TRANSACTION_INVALID']
	ERR_TRANSACTION_BLOCK_RANGE_LIMIT: ErrnoCode = [100259, 'ERR_ETH_TRANSACTION_BLOCK_RANGE_LIMIT']
	ERR_EXECUTION_REVERTED: ErrnoCode = [100260, 'ERR_EXECUTION_REVERTED'] // call exec reverted
	ERR_EXECUTION_Returned_Values_Invalid: ErrnoCode = [100264, "Returned values aren't valid"]  // call exec error
	ERR_SOLIDITY_EXEC_ERROR: ErrnoCode = [100261, 'ERR_SOLIDITY_EXEC_ERROR']
	ERR_INSUFFICIENT_FUNDS_FOR_TX: ErrnoCode = [100262, 'insufficient funds for transaction']
	ERR_SEND_RAW_TRANSACTION_FAIL: ErrnoCode = [100263, 'ERR_SEND_RAW_TRANSACTION_FAIL']
	ERR_GAS_REQUIRED_LIMIT: ErrnoCode = [101000, 'ERR_GAS_REQUIRED_LIMIT']
	ERR_TRANSACTION_SEND_FAIL: ErrnoCode = [101001, 'ERR_TRANSACTION_SEND_FAIL']
	
};

export default new ErrnoList();