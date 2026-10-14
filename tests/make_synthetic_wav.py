"""Generate a small, deterministic stereo test mix. No private audio is used."""
import math
import struct
import wave
from pathlib import Path

rate = 48_000
seconds = 4
output = Path(__file__).parent / "fixtures" / "synthetic-mix.wav"
output.parent.mkdir(parents=True, exist_ok=True)
with wave.open(str(output), "wb") as wav:
    wav.setnchannels(2)
    wav.setsampwidth(2)
    wav.setframerate(rate)
    frames = bytearray()
    for i in range(rate * seconds):
        t = i / rate
        base = 220 if t < 1 else 246.94 if t < 2 else 293.66 if t < 3 else 329.63
        l = 0.19 * math.sin(2 * math.pi * base * t) + 0.08 * math.sin(2 * math.pi * (base * 1.5) * t)
        r = 0.17 * math.sin(2 * math.pi * base * t) + 0.09 * math.sin(2 * math.pi * (base * 2) * t)
        frames.extend(struct.pack("<hh", int(max(-1, min(1, l)) * 32767), int(max(-1, min(1, r)) * 32767)))
    wav.writeframes(frames)
print(output)
