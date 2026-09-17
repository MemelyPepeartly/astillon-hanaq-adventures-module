import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { PNG } from "pngjs";
import { buildGifAssets, decodeGifFrames } from "../build/gif-assets.mjs";

const SOURCE = fileURLToPath(new URL("../src/assets/jojo_menace.gif", import.meta.url));

// A tiny, deliberately unoptimized GIF encoder for independent disposal fixtures.
// Reset the LZW dictionary before each pixel so every code remains three bits.
function fixture(frames) {
  const bytes = [
    ...Buffer.from("GIF89a"), 3, 0, 1, 0, 0x81, 0, 0,
    0, 0, 0, 255, 0, 0, 0, 255, 0, 0, 0, 255,
  ];
  for (const { left = 0, pixels, disposal = 1, delay = 10, transparent = true } of frames) {
    const codes = pixels.flatMap((pixel) => [4, pixel]).concat(5);
    const compressed = [];
    let bits = 0;
    let value = 0;
    for (const code of codes) {
      value |= code << bits;
      bits += 3;
      if (bits >= 8) {
        compressed.push(value & 255);
        value >>= 8;
        bits -= 8;
      }
    }
    if (bits) compressed.push(value);
    bytes.push(
      0x21, 0xf9, 4, (disposal << 2) | Number(transparent), delay, 0, 0, 0,
      0x2c, left, 0, 0, 0, pixels.length, 0, 1, 0, 0,
      2, compressed.length, ...compressed, 0,
    );
  }
  return Buffer.from([...bytes, 0x3b]);
}

const CLEAR = [0, 0, 0, 0];
const RED = [255, 0, 0, 255];
const GREEN = [0, 255, 0, 255];
const BLUE = [0, 0, 255, 255];

test("GIF patches retain transparent pixels and honor restore-background/previous disposal", () => {
  const { width, height, frames } = decodeGifFrames(fixture([
    { pixels: [1, 1, 1], delay: 7 },
    { left: 1, pixels: [2], disposal: 3, delay: 13 },
    { pixels: [3] },
    { left: 2, pixels: [0], disposal: 2 },
    { pixels: [2] },
  ]));
  assert.equal(width, 3);
  assert.equal(height, 1);
  assert.deepEqual(frames.map(({ duration }) => duration), [70, 130, 100, 100, 100]);
  assert.deepEqual(frames.map(({ data }) => [...data]), [
    [RED, RED, RED].flat(),
    [RED, GREEN, RED].flat(),
    [BLUE, RED, RED].flat(),
    [BLUE, RED, RED].flat(),
    [GREEN, RED, CLEAR].flat(),
  ]);
});

test("opaque GIF disposal restores its palette background", () => {
  const { frames } = decodeGifFrames(fixture([
    { pixels: [1, 1, 1], disposal: 2, transparent: false },
    { pixels: [2], transparent: false },
  ]));
  assert.deepEqual([...frames[1].data], [GREEN, [0, 0, 0, 255], [0, 0, 0, 255]].flat());
});

test("the supplied GIF produces an exact transparent atlas, timed frames, and static HUD icon", (t) => {
  const output = fs.mkdtempSync(path.join(os.tmpdir(), "astillon-gif-test-"));
  t.after(() => {
    assert.equal(path.dirname(path.resolve(output)), path.resolve(os.tmpdir()));
    assert.ok(path.basename(output).startsWith("astillon-gif-test-"));
    fs.rmSync(output, { recursive: true, force: true });
  });
  const decoded = decodeGifFrames(fs.readFileSync(SOURCE));
  const metadata = buildGifAssets(SOURCE, output);
  assert.equal(metadata.frameWidth, 493);
  assert.equal(metadata.frameHeight, 780);
  assert.equal(metadata.frames.length, 8);
  assert.equal(metadata.frames.reduce((sum, frame) => sum + frame.duration, 0), 800);
  assert.ok(metadata.width <= 2048 && metadata.height <= 2048);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(output, "menacing.json"), "utf8")), metadata);

  const atlas = PNG.sync.read(fs.readFileSync(path.join(output, "menacing.png")));
  assert.equal(atlas.width, metadata.width);
  assert.equal(atlas.height, metadata.height);
  for (let index = 0; index < metadata.frames.length; index++) {
    const { x, y, w, h } = metadata.frames[index];
    for (let row = 0; row < h; row++) {
      const offset = ((y + row) * atlas.width + x) * 4;
      assert.deepEqual(
        atlas.data.subarray(offset, offset + w * 4),
        decoded.frames[index].data.subarray(row * w * 4, (row + 1) * w * 4),
      );
    }
    assert.equal(atlas.data[(y * atlas.width + x - 1) * 4 + 3], 0);
  }
  const icon = PNG.sync.read(fs.readFileSync(path.join(output, "menacing-icon.png")));
  assert.deepEqual(icon.data, decoded.frames[0].data);
  assert.ok(icon.data.some((value, index) => index % 4 === 3 && value === 0));
  assert.ok(icon.data.some((value, index) => index % 4 === 3 && value === 255));
});
