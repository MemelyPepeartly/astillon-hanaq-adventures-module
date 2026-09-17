import fs from "node:fs";
import path from "node:path";
import { decompressFrames, parseGIF } from "gifuct-js";
import { PNG } from "pngjs";

/** Decode GIF patches into complete RGBA frames before packing the animation. */
export function decodeGifFrames(bytes) {
  const gif = parseGIF(bytes);
  const { width, height } = gif.lsd;
  const decoded = decompressFrames(gif, true);
  if (!width || !height || decoded.length === 0) {
    throw new Error("The animation GIF must contain at least one nonempty frame.");
  }

  const canvas = Buffer.alloc(width * height * 4);
  const background = (frame) => {
    // Transparent GIFs use the page/canvas background, not an opaque palette color.
    if (frame.transparentIndex !== undefined) return [0, 0, 0, 0];
    const color = gif.gct?.[gif.lsd.backgroundColorIndex];
    return color ? [...color, 255] : [0, 0, 0, 0];
  };
  const fillRectangle = (dims, color) => {
    for (let y = dims.top; y < Math.min(height, dims.top + dims.height); y++) {
      for (let x = dims.left; x < Math.min(width, dims.left + dims.width); x++) {
        canvas.set(color, (y * width + x) * 4);
      }
    }
  };
  fillRectangle({ top: 0, left: 0, width, height }, background(decoded[0]));

  const frames = [];
  for (const frame of decoded) {
    const previous = frame.disposalType === 3 ? Buffer.from(canvas) : undefined;
    const { dims, patch } = frame;
    for (let y = 0; y < dims.height && y + dims.top < height; y++) {
      for (let x = 0; x < dims.width && x + dims.left < width; x++) {
        const source = (y * dims.width + x) * 4;
        // A transparent patch pixel leaves the previous canvas pixel in place.
        if (patch[source + 3] === 0) continue;
        const destination = ((y + dims.top) * width + x + dims.left) * 4;
        canvas.set(patch.subarray(source, source + 4), destination);
      }
    }
    frames.push({ data: Buffer.from(canvas), duration: frame.delay || 100 });

    // Disposal is applied after capturing the displayed frame, before its successor.
    if (frame.disposalType === 2) fillRectangle(dims, background(frame));
    else if (previous) previous.copy(canvas);
  }
  return { width, height, frames };
}

/** Keep animation decoding out of Foundry: ship a PNG atlas and frame timing data. */
export function buildGifAssets(source, destination, basename = "menacing") {
  const { width, height, frames } = decodeGifFrames(fs.readFileSync(source));
  const padding = 2;
  const cellWidth = width + padding * 2;
  const cellHeight = height + padding * 2;
  const columns = Math.min(frames.length, Math.ceil(Math.sqrt((frames.length * cellHeight) / cellWidth)));
  const rows = Math.ceil(frames.length / columns);
  const atlas = new PNG({ width: columns * cellWidth, height: rows * cellHeight });
  const metadata = {
    width: atlas.width,
    height: atlas.height,
    frameWidth: width,
    frameHeight: height,
    frames: [],
  };

  for (let index = 0; index < frames.length; index++) {
    const x = (index % columns) * cellWidth + padding;
    const y = Math.floor(index / columns) * cellHeight + padding;
    const frame = frames[index];
    for (let row = 0; row < height; row++) {
      const sourceOffset = row * width * 4;
      frame.data.copy(atlas.data, ((y + row) * atlas.width + x) * 4, sourceOffset, sourceOffset + width * 4);
    }
    metadata.frames.push({ x, y, w: width, h: height, duration: frame.duration });
  }

  const icon = new PNG({ width, height });
  const firstVisibleFrame = frames.find(({ data }) => {
    for (let index = 3; index < data.length; index += 4) {
      if (data[index] !== 0) return true;
    }
    return false;
  });
  if (!firstVisibleFrame) throw new Error("The animation GIF contains no visible pixels.");
  firstVisibleFrame.data.copy(icon.data);

  fs.mkdirSync(destination, { recursive: true });
  fs.writeFileSync(path.join(destination, `${basename}.png`), PNG.sync.write(atlas));
  fs.writeFileSync(path.join(destination, `${basename}-icon.png`), PNG.sync.write(icon));
  fs.writeFileSync(path.join(destination, `${basename}.json`), `${JSON.stringify(metadata, null, 2)}\n`);
  return metadata;
}
