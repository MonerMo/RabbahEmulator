/// <reference types="node" />
import * as fs from 'fs';
import * as path from 'path';

/**
 * The task's rule: byte layouts live in the codec's spec table and nowhere else.
 * This test walks every .ts/.tsx file of the app outside src/device/codec/ and fails on a literal like 0x13.
 */
const ROOT = path.resolve(__dirname, '..', '..', '..', '..');          // rn-app/
const CODEC_DIR = path.resolve(__dirname, '..');                       // rn-app/src/device/codec/
const SKIP = new Set(['node_modules', 'android', 'ios', '.git', 'vendor', 'build']);

function sources(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!SKIP.has(entry.name) && full !== CODEC_DIR) sources(full, out);
    } else if (/\.tsx?$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

test('no byte literal outside src/device/codec', () => {
  const offenders = sources(ROOT)
    .filter((f) => /\b0x[0-9a-f]{2}\b/i.test(fs.readFileSync(f, 'utf8')))
    .map((f) => path.relative(ROOT, f));
  expect(offenders).toEqual([]);
});
