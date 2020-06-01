
import {ErrnoList as BaseErrnoList} from 'nxkit/errno'

export class ErrnoList extends BaseErrnoList {
	ERR_ETHEREUM_FAULT_ERROR: ErrnoCode = [100235, '以太坊设备故障', '以太坊设备致命故障']
	ERR_PREV_TRANSACTION_NO_COMPLETE: ErrnoCode = [100222, '设备繁忙请稍后再试', '上一笔交易未完成']
	ERR_ETH_TRANSACTION_FAIL: ErrnoCode = [100241, '发送以太坊交易失败']
	ERR_REQUEST_TIMEOUT: ErrnoCode = [100232, '请求操时', '请求操时']
	ERR_TRANSACTION_TIMEOUT: ErrnoCode = [100256, 'TRANSACTION TIMEOUT']
};

export default new ErrnoList();