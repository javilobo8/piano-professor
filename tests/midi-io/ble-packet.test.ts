import { describe, expect, it } from 'vitest';
import { decodeBlePacket, encodeBlePacket } from '../../src/midi-io/ble-packet';

const bytes = (...b: number[]) => Uint8Array.from(b);

describe('decodeBlePacket', () => {
  it('decodes a single note on', () => {
    expect(decodeBlePacket(bytes(0x80, 0x81, 0x90, 60, 100))).toEqual([[0x90, 60, 100]]);
  });

  it('decodes several full messages', () => {
    expect(decodeBlePacket(bytes(0x80, 0x81, 0x90, 60, 100, 0x82, 0x80, 61, 0))).toEqual([
      [0x90, 60, 100],
      [0x80, 61, 0],
    ]);
  });

  it('decodes running status without a timestamp', () => {
    expect(decodeBlePacket(bytes(0x80, 0x81, 0x90, 60, 100, 64, 90))).toEqual([
      [0x90, 60, 100],
      [0x90, 64, 90],
    ]);
  });

  it('decodes running status with a new timestamp', () => {
    expect(decodeBlePacket(bytes(0x80, 0x81, 0x90, 60, 100, 0x85, 64, 90))).toEqual([
      [0x90, 60, 100],
      [0x90, 64, 90],
    ]);
  });

  it('decodes one-data-byte messages', () => {
    expect(decodeBlePacket(bytes(0x80, 0x81, 0xc0, 5, 0x81, 0x90, 60, 1))).toEqual([
      [0xc0, 5],
      [0x90, 60, 1],
    ]);
  });

  it('skips SysEx and real-time bytes', () => {
    expect(
      decodeBlePacket(bytes(0x80, 0x81, 0xf0, 0x41, 0x10, 0x81, 0xf7, 0x82, 0xfe, 0x83, 0x90, 60, 100)),
    ).toEqual([[0x90, 60, 100]]);
  });

  it('ignores invalid, empty or truncated packets', () => {
    expect(decodeBlePacket(bytes())).toEqual([]);
    expect(decodeBlePacket(bytes(0x10, 0x81, 0x90, 60, 100))).toEqual([]);
    expect(decodeBlePacket(bytes(0x80, 0x81, 0x90, 60))).toEqual([]);
    expect(decodeBlePacket(bytes(0x80, 60, 100))).toEqual([]);
  });
});

describe('encodeBlePacket', () => {
  it('writes header and per-message timestamps from the low 13 bits of the time', () => {
    // 1000 ms = 0b00111_1101000 -> header 0x80|0x07, timestamp 0x80|0x68
    expect([...encodeBlePacket([[0x90, 60, 100], [0x80, 61, 0]], 1000)]).toEqual([
      0x87, 0xe8, 0x90, 60, 100, 0xe8, 0x80, 61, 0,
    ]);
  });

  it('round-trips through the decoder', () => {
    const messages = [[0x90, 60, 100], [0x80, 60, 0], [0xb0, 123, 0]];
    expect(decodeBlePacket(encodeBlePacket(messages, 123_456))).toEqual(messages);
  });
});
