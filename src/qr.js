const DATA_CODEWORDS = [0, 19, 34, 55, 80, 108, 136, 156, 194, 232, 274];
const ECC_CODEWORDS = [0, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18];
const BLOCK_COUNTS = [0, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4];
const ALIGNMENT = [[], [], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34], [6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50]];

function multiply(left, right) {
  let result = 0;
  for (let bit = 7; bit >= 0; bit -= 1) {
    result = (result << 1) ^ ((result >>> 7) * 0x11d);
    result ^= ((right >>> bit) & 1) * left;
  }
  return result;
}

function divisor(degree) {
  const result = new Array(degree).fill(0);
  result[degree - 1] = 1;
  let root = 1;
  for (let index = 0; index < degree; index += 1) {
    for (let coefficient = 0; coefficient < result.length; coefficient += 1) {
      result[coefficient] = multiply(result[coefficient], root);
      if (coefficient + 1 < result.length) result[coefficient] ^= result[coefficient + 1];
    }
    root = multiply(root, 2);
  }
  return result;
}

function remainder(data, polynomial) {
  const result = new Array(polynomial.length).fill(0);
  for (const value of data) {
    const factor = value ^ result.shift();
    result.push(0);
    for (let index = 0; index < result.length; index += 1) result[index] ^= multiply(polynomial[index], factor);
  }
  return result;
}

function encodeData(bytes, version) {
  const capacity = DATA_CODEWORDS[version];
  const countBits = version <= 9 ? 8 : 16;
  const bits = [];
  const append = (value, length) => {
    for (let index = length - 1; index >= 0; index -= 1) bits.push((value >>> index) & 1);
  };
  append(0b0100, 4);
  append(bytes.length, countBits);
  for (const byte of bytes) append(byte, 8);
  append(0, Math.min(4, capacity * 8 - bits.length));
  while (bits.length % 8 !== 0) bits.push(0);
  const data = [];
  for (let index = 0; index < bits.length; index += 8) {
    let value = 0;
    for (let offset = 0; offset < 8; offset += 1) value = (value << 1) | bits[index + offset];
    data.push(value);
  }
  for (let padding = 0; data.length < capacity; padding += 1) data.push(padding % 2 ? 0x11 : 0xec);
  return data;
}

function interleave(data, version) {
  const count = BLOCK_COUNTS[version];
  const shortLength = Math.floor(data.length / count);
  const shortCount = count - data.length % count;
  const polynomial = divisor(ECC_CODEWORDS[version]);
  const blocks = [];
  let offset = 0;
  for (let index = 0; index < count; index += 1) {
    const length = shortLength + (index < shortCount ? 0 : 1);
    const part = data.slice(offset, offset + length);
    blocks.push({ data: part, ecc: remainder(part, polynomial) });
    offset += length;
  }
  const result = [];
  for (let index = 0; index < shortLength + 1; index += 1) {
    for (const block of blocks) if (index < block.data.length) result.push(block.data[index]);
  }
  for (let index = 0; index < polynomial.length; index += 1) {
    for (const block of blocks) result.push(block.ecc[index]);
  }
  return result;
}

export function qrMatrix(value) {
  const bytes = new TextEncoder().encode(String(value));
  const version = DATA_CODEWORDS.findIndex((capacity, candidate) => candidate > 0 && 4 + (candidate <= 9 ? 8 : 16) + bytes.length * 8 <= capacity * 8);
  if (version < 1) throw new RangeError("QR link is too long; use a shorter website address.");
  const size = version * 4 + 17;
  const matrix = Array.from({ length: size }, () => new Array(size).fill(false));
  const reserved = Array.from({ length: size }, () => new Array(size).fill(false));
  const set = (x, y, dark) => {
    if (x < 0 || y < 0 || x >= size || y >= size) return;
    matrix[y][x] = Boolean(dark);
    reserved[y][x] = true;
  };

  const finder = (centerX, centerY) => {
    for (let dy = -4; dy <= 4; dy += 1) {
      for (let dx = -4; dx <= 4; dx += 1) {
        const distance = Math.max(Math.abs(dx), Math.abs(dy));
        set(centerX + dx, centerY + dy, distance !== 2 && distance !== 4);
      }
    }
  };
  finder(3, 3);
  finder(size - 4, 3);
  finder(3, size - 4);

  for (let index = 8; index < size - 8; index += 1) {
    set(6, index, index % 2 === 0);
    set(index, 6, index % 2 === 0);
  }

  for (const x of ALIGNMENT[version]) {
    for (const y of ALIGNMENT[version]) {
      if (reserved[y][x]) continue;
      for (let dy = -2; dy <= 2; dy += 1) {
        for (let dx = -2; dx <= 2; dx += 1) set(x + dx, y + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
      }
    }
  }

  const format = 0x77c4;
  for (let index = 0; index <= 5; index += 1) set(8, index, (format >>> index) & 1);
  set(8, 7, (format >>> 6) & 1);
  set(8, 8, (format >>> 7) & 1);
  set(7, 8, (format >>> 8) & 1);
  for (let index = 9; index < 15; index += 1) set(14 - index, 8, (format >>> index) & 1);
  for (let index = 0; index < 8; index += 1) set(size - 1 - index, 8, (format >>> index) & 1);
  for (let index = 8; index < 15; index += 1) set(8, size - 15 + index, (format >>> index) & 1);
  set(8, size - 8, true);

  if (version >= 7) {
    let remainderBits = version;
    for (let index = 0; index < 12; index += 1) remainderBits = (remainderBits << 1) ^ ((remainderBits >>> 11) * 0x1f25);
    const versionBits = (version << 12) | remainderBits;
    for (let index = 0; index < 18; index += 1) {
      const bit = (versionBits >>> index) & 1;
      const x = size - 11 + index % 3;
      const y = Math.floor(index / 3);
      set(x, y, bit);
      set(y, x, bit);
    }
  }

  const codewords = interleave(encodeData(bytes, version), version);
  let bitIndex = 0;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vertical = 0; vertical < size; vertical += 1) {
      const upward = ((right + 1) & 2) === 0;
      const y = upward ? size - 1 - vertical : vertical;
      for (let offset = 0; offset < 2; offset += 1) {
        const x = right - offset;
        if (reserved[y][x]) continue;
        let dark = false;
        if (bitIndex < codewords.length * 8) dark = ((codewords[bitIndex >>> 3] >>> (7 - (bitIndex & 7))) & 1) !== 0;
        if ((x + y) % 2 === 0) dark = !dark;
        matrix[y][x] = dark;
        bitIndex += 1;
      }
    }
  }
  return matrix;
}

export function qrSvg(value, label = "QR") {
  const matrix = qrMatrix(value);
  const border = 4;
  const size = matrix.length + border * 2;
  let path = "";
  matrix.forEach((row, y) => row.forEach((dark, x) => {
    if (dark) path += `M${x + border},${y + border}h1v1h-1z`;
  }));
  const escaped = String(label).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll('"', "&quot;");
  return `<svg class="station-qr" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" role="img" aria-label="${escaped}"><rect width="100%" height="100%" fill="white"/><path d="${path}" fill="#142a24"/></svg>`;
}
