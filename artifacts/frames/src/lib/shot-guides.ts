export type TechniqueId =
  | 'static' | 'pan' | 'tilt' | 'dolly-in' | 'dolly-out'
  | 'zoom-in' | 'zoom-out' | 'dolly-zoom' | 'orbit' | 'tracking' | 'handheld'
  | 'top-down' | 'high-angle' | 'low-angle' | 'eye-level' | 'pov' | 'over-shoulder'
  | 'wide' | 'medium' | 'close-up' | 'detail' | 'custom-angle' | 'custom-movement';

export interface GuideCue {
  kind: TechniqueId;
  title: string;
  instruction: string;
  steps: string[];
  caution?: string;
  alternative?: string;
  advanced?: boolean;
  direction?: 'left' | 'right' | 'up' | 'down';
}

export interface GuideShot {
  description: string;
  angle: string;
  movement: string;
  props?: string[];
}

const cue = (
  kind: TechniqueId, title: string, instruction: string,
  steps: string[], extras: Partial<GuideCue> = {},
): GuideCue => ({ kind, title, instruction, steps, ...extras });

function normalize(text: string): string {
  return text.toLowerCase().replace(/[–—_-]/g, ' ').replace(/\s+/g, ' ').trim();
}

function movementGuide(value: string): GuideCue {
  const text = normalize(value);
  const direction = /\bleft\b/.test(text) && !/\bright\b/.test(text) ? 'left' : 'right';
  // "Pan out" is ambiguous, and combined moves cannot be faithfully taught by
  // showing just one of their components. Do not silently substitute a zoom.
  const ambiguous = /\bpan (?:in|out)\b/.test(text);
  const compound = /\bpan\b/.test(text) && /\btilt|dolly|zoom|orbit|track\b/.test(text);
  if (ambiguous || compound) {
    return cue('custom-movement', 'Clarify this movement',
      ambiguous
        ? '“Pan out” can mean two different things: move the phone farther away, or stay still and zoom out.'
        : 'This combines several movements. Practise each one separately before putting them together.',
      ambiguous
        ? ['To reveal more space naturally, step back slowly (dolly out).', 'To change only the crop, keep the phone still and zoom out.']
        : ['Read the planned movement below.', 'Break it into one simple move at a time, and record a steady version first.'],
      { caution: 'No exact animation is shown for this wording. Check which movement you intend before filming.' });
  }
  if (/\bdolly zoom\b|\bzolly\b|\bvertigo (?:shot|effect)\b/.test(text)) {
    return cue('dolly-zoom', 'Move back + zoom in',
      'Move backward while zooming in so your subject stays about the same size. The background changes size instead.',
      ['Choose a subject with space behind them and note their size on screen.', 'On a clear, level path, move slowly backward while increasing zoom.', 'Keep the subject the same size and centred; rehearse before recording.'],
      { advanced: true, caution: 'Do not walk backward near roads, stairs or obstacles. Use a spotter; phone zoom controls may not be smooth.',
        alternative: 'Easier: stand still and make a slow zoom in, or record a simple steady close-up.' });
  }
  if (/\b(?:zoom|punch)\s*(?:in|into)\b/.test(text)) {
    return cue('zoom-in', 'Stay still + zoom in', 'Keep the phone in one place and slowly tighten the view with the zoom control.',
      ['Stand still and brace both hands.', 'Slowly increase zoom while keeping your subject centred.', 'Stop before the image looks grainy.'],
      { caution: 'Zoom changes the crop; it does not move the phone toward your subject.' });
  }
  if (/\bzoom\s*(?:out|back)\b/.test(text)) {
    return cue('zoom-out', 'Stay still + zoom out', 'Keep the phone in one place and slowly widen the view with the zoom control.',
      ['Start with a tighter view.', 'Keep your phone still as you decrease zoom.', 'Finish with enough room around the subject.']);
  }
  if (/\bdolly (?:out|back|away)\b|\bpull (?:back|out|away)\b|\b(?:move|walk|step|track)\s+(?:slowly\s+)?(?:back|backward|backwards|away)\b/.test(text)) {
    return cue('dolly-out', 'Move the phone back', 'Move the whole phone away from your subject without changing zoom.',
      ['Frame the subject fairly close.', 'Check the space behind you; use a spotter if moving backward.', 'Move slowly away, keeping the phone height and direction steady.'],
      { caution: 'Only move on a clear, level path. The subject should get smaller as more surroundings appear.' });
  }
  if (/\bdolly (?:in|forward|toward)\b|\bpush (?:in|forward)\b|\b(?:move|walk|step|track)\s+(?:slowly\s+)?(?:forward|forwards|toward|closer)\b/.test(text)) {
    return cue('dolly-in', 'Move the phone closer', 'Move the whole phone toward your subject without changing zoom.',
      ['Start with a little space around the subject.', 'Hold the phone with both hands and take slow, small steps.', 'Stop before the subject gets cut off.'],
      { caution: 'Keep your zoom fixed; moving the phone makes the subject and perspective change naturally.' });
  }
  if (/\borbit|arc\b|\bcircle (?:around|the)\b/.test(text)) {
    return cue('orbit', 'Circle around the subject', 'Move in a small arc around the subject while keeping the phone pointed at them.',
      ['Choose a clear path and keep the same distance.', 'Take slow sideways steps around the subject.', 'Turn the phone gently to keep the subject centred.'],
      { caution: 'A short quarter-circle is easier and safer than a full circle.', direction });
  }
  if (/\bpan(?:ning)?\b/.test(text)) {
    return cue('pan', `Turn the phone ${direction}`, 'Stay in one place and turn the phone sideways. Do not walk or change zoom.',
      ['Plant your feet and hold the phone with both hands.', `Turn your upper body slowly to the ${direction}.`, 'Keep the horizon level and pause at the start and end.'], { direction });
  }
  if (/\btilt(?:ing)?\b/.test(text)) {
    const vertical = /\bdown\b/.test(text) ? 'down' : 'up';
    return cue('tilt', `Tip the phone ${vertical}`, 'Keep the phone in one place and change where it points vertically.',
      ['Stand still and keep the phone at a fixed height.', `Slowly tip the phone ${vertical}, rather than raising or lowering your arms.`, 'Pause briefly before and after the movement.'], { direction: vertical });
  }
  if (/\btrack(?:ing)?\b|\bfollow\b|\bsideways\b|\btruck\b|\bslide\b|\blateral\b/.test(text)) {
    return cue('tracking', 'Move alongside the subject', 'Move along with the subject, keeping roughly the same distance and framing.',
      ['Choose a clear path beside the subject.', 'Match their pace using small, soft steps.', 'Keep the subject in the same part of the screen.'],
      { caution: 'Watch your surroundings, not only the phone screen.', direction });
  }
  if (/\bhand\s?held\b/.test(text)) {
    return cue('handheld', 'Hold it steady by hand', 'Use both hands and tuck your elbows in to reduce shake.',
      ['Stand with feet comfortably apart.', 'Hold the phone with two hands and relax your shoulders.', 'Breathe gently and avoid sudden movements.']);
  }
  if (!text || /\bstatic\b|\bstill\b|\blocked\b|\btripod\b|\bno movement\b|\bstationary\b|\bfixed\b/.test(text)) {
    return cue('static', 'Keep the phone still', 'Fix your phone in one position and let the action happen inside the frame.',
      ['Rest the phone on a tripod or stable support.', 'Check the edges of your frame before recording.', 'Hold the same framing for the whole shot.']);
  }
  return cue('custom-movement', 'A custom camera move',
    'This movement does not have a precise built-in animation yet. Use the original instruction below rather than assuming a different move.',
    ['Read the planned movement and rehearse slowly.', 'If you are unsure, record a steady version first.'],
    { alternative: 'A safe fallback is a stationary phone with the subject moving inside the frame.' });
}

function angleGuide(value: string): GuideCue {
  const text = normalize(value);
  if (/\btop down\b|\boverhead\b|\bbird'?s? eye\b|\bflat lay\b|\b90\s*(?:°|degree)/.test(text)) {
    return cue('top-down', 'Phone above, pointing down', 'Place the phone directly above the subject with its lens pointing straight down.',
      ['Lay out the subject with some space around it.', 'Hold or mount the phone above the centre, with the screen level.', 'Check that your hands and phone do not cast a shadow.'],
      { caution: 'Secure overhead mounts. Never balance a phone where it could fall on someone or hot food.' });
  }
  if (/\blow angle\b|\bworm'?s? eye\b|\bground level\b|\bfrom below\b/.test(text)) {
    return cue('low-angle', 'Phone low, pointing up', 'Lower the phone below the subject’s eye level and point it slightly upward.',
      ['Crouch or lower the phone instead of tilting from eye level.', 'Tip the lens upward toward the subject.', 'Keep faces and important details inside the frame.']);
  }
  if (/\bhigh angle\b|\bfrom above\b|\b45\s*(?:°|degree)/.test(text)) {
    return cue('high-angle', 'Phone high, pointing down', 'Raise the phone above the subject and point it down at a gentle angle.',
      ['Hold the phone above the subject’s eye level.', 'Point it down without going completely overhead.', 'Leave room around the subject so nothing important is cut off.']);
  }
  if (/\bover (?:the )?shoulder\b|\bots\b/.test(text)) {
    return cue('over-shoulder', 'Look past a shoulder', 'Place the phone behind and just to one side of a person so their shoulder edges into the view.',
      ['Stand behind the person and slightly to one side.', 'Include a little shoulder, not the whole back of their head.', 'Aim at what they are looking at.']);
  }
  if (/\bpov\b|\bpoint of view\b|\bfirst person\b/.test(text)) {
    return cue('pov', 'Show what you see', 'Point the phone at the action as though the viewer is looking through your eyes.',
      ['Hold the phone close to your eye height, or your working viewpoint.', 'Aim at what you are doing; hands can appear in the lower frame.', 'Keep the lens clear and avoid covering it with a finger.']);
  }
  if (!text || /\beye level\b|\bstraight on\b|\bfront\b|\bside\b|\bprofile\b|\bwide\b|\bmedium\b|\bclose\b|\bdetail\b|\bestablishing\b/.test(text)) {
    const side = /\bside\b|\bprofile\b/.test(text);
    return cue('eye-level', side ? 'Level with the subject, from the side' : 'Level with the subject',
      side ? 'Move beside the subject, keeping the lens at their eye or object height.' : 'Keep the lens at the subject’s eye height, or at the same height as the object.',
      ['Set the phone height before recording.', side ? 'Face the side of the subject rather than the front.' : 'Keep the phone upright and the horizon level.', 'Leave a little space around the subject.']);
  }
  return cue('custom-angle', 'Follow your planned angle',
    'There is no exact built-in diagram for this angle yet. The original shot wording is your reference.',
    ['Read the planned angle below.', 'Set the phone height and direction, then check the screen before recording.']);
}

function framingGuide(angle: string, description: string): GuideCue | null {
  const classify = (value: string) => {
    const text = normalize(value);
    if (/\bextreme close\b|\bmacro\b|\bdetail\b|\becu\b/.test(text)) return 'detail';
    if (/\bclose up\b|\bcloseup\b|\bcu\b|\btight\b/.test(text)) return 'close-up';
    if (/\bmedium\b|\bmid shot\b|\bwaist up\b/.test(text)) return 'medium';
    if (/\bwide\b|\bfull body\b|\bestablishing\b|\blong shot\b/.test(text)) return 'wide';
    return null;
  };
  const kind = classify(angle) ?? classify(description);
  if (kind === 'detail') return cue('detail', 'Fill the view with one detail',
    'Show one small feature clearly rather than trying to fit in the whole subject.',
    ['Choose the important detail.', 'Move close enough to see it clearly, but keep it in focus.', 'Tap the detail on your screen to focus.']);
  if (kind === 'close-up') return cue('close-up', 'Bring the subject close',
    'Fill most of the view with the face, object or action that matters.',
    ['Move closer or choose a tighter crop.', 'Keep the important parts visible at the edges.', 'Tap your subject on the screen to focus.']);
  if (kind === 'medium') return cue('medium', 'Show the subject and their action',
    'For a person, frame roughly from the waist up. For objects, include a little surrounding space.',
    ['Keep the main action near the centre.', 'Leave headroom and space for hands or movement.', 'Check that the action stays inside the view.']);
  if (kind === 'wide') return cue('wide', 'Show the whole scene',
    'Step back enough to show the full subject and some of their surroundings.',
    ['Include the subject from head to toe, or the whole object.', 'Leave room for the action to move.', 'Check the corners for distractions.']);
  return null;
}

export function resolveShotGuide(shot: GuideShot): {
  angle: GuideCue; movement: GuideCue; framing: GuideCue | null; description: string;
} {
  return {
    angle: angleGuide(shot.angle),
    movement: movementGuide(shot.movement),
    framing: framingGuide(shot.angle, shot.description),
    description: shot.description,
  };
}
