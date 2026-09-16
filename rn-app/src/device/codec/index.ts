/** Module 5 - the codec's public face. Modules 6 and 7 import from here and nowhere else. */
export { bytesToHex, checksum, hasValidChecksum, hexToBytes, withChecksum } from './bytes';
export { CodecError, decodeReader, decodeVmc, describeFrame, encodeReader, encodeVmc } from './codec';
export type { CodecReason } from './codec';
export { READER_RESPONSES, VMC_COMMANDS } from './table';
export type { ReaderMessage, ReaderName, VmcMessage, VmcName } from './table';
