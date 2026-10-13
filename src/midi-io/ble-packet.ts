// BLE-MIDI packet format (MIDI over Bluetooth Low Energy spec):
// [header 1tttttt] then, per message: [timestamp 1ttttttt] [status] [data…].
// A message may omit its status (running status) and, after a full message,
// also its timestamp. SysEx and system real-time bytes are skipped.

export const BLE_MIDI_SERVICE = '03b80e5a-ede8-4b33-a751-6ce34ec4c700';
export const BLE_MIDI_CHARACTERISTIC = '7772e5db-3868-4112-a1a9-f2669d106bf3';
/** Messages per packet so it fits the default 20-byte BLE payload (1 + 4 × 4 bytes). */
export const MESSAGES_PER_PACKET = 4;

function dataLength(status: number): number {
  const high = status & 0xf0;
  if (high === 0xc0 || high === 0xd0) return 1;
  if (high < 0xf0) return 2;
  if (status === 0xf1 || status === 0xf3) return 1;
  if (status === 0xf2) return 2;
  return 0;
}

/** Raw MIDI messages contained in one BLE-MIDI packet. */
export function decodeBlePacket(packet: Uint8Array): number[][] {
  const messages: number[][] = [];
  if (packet.length < 2 || (packet[0] & 0x80) === 0) return messages;
  let running = 0;
  let i = 1;
  while (i < packet.length) {
    if (packet[i] & 0x80) {
      // Timestamp byte, optionally followed by a status byte.
      i++;
      if (i >= packet.length) break;
      const b = packet[i];
      if (b & 0x80) {
        i++;
        if (b === 0xf0) {
          while (i < packet.length && packet[i] !== 0xf7) i++;
          i++;
          running = 0;
          continue;
        }
        if (b === 0xf7 || b >= 0xf8) {
          if (b === 0xf7) running = 0;
          continue;
        }
        running = b;
      }
    }
    if (!running) {
      i++;
      continue;
    }
    const length = dataLength(running);
    if (i + length > packet.length) break;
    messages.push([running, ...packet.subarray(i, i + length)]);
    i += length;
    if (running >= 0xf0) running = 0;
  }
  return messages;
}

/** One BLE-MIDI packet carrying the given messages, all stamped with timeMs. */
export function encodeBlePacket(messages: readonly number[][], timeMs: number): Uint8Array<ArrayBuffer> {
  const ts = Math.floor(timeMs) & 0x1fff;
  const timestamp = 0x80 | (ts & 0x7f);
  const bytes = [0x80 | (ts >> 7)];
  for (const m of messages) bytes.push(timestamp, ...m);
  return Uint8Array.from(bytes);
}
