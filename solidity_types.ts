
export class Bytes32 extends String {
	// 0xc6f902b98b99ba59f2aef94888b199ac06953fe53b67bd93ae2cc1f302cac1c5
	static from(str: string) {
		return ('0x' + Buffer.from(str).toString('hex')) as Bytes32;
	}
}

export class Address extends String {
	// 0xCAC2c08dE2c56aD68eBeF6f55B26361Ef493069A
	static from(str: string) {
		return ('0x' + Buffer.from(str).toString('hex')) as Address;
	}
}

export class Bytes extends String {
	// 0x0
	static from(str: string) {
		return ('0x' + Buffer.from(str).toString('hex')) as Bytes;
	}
}

export class Bytes4 extends Bytes32 {}
export class Bytes8 extends Bytes32 {}
export class Bytes16 extends Bytes32 {}

export type Uint256 = bigint;
export type Int256 = bigint;
export type Uint8 = number;
export type Uint16 = number;
export type Uint32 = number;
export type Int8 = number;
export type Int16 = number;
export type Int32 = number;