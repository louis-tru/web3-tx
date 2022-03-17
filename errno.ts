
import {ErrnoList as BaseErrnoList} from 'somes/errno'

export class ErrnoList extends BaseErrnoList {
	ERR_WEB3_RPC_INVALID_RESPONSE: ErrnoCode = [100235, 'ERR_WEB3_RPC_INVALID_RESPONSE', 'Ethereum device failure']
	ERR_PREV_TRANSACTION_NO_COMPLETE: ErrnoCode = [100222, '设备繁忙请稍后再试', '上一笔交易未完成']
	ERR_TRANSACTION_STATUS_FAIL: ErrnoCode = [100241, '发送以太坊交易失败']
	ERR_RPC_REQUEST_TIMEOUT: ErrnoCode = [100232, '请求操时', '请求操时']
	ERR_TRANSACTION_TIMEOUT: ErrnoCode = [100256, 'TRANSACTION TIMEOUT']
	ERR_IWEB3_SIGN_NOT_IMPL: ErrnoCode = [100257, 'IWeb3.sign Not implemented']
	ERR_TRANSACTION_INVALID: ErrnoCode = [100258, 'ERR_TRANSACTION_INVALID']
	ERR_TRANSACTION_BLOCK_RANGE_LIMIT: ErrnoCode = [100259, 'ERR_ETH_TRANSACTION_BLOCK_RANGE_LIMIT']
	ERR_EXECUTION_REVERTED: ErrnoCode = [100260, 'ERR_EXECUTION_REVERTED']
	ERR_SOLIDITY_EXEC_ERROR: ErrnoCode = [100261, 'ERR_SOLIDITY_EXEC_ERROR']
	ERR_INSUFFICIENT_FUNDS_FOR_TX: ErrnoCode = [100262, 'insufficient funds for transaction']
};

export default new ErrnoList();