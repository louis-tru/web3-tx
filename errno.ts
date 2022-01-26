
import {ErrnoList as BaseErrnoList} from 'somes/errno'

export class ErrnoList extends BaseErrnoList {
	ERR_WEB3_RPC_INVALID_RESPONSE: ErrnoCode = [100235, 'ERR_WEB3_RPC_INVALID_RESPONSE', 'Ethereum device failure']
	ERR_PREV_TRANSACTION_NO_COMPLETE: ErrnoCode = [100222, '设备繁忙请稍后再试', '上一笔交易未完成']
	ERR_ETH_TRANSACTION_FAIL: ErrnoCode = [100241, '发送以太坊交易失败']
	ERR_REQUEST_TIMEOUT: ErrnoCode = [100232, '请求操时', '请求操时']
	ERR_TRANSACTION_TIMEOUT: ErrnoCode = [100256, 'TRANSACTION TIMEOUT']
	ERR_IWEB3Z_SIGN_NOT_IMPL: ErrnoCode = [100257, 'IWeb3Z.sign Not implemented']
};

export default new ErrnoList();