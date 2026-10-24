import test from 'node:test';
import assert from 'node:assert/strict';
import { clipEncodingArgs, concatArgs, EXPORT_FORMATS, MAX_EXPORT_BYTES } from '../src/lib/mp4-settings';

test('normalises existing audio to stereo AAC and 720p H.264 MP4', () => {
  const args = clipEncodingArgs('source', 'clip-0.mp4', 4, true, 'portrait');
  assert.equal(args[args.indexOf('-t') + 1], '4');
  assert.equal(args[args.indexOf('-c:v') + 1], 'libx264');
  assert.equal(args[args.indexOf('-c:a') + 1], 'aac');
  assert.ok(args.includes('0:a:0'));
  assert.ok(!args.includes('anullsrc=r=48000:cl=stereo'));
  assert.match(args[args.indexOf('-vf') + 1]!, /scale=720:1280/);
  assert.match(args[args.indexOf('-vf') + 1]!, /force_original_aspect_ratio=decrease/);
  assert.match(args[args.indexOf('-vf') + 1]!, /pad=720:1280/);
});

test('silent clips receive a silent track instead of making export fail', () => {
  const args = clipEncodingArgs('source', 'clip-1.mp4', 2, false, 'landscape');
  assert.ok(args.includes('anullsrc=r=48000:cl=stereo'));
  assert.ok(args.includes('1:a:0'));
  assert.ok(args.includes('-shortest'));
  assert.match(args[args.indexOf('-vf') + 1]!, /scale=1280:720/);
});

test('square formatting is supported without cropping the source', () => {
  const args = clipEncodingArgs('source', 'square.mp4', 2, true, 'square');
  assert.match(args[args.indexOf('-vf') + 1]!, /pad=720:720/);
  assert.ok(!args.join(' ').includes('crop='));
  assert.equal(Object.keys(EXPORT_FORMATS).length, 3);
});

test('invalid durations cannot turn into unbounded encoding jobs', () => {
  for (const duration of [0, -1, NaN, Infinity, 601]) {
    assert.throws(() => clipEncodingArgs('source', 'clip.mp4', duration, true, 'portrait'));
  }
});

test('joins the ordered, already-normalised clips into a genuine MP4 container', () => {
  const args = concatArgs();
  assert.equal(args[args.indexOf('-f') + 1], 'concat');
  assert.equal(args[args.indexOf('-i') + 1], 'clips.txt');
  assert.equal(args[args.indexOf('-c') + 1], 'copy');
  assert.equal(args.at(-1), 'finished.mp4');
  assert.ok(args.includes('+faststart'));
  assert.equal(MAX_EXPORT_BYTES, 250 * 1024 * 1024);
});
