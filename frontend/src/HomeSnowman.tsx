import {useEffect, useRef} from 'react';
import {createPortal} from 'react-dom';
import atlas from './home-snowman.png';
import dragAtlas from './home-snowman-drag.png';
import gestureAtlas from './home-snowman-gestures.png';
import smoothAtlas from './home-snowman-40fps.webp';
import smoothDragAtlas from './home-snowman-drag-40fps.webp';
import smoothGestureAtlas from './home-snowman-gestures-40fps.webp';
import type {SnowmanCue} from './homeSnowmanAudio';

type Reaction = 'hat' | 'face' | 'belly';
const reactions = [['hat', 'Tap the snowman’s hat'], ['face', 'Poke the snowman’s face'], ['belly', 'Tickle the snowman’s belly']] as const;
const sheets = {
  original: {src: atlas, rows: 5, smoothSrc: smoothAtlas, smoothRows: 30},
  drag: {src: dragAtlas, rows: 3, smoothSrc: smoothDragAtlas, smoothRows: 15},
  gestures: {src: gestureAtlas, rows: 4, smoothSrc: smoothGestureAtlas, smoothRows: 20},
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
  pinch: {sheet: 'original', row: 3, frameMs: 0},
} as const;
type Animation = keyof typeof animations;
const patrolGestures = ['magic', 'breath', 'hatTip', 'jump', 'blush'] as const;
const canInterrupt = (animation: Animation) => animation === 'walk' || patrolGestures.some(gesture => gesture === animation);
const walkSpeed = 12;
const turnPauseMs = 550;
const pinchReturnMs = 420;
// Keep the grid and frame interval in sync with scripts/interpolate_snowman.py.
const spriteFrameMs = 1000 / 40;
const spriteColumns = 16;
const framesPerClip = 80;
const interactionFrames = 51;
const footRatio = 0.88;
type ShuffleSnow = (x: number, y: number, strength: number) => void;

export default function HomeSnowman({playCue, shuffleSnow}: {playCue: (cue: SnowmanCue) => void; shuffleSnow: ShuffleSnow}) {
  const strip = useRef<HTMLDivElement>(null);
  const actor = useRef<HTMLDivElement>(null);
  const sprite = useRef<HTMLDivElement>(null);
  const react = useRef<(reaction: Reaction) => void>(() => {});

  useEffect(() => {
    const stage = strip.current!;
    const character = actor.current!;
    const image = sprite.current!;
    const motion = matchMedia('(prefers-reduced-motion: reduce)');
    const decodedSheets = new Map<string, {asset: HTMLImageElement; ready: boolean}>();
    let disposed = false;

    function decodeSheet(src: string) {
      if (decodedSheets.has(src)) return;
      const entry = {asset: new Image(), ready: false};
      decodedSheets.set(src, entry);
      entry.asset.src = src;
      void entry.asset.decode().then(() => {
        if (disposed) return;
        entry.ready = true;
        paint(previousPose, currentSample);
      }, () => {});
    }

    function preloadSheets() {
      if (motion.matches) return;
      for (const {smoothSrc} of Object.values(sheets)) decodeSheet(smoothSrc);
    }
    let position = 0, limit = 0, direction = 1, previousPose = 0, currentSample = 0;
    let paintedFrame = '';
    let animation: Animation = 'walk';
    let elapsed = 0, walked = 0, previousTime = 0, request = 0;
    let nextGesture = 0;
    let turnPause = 0;
    let lift = 0, fallSpeed = 0, dropHeight = 0;
    let perch: HTMLElement | null = null;
    let lastShuffle: {x: number; y: number} | null = null;
    let press: {id: number; x: number; y: number; dx: number; dy: number; since: number; touch: boolean} | null = null;
    let pinch: {pointer: number; x: number; y: number; span: number; target: number} | null = null;
    let pinchScale = 1, releasedScale = 1, interactionSample = -1;
    let suppressClick = false;

    function placeCharacter() {
      character.style.transform = `translate(${position}px, ${-lift}px)`;
      character.dataset.facing = direction === 1 ? 'right' : 'left';
    }

    function feetAt(bounds: DOMRect) {
      return {x: bounds.left + position + character.offsetWidth / 2,
        y: bounds.top + character.offsetHeight * footRatio - lift};
    }

    function cardSurface(card: HTMLElement, stageBounds: DOMRect) {
      const rect = card.getBoundingClientRect();
      return {left: rect.left + 8, right: rect.right - 8,
        lift: stageBounds.top + character.offsetHeight * footRatio - rect.top};
    }

    function findLanding(previousLift: number) {
      const bounds = stage.getBoundingClientRect();
      const {x} = feetAt(bounds);
      let landing: {card: HTMLElement; height: number} | undefined;
      for (const card of document.querySelectorAll<HTMLElement>('.welcome-page .workspace-card')) {
        const surface = cardSurface(card, bounds);
        if (x >= surface.left && x <= surface.right && surface.lift > Math.max(0, lift)
          && surface.lift <= previousLift && (!landing || surface.lift > landing.height)) {
          landing = {card, height: surface.lift};
        }
      }
      return landing;
    }

    function paint(pose: number, sample = 0) {
      const {sheet, row} = animations[animation];
      const {src, rows, smoothSrc, smoothRows} = sheets[sheet];
      const smooth = !motion.matches && decodedSheets.get(smoothSrc)?.ready;
      const source = smooth ? smoothSrc : src;
      previousPose = pose;
      currentSample = sample;
      placeCharacter();
      // Keep the last visible frame until the next sheet can be drawn.
      if (!decodedSheets.get(source)?.ready) {
        decodeSheet(source);
        return;
      }
      const slot = (animation === 'pinch' ? 5 : row) * framesPerClip + sample;
      const key = `${source}:${smooth ? slot : row * 6 + pose}`;
      if (paintedFrame !== key) {
        paintedFrame = key;
        const columns = smooth ? spriteColumns : 6;
        const gridRows = smooth ? smoothRows : rows;
        const x = smooth ? slot % columns : pose;
        const y = smooth ? Math.floor(slot / columns) : row;
        image.style.backgroundImage = `url(${source})`;
        image.style.backgroundSize = `${columns * 100}% ${gridRows * 100}%`;
        image.style.backgroundPosition = `${x * 100 / (columns - 1)}% ${y * 100 / (gridRows - 1)}%`;
      }
    }

    function paintTimed(time: number) {
      paint(Math.floor(time / animations[animation].frameMs), Math.floor(time / spriteFrameMs));
    }

    function paintInteraction(progress: number) {
      paint(motion.matches ? 3 : Math.round(progress * 5), Math.round(progress * (interactionFrames - 1)));
    }

    function start(next: Animation) {
      animation = next;
      character.dataset.animation = next;
      image.style.setProperty('--snowman-cycle', `${animations[next].frameMs * 6}ms`);
      interactionSample = -1;
      elapsed = 0;
      paint(stillFrame());
      if (next !== 'walk' && next !== 'pinch') playCue(next);
    }

    function stillFrame() {
      if (!motion.matches || animation === 'walk') return 0;
      return animation === 'landing' ? 1 : 3;
    }

    function resize() {
      limit = Math.max(0, stage.clientWidth - character.offsetWidth);
      if (motion.matches && !press && !perch && lift === 0) position = limit / 2;
      else {
        const bounds = stage.getBoundingClientRect();
        const maxX = Math.max(0, document.documentElement.clientWidth - character.offsetWidth);
        position = Math.max(0, Math.min(maxX, position + bounds.left)) - bounds.left;
        lift = Math.min(lift, Math.max(0, bounds.top));
      }
      placeCharacter();
    }

    function moveToPointer(x: number, y: number) {
      if (!press) return;
      const bounds = stage.getBoundingClientRect();
      const maxX = Math.max(0, document.documentElement.clientWidth - character.offsetWidth);
      position = Math.max(0, Math.min(maxX, x - press.dx)) - bounds.left;
      lift = Math.min(Math.max(0, bounds.top), Math.max(24, bounds.top - y + press.dy));
      placeCharacter();
      if (!motion.matches && (!lastShuffle || Math.hypot(x - lastShuffle.x, y - lastShuffle.y) >= 22)) {
        lastShuffle = {x, y};
        const feet = feetAt(bounds);
        shuffleSnow(feet.x, feet.y - character.offsetHeight * .35, .3);
      }
    }

    function pickUp(x: number, y: number) {
      suppressClick = true;
      perch = null;
      lastShuffle = null;
      turnPause = 0;
      delete character.dataset.turning;
      start('pickup');
      moveToPointer(x, y);
    }

    function pointerDown(event: PointerEvent) {
      if (event.button !== 0) return;
      const target = (event.target as Element).closest('button');
      if (!target) return;
      if (press && press.touch && event.pointerType === 'touch' && !event.isPrimary && !pinch) {
        target.setPointerCapture(event.pointerId);
        pinch = {pointer: event.pointerId, x: event.clientX, y: event.clientY,
          span: Math.max(12, Math.hypot(event.clientX - press.x, event.clientY - press.y)), target: 1};
        suppressClick = true;
        turnPause = 0;
        delete character.dataset.turning;
        start('pinch');
        return;
      }
      if (!event.isPrimary || press || animation === 'pinch') return;
      suppressClick = false;
      if (!canInterrupt(animation)) return;
      const bounds = character.getBoundingClientRect();
      press = {id: event.pointerId, x: event.clientX, y: event.clientY, dx: event.clientX - bounds.left,
        dy: event.clientY - bounds.top, since: performance.now(), touch: event.pointerType === 'touch'};
      target.setPointerCapture(event.pointerId);
    }

    function pointerMove(event: PointerEvent) {
      if (press && pinch) {
        const point = event.pointerId === press.id ? press : event.pointerId === pinch.pointer ? pinch : null;
        if (!point) return;
        point.x = event.clientX;
        point.y = event.clientY;
        const ratio = Math.max(12, Math.hypot(pinch.x - press.x, pinch.y - press.y)) / pinch.span;
        pinch.target = Math.max(0.74, Math.min(1.28, 1 + (ratio - 1) * 0.46));
        return;
      }
      if (press?.id !== event.pointerId) return;
      if (animation === 'pickup') {
        press.x = event.clientX;
        press.y = event.clientY;
        moveToPointer(event.clientX, event.clientY);
      }
      else if (Math.hypot(event.clientX - press.x, event.clientY - press.y) >= 8) pickUp(event.clientX, event.clientY);
    }

    function land(landing?: {card: HTMLElement; height: number}) {
      perch = landing?.card ?? null;
      lift = landing?.height ?? 0;
      if (!perch) {
        if (motion.matches) position = limit / 2;
        if (position < 0) direction = 1;
        if (position > limit) direction = -1;
      }
      character.dataset.surface = perch ? 'card' : 'floor';
      start('landing');
      if (!motion.matches) {
        const {x, y} = feetAt(stage.getBoundingClientRect());
        shuffleSnow(x, y, 1);
      }
    }

    function fall() {
      perch = null;
      delete character.dataset.surface;
      fallSpeed = 0;
      dropHeight = lift;
      if (motion.matches || lift <= 0) {
        lift = 0;
        land(findLanding(dropHeight));
      } else start('falling');
    }

    function release(event: PointerEvent) {
      if (pinch && (press?.id === event.pointerId || pinch.pointer === event.pointerId)) {
        pinch = null;
        press = null;
        releasedScale = pinchScale;
        elapsed = 0;
        if (motion.matches) endPinch();
        return;
      }
      if (press?.id !== event.pointerId) return;
      press = null;
      if (animation !== 'pickup') return;
      fall();
    }

    function click(event: MouseEvent) {
      if (event.detail && suppressClick) {
        event.stopPropagation();
      }
    }

    function paintPinch(scale: number, time = 0) {
      pinchScale = scale;
      image.style.scale = `${2 - scale} ${scale}`;
      const sample = Math.floor(time / spriteFrameMs);
      if (sample !== interactionSample) {
        interactionSample = sample;
        paintInteraction(Math.min(1, Math.abs(scale - 1) * 3.8));
      }
    }

    function endPinch() {
      pinchScale = 1;
      image.style.removeProperty('scale');
      start('walk');
      if (lift > 0 && !perch) fall();
    }

    function tick(now: number) {
      const step = previousTime ? Math.min(50, now - previousTime) : 0;
      previousTime = now;
      if (perch && !document.hidden) {
        const bounds = stage.getBoundingClientRect();
        const {x} = feetAt(bounds);
        const surface = cardSurface(perch, bounds);
        if (!perch.isConnected || surface.lift <= 0 || x < surface.left || x > surface.right) fall();
        else {
          lift = surface.lift;
          placeCharacter();
        }
      }
      if (animation === 'pinch') {
        if (pinch) {
          if (!motion.matches) paintPinch(pinchScale + (pinch.target - pinchScale) * (1 - Math.exp(-step / 40)), now);
        } else {
          elapsed += step;
          const progress = elapsed / pinchReturnMs;
          if (progress >= 1) endPinch();
          else paintPinch(1 + (releasedScale - 1) * (1 - progress) ** 2 * Math.cos(progress * Math.PI * 2), now);
        }
      } else if (press) {
        if (animation === 'pickup') {
          elapsed += step;
          if (!motion.matches) paintTimed(elapsed % (animations.pickup.frameMs * 6));
        } else if (now - press.since >= 300) pickUp(press.x, press.y);
      } else if (animation === 'falling') {
        const previousLift = lift;
        fallSpeed += step * 0.0022;
        lift -= fallSpeed * step;
        const landing = findLanding(previousLift);
        if (landing || lift <= 0) land(landing);
        else {
          placeCharacter();
          const sample = Math.floor(now / spriteFrameMs);
          if (sample !== interactionSample) {
            interactionSample = sample;
            paintInteraction(1 - lift / dropHeight);
          }
        }
      } else if (animation !== 'walk') {
        elapsed += step;
        const {frameMs} = animations[animation];
        if (elapsed >= frameMs * 6) start('walk');
        else if (!motion.matches) paintTimed(elapsed);
      } else if (!motion.matches && limit > 0 && !character.querySelector(':focus-visible')) {
        if (turnPause > 0) {
          turnPause -= step;
          if (turnPause <= 0) {
            direction *= -1;
            delete character.dataset.turning;
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
          const speed = perch ? walkSpeed : walkSpeed * Math.min(1, 0.5 + distanceToEdge / 32);
          if (!perch && distanceToEdge <= speed * step / 1000) {
            position = direction > 0 ? limit : 0;
            turnPause = turnPauseMs;
            character.dataset.turning = '';
            elapsed = 0;
            paint(0);
          } else {
            position += direction * speed * step / 1000;
            elapsed += step;
            const time = elapsed % (animations.walk.frameMs * 6);
            const next = Math.floor(time / animations.walk.frameMs);
            if (previousPose !== next && (next === 1 || next === 4)) {
              playCue('step');
              if (perch) {
                const {x, y} = feetAt(stage.getBoundingClientRect());
                shuffleSnow(x, y, .55);
              }
            }
            paintTimed(time);
          }
        }
      }
      request = requestAnimationFrame(tick);
    }

    function syncVisibility() {
      cancelAnimationFrame(request);
      previousTime = 0;
      if (!document.hidden) request = requestAnimationFrame(tick);
      else if (animation === 'pinch') {
        pinch = null;
        press = null;
        endPinch();
      } else if (press) {
        press = null;
        if (animation === 'pickup') land();
      }
    }

    function syncMotion() {
      preloadSheets();
      resize();
      interactionSample = -1;
      if (motion.matches && animation === 'pinch') {
        if (pinch) paintPinch(1);
        else endPinch();
      } else if (motion.matches && animation === 'falling') fall();
      else paint(stillFrame());
    }

    react.current = reaction => {
      if (canInterrupt(animation)) start(reaction);
    };
    const observer = new ResizeObserver(resize);
    observer.observe(stage);
    preloadSheets();
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
    window.addEventListener('resize', resize);
    motion.addEventListener('change', syncMotion);
    return () => {
      disposed = true;
      decodedSheets.clear();
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
      window.removeEventListener('resize', resize);
      motion.removeEventListener('change', syncMotion);
    };
  }, [playCue, shuffleSnow]);

  return createPortal(<div ref={strip} className="home-snowman-strip">
    <div ref={actor} className="home-snowman" role="group" aria-label="Snowman">
      <div ref={sprite} className="home-snowman-sprite" style={{backgroundImage: `url(${atlas})`}} aria-hidden="true"/>
      {reactions.map(([part, label]) => <button type="button" key={part} data-part={part} aria-label={label} onClick={() => react.current(part)}/>)}
    </div>
  </div>, document.body);
}
