#!/usr/bin/env python3
"""Writes a minimal valid NROM-128 iNES ROM (infinite loop at $C000) for smoke tests."""
import sys
hdr = bytes([0x4E, 0x45, 0x53, 0x1A, 1, 1, 0, 0]) + bytes(8)
prg = bytearray([0xEA] * 0x4000)
prg[0:3] = bytes([0x4C, 0x00, 0xC0])                           # JMP $C000
prg[0x3FFA:0x4000] = bytes([0x00, 0xC0, 0x00, 0xC0, 0x00, 0xC0])  # NMI/RESET/IRQ vectors
open(sys.argv[1], "wb").write(hdr + bytes(prg) + bytes(0x2000))
