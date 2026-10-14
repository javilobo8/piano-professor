import { describe, expect, it } from 'vitest';
import { layoutKeyboard } from '../../src/render/keyboard-layout';
import { KeyboardInput } from '../../src/ui/keyboard-input';

function setup() {
  const target = new EventTarget();
  const canvas = { addEventListener() {}, removeEventListener() {} } as unknown as HTMLCanvasElement;
  const events: string[] = [];
  const surface = () => ({ layout: layoutKeyboard(48, 72, 800), cssWidth: 800, cssHeight: 600 });
  const input = new KeyboardInput(canvas, surface, (type, pitch) => events.push(`${type} ${pitch}`), target);
  const detach = input.attach();
  const key = (type: 'keydown' | 'keyup', code: string, repeat = false) =>
    target.dispatchEvent(
      Object.assign(new Event(type), { code, repeat, ctrlKey: false, metaKey: false, altKey: false }),
    );
  return { target, events, key, detach, input };
}

describe('KeyboardInput (PC keys)', () => {
  it('plays on keydown and releases on keyup, ignoring repeats', () => {
    const { events, key } = setup();
    key('keydown', 'KeyA');
    key('keydown', 'KeyA', true);
    key('keyup', 'KeyA');
    expect(events).toEqual(['on 60', 'off 60']);
  });

  it('shifts the octave with X', () => {
    const { events, key } = setup();
    key('keydown', 'KeyX');
    key('keydown', 'KeyA');
    expect(events).toEqual(['on 72']);
  });

  it('releases every held key on blur', () => {
    const { target, events, key } = setup();
    key('keydown', 'KeyA');
    key('keydown', 'KeyS');
    target.dispatchEvent(new Event('blur'));
    expect(events).toEqual(['on 60', 'on 62', 'off 60', 'off 62']);
    key('keyup', 'KeyA');
    expect(events).toHaveLength(4);
  });

  it('releaseAll emits off for every held key and forgets them', () => {
    const { input, events, key } = setup();
    key('keydown', 'KeyA');
    key('keydown', 'KeyS');
    input.releaseAll();
    expect(events).toEqual(['on 60', 'on 62', 'off 60', 'off 62']);
    key('keyup', 'KeyA');
    input.releaseAll();
    expect(events).toHaveLength(4);
  });

  it('releases everything on cleanup', () => {
    const { events, key, detach } = setup();
    key('keydown', 'KeyA');
    detach();
    expect(events).toEqual(['on 60', 'off 60']);
  });
});
