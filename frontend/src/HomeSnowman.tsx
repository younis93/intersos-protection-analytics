import {useEffect, useRef} from 'react';
import {createPortal} from 'react-dom';
import atlas from './home-snowman.png';
import dragAtlas from './home-snowman-drag.png';
import gestureAtlas from './home-snowman-gestures.png';
import type {SnowmanCue} from './homeSnowmanAudio';

type Reaction = 'hat' | 'face' | 'belly';
const reactions = [['hat', 'Tap the snowman’s hat'], ['face', 'Poke the snowman’s face'], ['belly', 'Tickle the snowman’s belly']] as const;
const sheets = {
  original: {src: atlas, rows: 5},
  drag: {src: dragAtlas, rows: 3},
  gestures: {src: gestureAtlas, rows: 4},
};
const animations = {
  walk: {sheet: 'original', row: 0, frameMs: 200},
  magic: {sheet: 'original', row: 1, frameMs: 210},
  hat: {sheet: 'original', row: 2, frameMs: 240},
  face: {sheet: 'original', row: 3, frameMs: 240},
  belly: {sheet: 'original', row: 4, frameMs: 240},
  pickup: {sheet: 'drag', row: 0, frameMs: 190},
  falling: {sheet: 'drag', row: 1, frameMs: 0},
  landing: {sheet: 'drag', row: 2, frameMs: 165},
  breath: {sheet: 'gestures', row: 0, frameMs: 310},
  hatTip: {sheet: 'gestures', row: 1, frameMs: 275},
  jump: {sheet: 'gestures', row: 2, frameMs: 230},
  blush: {sheet: 'gestures', row: 3, frameMs: 290},
} as const;
type Animation = keyof typeof animations;
const patrolGestures = ['magic', 'breath', 'hatTip', 'jump', 'blush'] as const;
const canInterrupt = (animation: Animation) => animation === 'walk' || patrolGestures.some(gesture => gesture === animation);
const walkSpeed = 12;
const turnPauseMs = 550;

export default function HomeSnowman({playCue}: {playCue: (cue: SnowmanCue) => void}) {
  const strip = useRef<HTMLDivElement>(null);
  const actor = useRef<HTMLDivElement>(null);
  const sprite = useRef<HTMLDivElement>(null);
  const react = useRef<(reaction: Reaction) => void>(() => {});

  useEffect(() => {
    const stage = strip.current!;
    const character = actor.current!;
    const image = sprite.current!;
    const motion = matchMedia('(prefers-reduced-motion: reduce)');
    new Image().src = dragAtlas;
    new Image().src = gestureAtlas;
    let position = 0, limit = 0, direction = 1, frame = -1;
    let animation: Animation = 'walk';
    let elapsed = 0, walked = 0, previousTime = 0, request = 0;
    let nextGesture = 0;
    let turnPause = 0;
    let lift = 0, fallSpeed = 0, dropHeight = 0;
    let press: {id: number; x: number; y: number; dx: number; dy: number; since: number} | null = null;
    let suppressClick = false;

    function paint(nextFrame: number) {
      if (frame !== nextFrame) {
        frame = nextFrame;
        const {sheet, row} = animations[animation];
        const {src, rows} = sheets[sheet];
        image.style.backgroundImage = `url(${src})`;
        image.style.backgroundSize = `600% ${rows * 100}%`;
        image.style.backgroundPosition = `${frame * 20}% ${row * 100 / (rows - 1)}%`;
      }
      character.style.transform = `translate(${Math.round(position)}px, ${-Math.round(lift)}px)`;
      character.dataset.facing = direction === 1 ? 'right' : 'left';
    }

    function start(next: Animation) {
      animation = next;
      character.dataset.animation = next;
      frame = -1;
      elapsed = 0;
      paint(stillFrame());
      if (next !== 'walk') playCue(next);
    }

    function stillFrame() {
      if (!motion.matches || animation === 'walk') return 0;
      return animation === 'landing' ? 1 : 3;
    }

    function resize() {
      limit = Math.max(0, stage.clientWidth - character.offsetWidth);
      if (motion.matches && !press && lift === 0) position = limit / 2;
      else if (animation !== 'pickup' && animation !== 'falling') {
        position = Math.max(-stage.offsetLeft, Math.min(position, document.documentElement.clientWidth - stage.offsetLeft - character.offsetWidth));
      }
      paint(Math.max(0, frame));
    }

    function moveToPointer(x: number, y: number) {
      if (!press) return;
      const left = stage.getBoundingClientRect().left;
      const maxX = document.documentElement.clientWidth - character.offsetWidth;
      position = Math.max(0, Math.min(maxX, x - press.dx)) - left;
      lift = Math.max(24, Math.min(stage.getBoundingClientRect().top, stage.getBoundingClientRect().top - y + press.dy));
      paint(Math.max(0, frame));
    }

    function pickUp(x: number, y: number) {
      suppressClick = true;
      turnPause = 0;
      start('pickup');
      moveToPointer(x, y);
    }

    function pointerDown(event: PointerEvent) {
      if (event.button !== 0 || !event.isPrimary || press) return;
      suppressClick = false;
      if (!canInterrupt(animation)) return;
      const target = (event.target as Element).closest('button');
      if (!target) return;
      const bounds = character.getBoundingClientRect();
      press = {id: event.pointerId, x: event.clientX, y: event.clientY, dx: event.clientX - bounds.left, dy: event.clientY - bounds.top, since: performance.now()};
      target.setPointerCapture(event.pointerId);
    }

    function pointerMove(event: PointerEvent) {
      if (press?.id !== event.pointerId) return;
      if (animation === 'pickup') moveToPointer(event.clientX, event.clientY);
      else if (Math.hypot(event.clientX - press.x, event.clientY - press.y) >= 8) pickUp(event.clientX, event.clientY);
    }

    function land() {
      lift = 0;
      if (motion.matches) position = limit / 2;
      if (position < 0) direction = 1;
      if (position > limit) direction = -1;
      start('landing');
    }

    function release(event: PointerEvent) {
      if (press?.id !== event.pointerId) return;
      press = null;
      if (animation !== 'pickup') return;
      fallSpeed = 0;
      dropHeight = lift;
      if (motion.matches) land();
      else start('falling');
    }

    function click(event: MouseEvent) {
      if (event.detail && suppressClick) {
        event.stopPropagation();
        suppressClick = false;
      }
    }

    function tick(now: number) {
      const step = previousTime ? Math.min(50, now - previousTime) : 0;
      previousTime = now;
      if (press) {
        if (animation === 'pickup') {
          elapsed += step;
          if (!motion.matches) paint(Math.floor(elapsed / animations.pickup.frameMs) % 6);
        } else if (now - press.since >= 300) pickUp(press.x, press.y);
      } else if (animation === 'falling') {
        fallSpeed += step * 0.0022;
        lift -= fallSpeed * step;
        if (lift <= 0) land();
        else paint(Math.min(5, Math.floor(6 * (1 - lift / dropHeight))));
      } else if (animation !== 'walk') {
        elapsed += step;
        const {frameMs} = animations[animation];
        if (elapsed >= frameMs * 6) start('walk');
        else if (!motion.matches) paint(Math.floor(elapsed / frameMs));
      } else if (!motion.matches && limit > 0 && !character.querySelector(':focus-visible')) {
        if (turnPause > 0) {
          turnPause -= step;
          if (turnPause <= 0) {
            direction *= -1;
            paint(0);
          }
          request = requestAnimationFrame(tick);
          return;
        }
        walked += step;
        if (walked >= 8000) {
          walked = 0;
          start(patrolGestures[nextGesture]);
          nextGesture = (nextGesture + 1) % patrolGestures.length;
        } else {
          const distanceToEdge = direction > 0 ? limit - position : position;
          const speed = walkSpeed * Math.min(1, 0.5 + distanceToEdge / 32);
          if (distanceToEdge <= speed * step / 1000) {
            position = direction > 0 ? limit : 0;
            turnPause = turnPauseMs;
            elapsed = 0;
            paint(0);
          } else {
            position += direction * speed * step / 1000;
            elapsed += step;
            const next = Math.floor(elapsed / animations.walk.frameMs) % 6;
            if (frame !== next && (next === 1 || next === 4)) playCue('step');
            paint(next);
          }
        }
      }
      request = requestAnimationFrame(tick);
    }

    function syncVisibility() {
      cancelAnimationFrame(request);
      previousTime = 0;
      if (!document.hidden) request = requestAnimationFrame(tick);
      else if (press) {
        press = null;
        if (animation === 'pickup') land();
      }
    }

    function syncMotion() {
      resize();
      frame = -1;
      if (motion.matches && animation === 'falling') land();
      else paint(stillFrame());
    }

    react.current = reaction => {
      if (canInterrupt(animation)) start(reaction);
    };
    const observer = new ResizeObserver(resize);
    observer.observe(stage);
    resize();
    start('walk');
    syncVisibility();
    character.addEventListener('pointerdown', pointerDown);
    character.addEventListener('pointermove', pointerMove);
    character.addEventListener('pointerup', release);
    character.addEventListener('pointercancel', release);
    character.addEventListener('lostpointercapture', release);
    character.addEventListener('click', click, true);
    document.addEventListener('visibilitychange', syncVisibility);
    motion.addEventListener('change', syncMotion);
    return () => {
      react.current = () => {};
      cancelAnimationFrame(request);
      observer.disconnect();
      character.removeEventListener('pointerdown', pointerDown);
      character.removeEventListener('pointermove', pointerMove);
      character.removeEventListener('pointerup', release);
      character.removeEventListener('pointercancel', release);
      character.removeEventListener('lostpointercapture', release);
      character.removeEventListener('click', click, true);
      document.removeEventListener('visibilitychange', syncVisibility);
      motion.removeEventListener('change', syncMotion);
    };
  }, [playCue]);

  return createPortal(<div ref={strip} className="home-snowman-strip">
    <div ref={actor} className="home-snowman" role="group" aria-label="Snowman">
      <div ref={sprite} className="home-snowman-sprite" style={{backgroundImage: `url(${atlas})`}} aria-hidden="true"/>
      {reactions.map(([part, label]) => <button type="button" key={part} data-part={part} aria-label={label} onClick={() => react.current(part)}/>)}
    </div>
  </div>, document.body);
}
