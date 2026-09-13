#!/usr/bin/env node
/**
 * Packs a frame-sequence animation (public/animations/<name>/<label>-<n>.png,
 * the convention documented in progress-tracker.md's Environment Notes) into
 * a single sprite-sheet PNG plus a JSON manifest, so the browser fetches one
 * cacheable file instead of one request per frame.
 *
 * Usage:
 *   npm run sprites:build -- <name>
 *   node scripts/build-sprites.mjs <name>
 *
 * Output (public/sprites/):
 *   <name>.<contenthash8>.png  — frames arranged in a roughly square grid,
 *                                row-major, frame 1 at the top-left. The hash
 *                                is deterministic (same input -> same hash),
 *                                so it's safe to cache the file forever.
 *   <name>.json                — { image, frameWidth, frameHeight, columns,
 *                                rows, frameCount }. Stable filename (safe to
 *                                import directly), always points at the
 *                                current hashed PNG.
 *
 * A component reading the manifest must trust its columns/rows rather than
 * recomputing them, so the layout can only ever be defined in one place.
 *
 * Frames are downscaled before packing, if needed, to keep the whole sheet
 * under MAX_SHEET_DIMENSION per side (see below). These animations render
 * inline at roughly text-glyph size, so source art exported at ~1100px is
 * far higher resolution than ever gets displayed — but the full sheet is
 * still what the browser decodes and repaints on every frame change
 * (background-position isn't compositor-only, unlike transform). A frame
 * count high enough to produce a large grid (e.g. 77 frames -> 9x9) turns
 * that into a sheet tens of thousands of pixels wide, which can exceed a
 * GPU's max texture size and force slow software rasterization for the
 * whole page, not just the animated element. The cap is on the *sheet's*
 * dimensions rather than a fixed per-frame size so it stays safe regardless
 * of how many frames a future animation has. Source files under
 * public/animations/<name>/ are never modified — only the packed copy is
 * resized.
 */

import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import sharp from "sharp";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

const FRAME_NAME_PATTERN = /^(.+)-(\d+)\.png$/;

// Comfortable margin under the lowest common GPU max-texture-size (4096px
// per side on many mobile/older GPUs) so a packed sheet never risks the
// software-rasterization fallback that causes page-wide jank.
const MAX_SHEET_DIMENSION = 3600;

async function main() {
  const name = process.argv[2];
  if (!name) {
    console.error("Usage: node scripts/build-sprites.mjs <animation-folder-name>");
    console.error("Example: node scripts/build-sprites.mjs hero-here");
    process.exitCode = 1;
    return;
  }

  const inputDir = path.join(repoRoot, "public", "animations", name);
  const outputDir = path.join(repoRoot, "public", "sprites");

  const sourceFrames = await loadFrameSequence(inputDir);
  console.log(`Found ${sourceFrames.length} frames in public/animations/${name}/`);

  const sourceSize = await validateUniformSize(sourceFrames);
  console.log(`Source frame size: ${sourceSize.width}x${sourceSize.height}`);

  const columns = Math.ceil(Math.sqrt(sourceFrames.length));
  const rows = Math.ceil(sourceFrames.length / columns);
  console.log(`Grid: ${columns} columns x ${rows} rows`);

  const { frames, frameWidth, frameHeight } = await downscaleFrames(
    sourceFrames,
    sourceSize,
    { columns, rows, maxSheetDimension: MAX_SHEET_DIMENSION },
  );
  if (frameWidth !== sourceSize.width) {
    console.log(`Downscaled to ${frameWidth}x${frameHeight} for packing (source frames untouched)`);
  }

  const spritePng = await compositeSprite(frames, { frameWidth, frameHeight, columns, rows });
  const hash = createHash("sha256").update(spritePng).digest("hex").slice(0, 8);

  await mkdir(outputDir, { recursive: true });
  await removeStaleOutputs(outputDir, name);

  const imagePath = `${name}.${hash}.png`;
  await writeFile(path.join(outputDir, imagePath), spritePng);

  const manifest = {
    image: `/sprites/${imagePath}`,
    frameWidth,
    frameHeight,
    columns,
    rows,
    frameCount: frames.length,
  };
  await writeFile(path.join(outputDir, `${name}.json`), JSON.stringify(manifest, null, 2) + "\n");

  console.log(`Wrote public/sprites/${imagePath}`);
  console.log(`Wrote public/sprites/${name}.json`);
}

/** Reads and sorts the `<label>-<n>.png` sequence, verifying it is contiguous from 1. */
async function loadFrameSequence(inputDir) {
  const entries = await readdir(inputDir);
  const parsed = [];

  for (const entry of entries) {
    const match = entry.match(FRAME_NAME_PATTERN);
    if (!match) continue;
    parsed.push({ file: entry, frameNumber: Number(match[2]) });
  }

  if (parsed.length === 0) {
    throw new Error(`No "<label>-<n>.png" frames found in ${inputDir}`);
  }

  parsed.sort((a, b) => a.frameNumber - b.frameNumber);

  for (let i = 0; i < parsed.length; i++) {
    const expected = i + 1;
    if (parsed[i].frameNumber !== expected) {
      throw new Error(
        `Frame sequence is not contiguous from 1: expected frame ${expected}, found ${parsed[i].frameNumber} (${parsed[i].file}).`,
      );
    }
  }

  return Promise.all(
    parsed.map(async ({ file, frameNumber }) => ({
      frameNumber,
      buffer: await readFile(path.join(inputDir, file)),
    })),
  );
}

/** Every frame must share one intrinsic size, or grid placement math breaks. */
async function validateUniformSize(frames) {
  const sizes = await Promise.all(
    frames.map(async (frame) => {
      const metadata = await sharp(frame.buffer).metadata();
      return { frameNumber: frame.frameNumber, width: metadata.width, height: metadata.height };
    }),
  );

  const { width, height } = sizes[0];
  const mismatch = sizes.find((size) => size.width !== width || size.height !== height);
  if (mismatch) {
    throw new Error(
      `Frame ${mismatch.frameNumber} is ${mismatch.width}x${mismatch.height}, expected ${width}x${height} (from frame 1). All frames must be the same size.`,
    );
  }

  return { width, height };
}

/**
 * Shrinks every frame (preserving aspect ratio) just enough that the packed
 * sheet — `columns * frameWidth` by `rows * frameHeight` — fits within
 * `maxSheetDimension` on both sides. Never upscales: a source already small
 * enough (few frames, or already-small art) passes through untouched.
 */
async function downscaleFrames(frames, { width, height }, { columns, rows, maxSheetDimension }) {
  const scale = Math.min(1, maxSheetDimension / (columns * width), maxSheetDimension / (rows * height));
  if (scale >= 1) {
    return { frames, frameWidth: width, frameHeight: height };
  }

  const frameWidth = Math.round(width * scale);
  const frameHeight = Math.round(height * scale);

  const scaledFrames = await Promise.all(
    frames.map(async ({ frameNumber, buffer }) => ({
      frameNumber,
      buffer: await sharp(buffer).resize(frameWidth, frameHeight).png().toBuffer(),
    })),
  );

  return { frames: scaledFrames, frameWidth, frameHeight };
}

async function compositeSprite(frames, { frameWidth, frameHeight, columns, rows }) {
  const composites = frames.map(({ frameNumber, buffer }) => {
    const index = frameNumber - 1;
    const col = index % columns;
    const row = Math.floor(index / columns);
    return { input: buffer, left: col * frameWidth, top: row * frameHeight };
  });

  return sharp({
    create: {
      width: columns * frameWidth,
      height: rows * frameHeight,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite(composites)
    .png()
    .toBuffer();
}

/** Removes any previously generated sprite PNG for this name before writing the new one, so stale hashed files don't accumulate. */
async function removeStaleOutputs(outputDir, name) {
  const entries = await readdir(outputDir).catch(() => []);
  const stalePattern = new RegExp(`^${escapeRegExp(name)}\\.[0-9a-f]{8}\\.png$`);
  await Promise.all(
    entries
      .filter((entry) => stalePattern.test(entry))
      .map((entry) => rm(path.join(outputDir, entry))),
  );
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
