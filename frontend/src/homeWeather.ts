export type HomeWeatherMode = 'rain' | 'snow';

type Particle = {x: number; y: number; depth: number; phase: number; gust: number};
type Spray = {x: number; vx: number; vy: number; age: number};
type Surface = {ledge: Float32Array; shape: Float32Array; spray: Spray[]; runoff: [number, number]};
type Palette = {rain: string; ice: string; shade: string; water: string};

const lightPalette: Palette = {rain: '#28648e', ice: '#9dbed5', shade: '#426f94', water: '#347ca9'};
const darkPalette: Palette = {rain: '#a6daf9', ice: '#d5edff', shade: '#507b9b', water: '#91c9ed'};

const ledgeBins = 40;
const gustRadius = 105;
const random = Math.random;
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

export function mountHomeWeather(home: HTMLElement, mode: HomeWeatherMode) {
  const sky = home.querySelector<HTMLCanvasElement>('.home-weather-sky');
  const skyContext = sky?.getContext('2d');
  if (!sky || !skyContext) return;
  const skyLayer = {canvas: sky, ctx: skyContext};

  const rain = mode === 'rain';
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const surfaces = new WeakMap<HTMLCanvasElement, Surface>();
  const particles: Particle[] = [];
  const mouse = {x: 0, y: 0, vx: 0, speed: 0, time: 0};
  let frame = 0;
  let lastFrame = 0;

  function aim(event: PointerEvent) {
    if (event.pointerType !== 'mouse' && event.pointerType !== 'pen') return;
    const now = performance.now();
    const dx = event.clientX - mouse.x;
    const dy = event.clientY - mouse.y;
    const moving = now - mouse.time < 120;
    mouse.vx = moving ? clamp(dx * 20, -260, 260) : 0;
    mouse.speed = moving ? Math.min(260, Math.hypot(dx, dy) * 20) : 0;
    mouse.x = event.clientX;
    mouse.y = event.clientY;
    mouse.time = now;
  }

  function resetParticle(particle: Particle, width: number, height: number, initial = false) {
    particle.x = random() * (width + 130) - 80;
    particle.y = initial ? random() * height : -8 - random() * 50;
    particle.depth = random();
    particle.phase = random() * Math.PI * 2;
    particle.gust = 0;
    return particle;
  }

  function prepare(canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D, width: number, height: number) {
    const ratio = Math.min(window.devicePixelRatio || 1, 1.5, 2048 / Math.max(width, height, 1));
    const pixelWidth = Math.max(1, Math.round(width * ratio));
    const pixelHeight = Math.max(1, Math.round(height * ratio));
    if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
      canvas.width = pixelWidth;
      canvas.height = pixelHeight;
    }
    ctx.setTransform(pixelWidth / width, 0, 0, pixelHeight / height, 0, 0);
    ctx.clearRect(0, 0, width, height);
  }

  function drawParticle(ctx: CanvasRenderingContext2D, particle: Particle, palette: Palette, left = 0, top = 0) {
    const {depth, gust} = particle;
    const x = particle.x - left;
    const y = particle.y - top;
    ctx.beginPath();
    if (rain) {
      const length = 9 + depth * 22;
      const slant = length * (0.15 + gust / 750);
      ctx.strokeStyle = palette.rain;
      ctx.lineCap = 'round';
      ctx.globalAlpha = 0.17 + depth * 0.27;
      ctx.lineWidth = 0.55 + depth * 1.05;
      ctx.moveTo(x, y);
      ctx.lineTo(x - slant, y - length);
      ctx.stroke();
      ctx.beginPath();
      ctx.globalAlpha = 0.22 + depth * 0.38;
      ctx.moveTo(x, y);
      ctx.lineTo(x - slant * 0.38, y - length * 0.38);
      ctx.stroke();
    } else {
      const lightSnow = palette === lightPalette;
      const radius = (0.65 + depth * 2.55) * (lightSnow ? 1.25 : 1);
      ctx.globalAlpha = lightSnow ? 0.58 + depth * 0.4 : 0.36 + depth * 0.57;
      ctx.fillStyle = palette.ice;
      ctx.ellipse(x, y, radius, radius * 0.84, particle.phase, 0, Math.PI * 2);
      ctx.fill();
      if (lightSnow) {
        ctx.strokeStyle = palette.shade;
        ctx.lineWidth = 0.65 + depth * 0.35;
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.fillStyle = '#faffff';
      ctx.ellipse(x - radius * 0.18, y - radius * 0.22, radius * 0.72, radius * 0.57, particle.phase, 0, Math.PI * 2);
      ctx.fill();
      if (depth > 0.88) {
        ctx.beginPath();
        for (let branch = 0; branch < 3; branch++) {
          const angle = particle.phase + branch * Math.PI / 3;
          const dx = Math.cos(angle) * radius * 1.22;
          const dy = Math.sin(angle) * radius * 1.22;
          ctx.moveTo(x - dx, y - dy);
          ctx.lineTo(x + dx, y + dy);
        }
        if (lightSnow) {
          ctx.strokeStyle = palette.shade;
          ctx.lineWidth = 1.8;
          ctx.stroke();
        }
        ctx.strokeStyle = '#faffff';
        ctx.lineWidth = 0.65;
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
  }

  function hit(surface: Surface, x: number, width: number) {
    const bin = Math.round(x / width * (ledgeBins - 1));
    for (let i = Math.max(0, bin - 2); i <= Math.min(ledgeBins - 1, bin + 2); i++) {
      const deposit = (3 - Math.abs(i - bin)) * (0.045 + random() * 0.035);
      surface.ledge[i] = Math.min(1, surface.ledge[i] + deposit);
    }
    if (rain) {
      if (surface.spray.length < 30) {
        for (let i = 0; i < 3; i++) surface.spray.push({x: x / width, vx: random() * 95 - 47, vy: 49 + random() * 62, age: 0});
      }
      const edge = x < width / 2 ? 0 : 1;
      if (surface.runoff[edge] <= 0) surface.runoff[edge] = 1.15;
    }
  }

  function drawLedge(ctx: CanvasRenderingContext2D, surface: Surface, width: number, height: number, step: number, palette: Palette, logoBorder: boolean) {
    const maxDepth = rain ? 5 : logoBorder ? 7 : clamp(height * 0.16, 5, 14);
    const spacing = width / (ledgeBins - 1);
    const depthAt = (i: number) => surface.ledge[i] * surface.shape[i] * maxDepth;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(0, depthAt(0));
    for (let i = 1; i < ledgeBins; i++) {
      const depth = depthAt(i);
      ctx.quadraticCurveTo((i - 1) * spacing, depthAt(i - 1), (i - 0.5) * spacing, (depth + depthAt(i - 1)) / 2);
    }
    ctx.lineTo(width, depthAt(ledgeBins - 1));
    ctx.lineTo(width, 0);
    ctx.closePath();
    const gradient = ctx.createLinearGradient(0, 0, 0, maxDepth);
    if (rain) {
      gradient.addColorStop(0, '#e9f9ff');
      gradient.addColorStop(0.33, palette.water);
      gradient.addColorStop(1, '#5ba1c2');
      ctx.globalAlpha = 0.67;
    } else {
      gradient.addColorStop(0, '#fff');
      gradient.addColorStop(0.44, '#f3fbff');
      gradient.addColorStop(1, '#b4d2e7');
      ctx.strokeStyle = palette.shade;
      ctx.globalAlpha = 0.58;
      ctx.lineWidth = 2.1;
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    ctx.fillStyle = gradient;
    ctx.fill();
    ctx.globalAlpha = 1;
    if (!rain) {
      ctx.fillStyle = palette.shade;
      ctx.globalAlpha = 0.23;
      for (let i = 1; i < ledgeBins - 1; i++) {
        const depth = depthAt(i);
        if (depth < 4) continue;
        ctx.beginPath();
        ctx.arc((i - 0.25) * spacing, depth * (0.38 + (i % 3) * 0.14), 0.5 + (i % 2) * 0.25, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      return;
    }

    for (let i = 0; i < ledgeBins; i++) surface.ledge[i] *= Math.exp(-step * 0.65);
    for (const edge of [0, 1] as const) {
      surface.runoff[edge] = Math.max(0, surface.runoff[edge] - step);
      if (!surface.runoff[edge]) continue;
      const progress = 1 - surface.runoff[edge] / 1.15;
      const direction = edge === 0 ? 1 : -1;
      const y = 6 + progress ** 1.45 * Math.min(100, height - 9);
      const xAt = (position: number) => (edge === 0 ? 4 : width - 4)
        + direction * (12 * Math.exp(-position / 9) + Math.sin(position / 8) * 1.5);
      const x = xAt(y);
      const tail = Math.max(0, y - 14 - progress * 16);
      const sheen = ctx.createLinearGradient(0, tail, 0, y + 2);
      sheen.addColorStop(0, 'transparent');
      sheen.addColorStop(1, palette.water);
      ctx.globalAlpha = (1 - progress * 0.72) * 0.91;
      ctx.beginPath();
      ctx.moveTo(xAt(tail), tail);
      ctx.quadraticCurveTo(xAt((tail + y) / 2), (tail + y) / 2, x, y);
      ctx.strokeStyle = sheen;
      ctx.lineWidth = 2.25;
      ctx.stroke();
      ctx.beginPath();
      ctx.fillStyle = palette.water;
      ctx.ellipse(x, y, 1.55, 2.6, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#f1fbff';
      ctx.fillRect(x - 0.55, y - 1.65, 0.8, 1.5);
    }
    ctx.globalAlpha = 1;
  }

  function drawSpray(ctx: CanvasRenderingContext2D, surface: Surface, width: number, left: number, top: number, step: number, palette: Palette) {
    surface.spray = surface.spray.filter(drop => {
      drop.age += step;
      const life = rain ? 0.35 : 0.62;
      if (drop.age >= life) return false;
      const x = drop.x * width + drop.vx * drop.age;
      const y = rain ? 3 - drop.vy * drop.age + 285 * drop.age ** 2 : 3 + drop.vy * drop.age;
      const above = y < 0;
      const layer = above ? skyLayer.ctx : ctx;
      const drawX = above ? left + x : x;
      const drawY = above ? top + y : y;
      layer.globalAlpha = (1 - drop.age / life) * 0.92;
      layer.fillStyle = rain ? palette.water : palette.ice;
      layer.beginPath();
      layer.ellipse(drawX, drawY, rain ? 1.05 : 1.85, rain ? 1.85 : 1.55, drop.vx / 120, 0, Math.PI * 2);
      layer.fill();
      layer.fillStyle = '#fff';
      layer.fillRect(drawX - 0.45, drawY - 0.85, 0.85, 0.85);
      layer.globalAlpha = 1;
      return true;
    });
  }

  function tick(now: number) {
    const step = lastFrame ? Math.min((now - lastFrame) / 1000, 0.04) : 1 / 60;
    lastFrame = now;
    const {width, height} = skyLayer.canvas.getBoundingClientRect();
    if (width <= 0 || height <= 0) {
      frame = requestAnimationFrame(tick);
      return;
    }
    const dark = /^(glass-dark|forest)$/.test(document.documentElement.dataset.theme || '');
    const palette = dark ? darkPalette : lightPalette;
    const activeSurfaces = Array.from(home.querySelectorAll<HTMLCanvasElement>('.home-weather-surface')).flatMap(canvas => {
      const parent = canvas.parentElement!;
      const rect = canvas.getBoundingClientRect();
      const ctx = canvas.getContext('2d');
      if (!ctx || !rect.width || !rect.height || rect.bottom < 0 || rect.top > height) return [];
      let surface = surfaces.get(canvas);
      if (!surface) {
        const phase = random() * Math.PI * 2;
        surface = {
          ledge: Float32Array.from({length: ledgeBins}, () => rain ? 0 : 0.24),
          shape: Float32Array.from({length: ledgeBins}, (_, i) => 0.79 + 0.17 * Math.sin(i * 0.48 + phase) + random() * 0.23),
          spray: [],
          runoff: [0, 0],
        };
        surfaces.set(canvas, surface);
      }
      const menu = parent.classList.contains('app-select-menu');
      // The popover itself is the ledge, even when its options scroll underneath it.
      const top = menu ? parent.getBoundingClientRect().top + parent.clientTop : rect.top;
      return [{canvas, ctx, rect, surface, top, scroll: menu ? parent.scrollTop : 0, logoBorder: parent.classList.contains('home-logo-weather-border')}];
    });
    const count = clamp(Math.round(width * height / (rain ? 4400 : 5200)), rain ? 78 : 66, rain ? 285 : 230);
    if (particles.length > count) particles.length = count;
    while (particles.length < count) particles.push(resetParticle({x: 0, y: 0, depth: 0, phase: 0, gust: 0}, width, height, true));
    const gust = Math.max(0, 1 - (now - mouse.time) / 220);
    prepare(skyLayer.canvas, skyLayer.ctx, width, height);
    for (const particle of particles) {
      const previousY = particle.y;
      const distance = Math.hypot(particle.x - mouse.x, particle.y - mouse.y);
      const push = mouse.vx * 0.75 + mouse.speed * 0.42 * Math.sign(particle.x - mouse.x);
      particle.gust += gust * push * Math.max(0, 1 - distance / gustRadius) * step * 7;
      particle.gust *= Math.exp(-step * 5);
      const wind = rain ? 78 : 9 + Math.sin(now / 1950) * 12 + Math.sin(now / 840 + particle.phase) * 26;
      particle.x += (wind + particle.gust) * step;
      particle.y += (rain ? 420 + particle.depth * 370 : 32 + particle.depth * 62) * step;
      const ledge = particle.depth > 0.22 && activeSurfaces.find(({rect, top}) => {
        return previousY <= top + 1 && particle.y > top + 1 && particle.x > rect.left + 4 && particle.x < rect.right - 4;
      });
      if (ledge) hit(ledge.surface, particle.x - ledge.rect.left, ledge.rect.width);
      if ((ledge && particle.depth > 0.53) || particle.y > height + 26 || particle.x > width + 50 || particle.x < -95) {
        resetParticle(particle, width, height);
      }
      drawParticle(skyLayer.ctx, particle, palette);
    }
    for (const {canvas, ctx, rect, surface, top, scroll, logoBorder} of activeSurfaces) {
      const translate = scroll ? `translateY(${scroll}px)` : '';
      if (canvas.style.transform !== translate) canvas.style.transform = translate;
      prepare(canvas, ctx, rect.width, rect.height);
      if (!logoBorder) {
        for (const particle of particles) {
          if (particle.depth > 0.53 && particle.x >= rect.left && particle.x <= rect.right && particle.y >= top && particle.y < top + rect.height) {
            drawParticle(ctx, particle, palette, rect.left, top);
          }
        }
      }
      if (!rain && gust * mouse.speed > 95 && Math.abs(mouse.y - top) < 40 && mouse.x > rect.left && mouse.x < rect.right) {
        const x = (mouse.x - rect.left) / rect.width;
        const bin = Math.round(x * (ledgeBins - 1));
        if (surface.ledge[bin] > 0.25 && surface.spray.length < 14) {
          surface.ledge[bin] *= 0.76;
          surface.spray.push({x, vx: gust * mouse.vx * 0.25 + random() * 18 - 9, vy: 20 + random() * 32, age: 0});
        }
      }
      drawLedge(ctx, surface, rect.width, rect.height, step, palette, logoBorder);
      drawSpray(ctx, surface, rect.width, rect.left, top, step, palette);
    }
    frame = requestAnimationFrame(tick);
  }

  function updateAnimation() {
    cancelAnimationFrame(frame);
    lastFrame = 0;
    if (!document.hidden && !reducedMotion.matches) frame = requestAnimationFrame(tick);
  }

  home.addEventListener('pointermove', aim, {passive: true});
  document.addEventListener('visibilitychange', updateAnimation);
  reducedMotion.addEventListener('change', updateAnimation);
  updateAnimation();
  return () => {
    cancelAnimationFrame(frame);
    home.removeEventListener('pointermove', aim);
    document.removeEventListener('visibilitychange', updateAnimation);
    reducedMotion.removeEventListener('change', updateAnimation);
  };
}
