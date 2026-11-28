/*
 * Copies the three face-api weights the household screen uses into
 * public/face-models, so Hive serves them itself (src/hive/faces.js).
 * Runs before `vite` and `vite build`; the copies aren't committed.
 */
import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const from = join(dirname(require.resolve('@vladmandic/face-api/package.json')), 'model');
const to = join(dirname(new URL(import.meta.url).pathname), '..', 'public', 'face-models');
mkdirSync(to, { recursive: true });
for (const m of ['tiny_face_detector_model', 'face_landmark_68_tiny_model', 'face_recognition_model']) {
  for (const f of [`${m}-weights_manifest.json`, `${m}.bin`]) {
    if (!existsSync(join(from, f))) throw new Error(`face-api has no ${f}`);
    copyFileSync(join(from, f), join(to, f));
  }
}
console.log('face models copied to public/face-models');
