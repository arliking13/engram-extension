/**
 * Engram — Minimal local ZIP writer (uncompressed / STORED method)
 * No compression. Supports text files and binary File/Blob objects.
 * Browser-only. No external dependencies.
 */

(function () {
  // CRC-32 lookup table (standard polynomial 0xEDB88320)
  const CRC_TABLE = (function () {
    const t = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let j = 0; j < 8; j++) {
        c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      }
      t[i] = c;
    }
    return t;
  })();

  function crc32(bytes) {
    let c = 0xFFFFFFFF;
    for (let i = 0; i < bytes.length; i++) {
      c = CRC_TABLE[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
    }
    return (c ^ 0xFFFFFFFF) >>> 0;
  }

  class ZipWriter {
    constructor() {
      this._entries = [];
    }

    // Add a UTF-8 text file.
    addText(name, text) {
      const data = new TextEncoder().encode(text);
      this._entries.push({ name, data });
    }

    // Add a binary File or Blob at the given zip path.
    async addFile(zipPath, file) {
      const buffer = await file.arrayBuffer();
      this._entries.push({ name: zipPath, data: new Uint8Array(buffer) });
    }

    // Build and return a Blob containing the complete ZIP archive.
    build() {
      const enc = new TextEncoder();
      const localParts = [];   // local file headers + data
      const centralParts = []; // central directory headers
      let localOffset = 0;     // running byte offset in the local section

      for (const entry of this._entries) {
        const nameBytes = enc.encode(entry.name);
        const data = entry.data;
        const checksum = crc32(data);
        const size = data.length;
        const nameLen = nameBytes.length;

        // ── Local file header (30 bytes + name) ──────────────────────
        const lh = new DataView(new ArrayBuffer(30 + nameLen));
        lh.setUint32(0,  0x04034b50, true); // signature PK\x03\x04
        lh.setUint16(4,  20,         true); // version needed: 2.0
        lh.setUint16(6,  0x0800,     true); // general flag: bit 11 = UTF-8 names
        lh.setUint16(8,  0,          true); // compression: STORED
        lh.setUint16(10, 0,          true); // last mod time
        lh.setUint16(12, 0,          true); // last mod date
        lh.setUint32(14, checksum,   true); // CRC-32
        lh.setUint32(18, size,       true); // compressed size
        lh.setUint32(22, size,       true); // uncompressed size
        lh.setUint16(26, nameLen,    true); // file name length
        lh.setUint16(28, 0,          true); // extra field length
        new Uint8Array(lh.buffer, 30).set(nameBytes);

        localParts.push(new Uint8Array(lh.buffer));
        localParts.push(data);

        // ── Central directory entry (46 bytes + name) ─────────────────
        const cd = new DataView(new ArrayBuffer(46 + nameLen));
        cd.setUint32(0,  0x02014b50, true); // signature PK\x01\x02
        cd.setUint16(4,  20,         true); // version made by
        cd.setUint16(6,  20,         true); // version needed
        cd.setUint16(8,  0x0800,     true); // general flag: UTF-8
        cd.setUint16(10, 0,          true); // compression: STORED
        cd.setUint16(12, 0,          true); // last mod time
        cd.setUint16(14, 0,          true); // last mod date
        cd.setUint32(16, checksum,   true); // CRC-32
        cd.setUint32(20, size,       true); // compressed size
        cd.setUint32(24, size,       true); // uncompressed size
        cd.setUint16(28, nameLen,    true); // file name length
        cd.setUint16(30, 0,          true); // extra field length
        cd.setUint16(32, 0,          true); // file comment length
        cd.setUint16(34, 0,          true); // disk number start
        cd.setUint16(36, 0,          true); // internal attributes
        cd.setUint32(38, 0,          true); // external attributes
        cd.setUint32(42, localOffset, true); // offset of local header
        new Uint8Array(cd.buffer, 46).set(nameBytes);

        centralParts.push(new Uint8Array(cd.buffer));
        localOffset += 30 + nameLen + size;
      }

      const centralSize = centralParts.reduce((s, c) => s + c.length, 0);

      // ── End of central directory record (22 bytes) ────────────────
      const eocd = new DataView(new ArrayBuffer(22));
      eocd.setUint32(0,  0x06054b50,           true); // signature PK\x05\x06
      eocd.setUint16(4,  0,                    true); // disk number
      eocd.setUint16(6,  0,                    true); // disk with CD start
      eocd.setUint16(8,  this._entries.length, true); // entries on this disk
      eocd.setUint16(10, this._entries.length, true); // total entries
      eocd.setUint32(12, centralSize,          true); // size of central directory
      eocd.setUint32(16, localOffset,          true); // offset of central directory
      eocd.setUint16(20, 0,                    true); // comment length

      return new Blob(
        [...localParts, ...centralParts, new Uint8Array(eocd.buffer)],
        { type: "application/zip" }
      );
    }
  }

  window.ZipWriter = ZipWriter;
})();
