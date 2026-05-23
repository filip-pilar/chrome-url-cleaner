#!/usr/bin/env python3
"""
generate_icons.py — Creates icon16.png, icon48.png, icon128.png in ./icons/
Uses only Python stdlib (struct, zlib). No external dependencies.

Run once: python3 generate_icons.py
Commit the output. This script is kept for reproducibility but is not part
of the Chrome extension (not referenced in manifest.json).
"""

import os
import struct
import zlib

# Icon fill colour: #1a73e8 (Google blue)
R, G, B = 0x1A, 0x73, 0xE8


def make_png(size: int, r: int, g: int, b: int) -> bytes:
    """Return the bytes of a valid minimal RGB PNG of the given square size."""

    def chunk(tag: bytes, data: bytes) -> bytes:
        c = struct.pack('>I', len(data)) + tag + data
        crc = zlib.crc32(tag + data) & 0xFFFFFFFF
        return c + struct.pack('>I', crc)

    # PNG signature
    sig = b'\x89PNG\r\n\x1a\n'

    # IHDR: width, height, bit depth=8, colour type=2 (RGB), compression=0,
    #       filter=0, interlace=0
    ihdr_data = struct.pack('>IIBBBBB', size, size, 8, 2, 0, 0, 0)
    ihdr = chunk(b'IHDR', ihdr_data)

    # Build raw scanlines: each row is filter_byte(0x00) + size * (R, G, B)
    row = b'\x00' + bytes([r, g, b] * size)
    raw = row * size
    idat = chunk(b'IDAT', zlib.compress(raw, 9))

    iend = chunk(b'IEND', b'')

    return sig + ihdr + idat + iend


def main():
    out_dir = os.path.join(os.path.dirname(__file__), 'icons')
    os.makedirs(out_dir, exist_ok=True)

    for size in (16, 48, 128):
        path = os.path.join(out_dir, f'icon{size}.png')
        data = make_png(size, R, G, B)
        with open(path, 'wb') as f:
            f.write(data)
        print(f'  wrote {path} ({len(data)} bytes)')

    print('Done.')


if __name__ == '__main__':
    main()
