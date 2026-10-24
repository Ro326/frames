import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveShotGuide } from '../src/lib/shot-guides';

const resolve = (angle: string, movement: string, description = 'Film the subject.') =>
  resolveShotGuide({ angle, movement, description });

test('top-down food angle and static phone are separate instructions', () => {
  const guide = resolve('Top-down close-up', 'Static');
  assert.equal(guide.angle.kind, 'top-down');
  assert.equal(guide.movement.kind, 'static');
  assert.equal(guide.framing?.kind, 'close-up');
});

test('pan is rotation from a fixed spot, with left/right direction', () => {
  assert.equal(resolve('Eye-level', 'Slow pan left').movement.direction, 'left');
  const right = resolve('Eye-level', 'Pan left to right').movement;
  assert.equal(right.kind, 'pan');
  assert.equal(right.direction, 'right');
  assert.match(right.instruction, /Do not walk/);
});

test('tilt is distinct from changing camera height', () => {
  const guide = resolve('Low angle', 'Tilt down slowly');
  assert.equal(guide.angle.kind, 'low-angle');
  assert.equal(guide.movement.kind, 'tilt');
  assert.equal(guide.movement.direction, 'down');
});

test('dolly zoom takes priority over dolly and zoom and has safety and an easier option', () => {
  const move = resolve('Medium', 'Dolly-zoom').movement;
  assert.equal(move.kind, 'dolly-zoom');
  assert.equal(move.advanced, true);
  assert.ok(move.alternative);
  assert.match(move.caution!, /spotter/);
});

test('zoom keeps the phone still, dolly physically moves it', () => {
  assert.equal(resolve('', 'Zoom in').movement.kind, 'zoom-in');
  assert.equal(resolve('', 'Zoom out').movement.kind, 'zoom-out');
  assert.equal(resolve('', 'Dolly in').movement.kind, 'dolly-in');
  assert.equal(resolve('', 'Pull back').movement.kind, 'dolly-out');
  assert.equal(resolve('', 'Walk slowly backward').movement.kind, 'dolly-out');
});

test('ambiguous pan out and combined moves are not taught as a different technique', () => {
  assert.equal(resolve('', 'Pan out').movement.kind, 'custom-movement');
  assert.equal(resolve('', 'Pan right while tilting up').movement.kind, 'custom-movement');
});

test('unknown wording falls back honestly rather than claiming an exact animation', () => {
  const guide = resolve('Dutch angle', 'Whip transition');
  assert.equal(guide.angle.kind, 'custom-angle');
  assert.equal(guide.movement.kind, 'custom-movement');
  assert.match(guide.angle.instruction, /no exact/i);
});

test('other common camera placements and moves are recognized', () => {
  assert.equal(resolve('POV', 'Follow the subject').angle.kind, 'pov');
  assert.equal(resolve('Over-the-shoulder', 'Handheld').angle.kind, 'over-shoulder');
  assert.equal(resolve('High angle', 'Orbit clockwise').angle.kind, 'high-angle');
  assert.equal(resolve('', 'Orbit clockwise').movement.kind, 'orbit');
  assert.equal(resolve('', 'Tracking').movement.kind, 'tracking');
  assert.equal(resolve('', 'Hand-held').movement.kind, 'handheld');
});

test('framing is independent of height and prefers the explicit angle field', () => {
  assert.equal(resolve('High angle, wide', 'Static', 'Close-up texture').framing?.kind, 'wide');
  assert.equal(resolve('Eye-level', 'Static', 'Macro detail of the leaves').framing?.kind, 'detail');
  assert.equal(resolve('Waist-up', 'Static').framing?.kind, 'medium');
});

test('editing a shot recalculates instructions without changing the supplied object', () => {
  const shot = { angle: 'Eye-level', movement: 'Static', description: 'The original subject' };
  assert.equal(resolveShotGuide(shot).movement.kind, 'static');
  shot.movement = 'Dolly out';
  assert.equal(resolveShotGuide(shot).movement.kind, 'dolly-out');
  assert.equal(shot.description, 'The original subject');
});
