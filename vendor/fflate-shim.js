function adler32(data) {
  var s1 = 1, s2 = 0;
  for (var i = 0; i < data.length; i++) {
    s1 = (s1 + data[i]) % 65521;
    s2 = (s2 + s1) % 65521;
  }
  return [s2 >>> 8, s2 & 0xff, s1 >>> 8, s1 & 0xff];
}

// Produces RFC 1950 zlib output using deflate stored blocks (no compression).
export function zlibSync(data) {
  var CHUNK = 65535;
  var chunks = Math.ceil(data.length / CHUNK) || 1;
  var out = new Uint8Array(2 + chunks * 5 + data.length + 4);
  // zlib header: CM=8 CINFO=7 (0x78), FCHECK=1 (0x01), no dict, default level
  out[0] = 0x78; out[1] = 0x01;
  var pos = 2, src = 0;
  for (var c = 0; c < chunks; c++) {
    var len = Math.min(CHUNK, data.length - src);
    out[pos++] = c === chunks - 1 ? 1 : 0; // BFINAL | (BTYPE=00 << 1)
    out[pos++] = len & 0xff;
    out[pos++] = (len >> 8) & 0xff;
    var nlen = (~len) & 0xffff;
    out[pos++] = nlen & 0xff;
    out[pos++] = (nlen >> 8) & 0xff;
    out.set(data.subarray ? data.subarray(src, src + len) : data.slice(src, src + len), pos);
    pos += len; src += len;
  }
  var chk = adler32(data);
  out[pos++] = chk[0]; out[pos++] = chk[1]; out[pos++] = chk[2]; out[pos++] = chk[3];
  return out;
}

// Decompresses RFC 1950 zlib data compressed with stored blocks (BTYPE=00).
export function unzlibSync(data) {
  var pos = 2, out = [];
  while (pos < data.length - 4) {
    var hdr = data[pos++];
    var bfinal = hdr & 1;
    var btype = (hdr >> 1) & 3;
    if (btype !== 0) break;
    var len = data[pos] | (data[pos + 1] << 8);
    pos += 4;
    for (var i = 0; i < len; i++) out.push(data[pos++]);
    if (bfinal) break;
  }
  return new Uint8Array(out);
}
