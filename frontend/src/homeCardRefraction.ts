const svgNamespace = 'http://www.w3.org/2000/svg';

// Web recipe from xenitV1/liquid-glass-skill. Red and green encode an
// inward offset near the rounded edge, with neutral pixels in the center.
function drawDisplacementMap(context: CanvasRenderingContext2D, width: number, height: number, radius: number) {
  const image = context.createImageData(width, height);
  const halfWidth = width / 2;
  const halfHeight = height / 2;
  const rim = Math.min(14, radius);

  for (let row = 0; row < height; row++) {
    for (let column = 0; column < width; column++) {
      const x = column + 0.5 - halfWidth;
      const y = row + 0.5 - halfHeight;
      const edgeX = Math.abs(x) - (halfWidth - radius);
      const edgeY = Math.abs(y) - (halfHeight - radius);
      const cornerDistance = Math.hypot(Math.max(0, edgeX), Math.max(0, edgeY));
      const depth = radius - cornerDistance - Math.min(0, Math.max(edgeX, edgeY));
      const index = (row * width + column) * 4;
      image.data[index] = 128;
      image.data[index + 1] = 128;
      image.data[index + 3] = 255;
      if (depth < 0 || depth >= rim) continue;

      const progress = 1 - depth / rim;
      const offset = 120 * progress * progress * (3 - 2 * progress);
      const normalX = cornerDistance ? Math.max(0, edgeX) / cornerDistance : Number(edgeX > edgeY);
      const normalY = cornerDistance ? Math.max(0, edgeY) / cornerDistance : Number(edgeY >= edgeX);
      image.data[index] -= offset * normalX * Math.sign(x);
      image.data[index + 1] -= offset * normalY * Math.sign(y);
    }
  }

  context.putImageData(image, 0, 0);
}

export function mountHomeCardRefraction(group: HTMLDivElement) {
  // Safari and Firefox can parse this filter syntax without rendering it
  // on a backdrop. Keep their CSS blur instead.
  if (!/Chrome\/\d+/.test(navigator.userAgent) || /CriOS|EdgiOS|FxiOS/.test(navigator.userAgent)
      || !CSS.supports('backdrop-filter', 'url(#home-card-glass)') || typeof ResizeObserver !== 'function') return;

  const cards = Array.from(group.querySelectorAll<HTMLAnchorElement>(':scope > .workspace-card'));
  const preferences = window.matchMedia('(prefers-reduced-transparency: reduce), (forced-colors: active)');
  const svg = document.createElementNS(svgNamespace, 'svg');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('width', '0');
  svg.setAttribute('height', '0');
  svg.style.position = 'absolute';
  const defs = document.createElementNS(svgNamespace, 'defs');
  svg.append(defs);

  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  if (!context) return;

  const filters = cards.map((card, index) => {
    const filter = document.createElementNS(svgNamespace, 'filter');
    filter.id = `home-card-glass-${index}`;
    filter.setAttribute('x', '0');
    filter.setAttribute('y', '0');
    filter.setAttribute('filterUnits', 'userSpaceOnUse');
    filter.setAttribute('color-interpolation-filters', 'sRGB');
    const map = document.createElementNS(svgNamespace, 'feImage');
    map.setAttribute('x', '0');
    map.setAttribute('y', '0');
    map.setAttribute('preserveAspectRatio', 'none');
    map.setAttribute('result', 'rim');
    const lens = document.createElementNS(svgNamespace, 'feDisplacementMap');
    lens.setAttribute('in', 'SourceGraphic');
    lens.setAttribute('in2', 'rim');
    lens.setAttribute('scale', '22');
    lens.setAttribute('xChannelSelector', 'R');
    lens.setAttribute('yChannelSelector', 'G');
    filter.append(map, lens);
    defs.append(filter);
    return {card, filter, map};
  });

  const observer = new ResizeObserver(entries => {
    for (const {target} of entries) {
      const entry = filters.find(({card}) => card === target);
      if (!entry) continue;
      const {card, filter, map} = entry;
      const width = card.offsetWidth;
      const height = card.offsetHeight;
      if (!width || !height) continue;
      const radius = Math.min(parseFloat(getComputedStyle(card).borderTopLeftRadius), width / 2, height / 2);
      canvas.width = width;
      canvas.height = height;
      drawDisplacementMap(context, width, height, radius);
      filter.setAttribute('width', String(width));
      filter.setAttribute('height', String(height));
      map.setAttribute('width', String(width));
      map.setAttribute('height', String(height));
      map.setAttribute('href', canvas.toDataURL());
      card.style.setProperty('--home-glass-refraction', `url(#${filter.id}) blur(8px)`);
    }
  });

  const stop = () => {
    observer.disconnect();
    svg.remove();
    for (const card of cards) card.style.removeProperty('--home-glass-refraction');
  };
  const sync = () => {
    if (preferences.matches) {
      stop();
    } else {
      group.after(svg);
      for (const card of cards) observer.observe(card, {box: 'border-box'});
    }
  };
  sync();
  preferences.addEventListener('change', sync);
  return () => {
    preferences.removeEventListener('change', sync);
    stop();
  };
}
