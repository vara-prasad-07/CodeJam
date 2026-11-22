import { drawCell } from './cellShapes.js';

const clamp = n => Math.max(0, Math.min(1, n));
const luminance = (r, g, b) => (.2126 * r + .7152 * g + .0722 * b) / 255;
function noise(x, y) {
  const value = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return value - Math.floor(value);
}
function surface(width, height) {
  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  return canvas.getContext('2d', { willReadFrequently: true });
}
function curve(value, points) {
  const next = points.findIndex(point => point.x >= value);
  if (next < 0) return points.at(-1).y;
  if (!next) return points[0].y;
  const a = points[next - 1], b = points[next];
  return a.y + (b.y - a.y) * (value - a.x) / (b.x - a.x);
}
function sampleCells(photo, size) {
  const { width, height } = photo.canvas;
  const pixels = photo.getImageData(0, 0, width, height).data;
  const cols = Math.ceil(width / size), rows = Math.ceil(height / size);
  const cells = [];
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const x = col * size, y = row * size;
      const endX = Math.min(width, x + size), endY = Math.min(height, y + size);
      let r = 0, g = 0, b = 0, weight = 0, upper = 0, lower = 0;
      let upperWeight = 0, lowerWeight = 0;
      for (let py = y; py < endY; py++) {
        for (let px = x; px < endX; px++) {
          const i = (py * width + px) * 4, a = pixels[i + 3] / 255;
          r += pixels[i] * a; g += pixels[i + 1] * a; b += pixels[i + 2] * a; weight += a;
          const light = luminance(pixels[i], pixels[i + 1], pixels[i + 2]) * a;
          if (py < y + size / 2) { upper += light; upperWeight += a; }
          else { lower += light; lowerWeight += a; }
        }
      }
      const divisor = weight || 1;
      r = Math.round(r / divisor); g = Math.round(g / divisor); b = Math.round(b / divisor);
      cells.push({ x, y, row, col, random: noise(col, row), color: `rgb(${r} ${g} ${b})`,
        alpha: weight / ((endX - x) * (endY - y)), light: luminance(r, g, b),
        upper: upper / (upperWeight || 1), lower: lower / (lowerWeight || 1) });
    }
  }
  for (const [i, cell] of cells.entries()) {
    cell.slopeX = cell.col + 1 < cols ? cells[i + 1].light - cell.light : 0;
    cell.slopeY = cell.row + 1 < rows ? cells[i + cols].light - cell.light : 0;
  }
  return cells;
}

function spatialBlur(layer, o) {
  if (o.blurType === 'off' || !o.blurAmount) return;
  const { width: w, height: h } = layer.canvas;
  const blurred = surface(w, h);
  const amount = o.blurAmount * w / 3500;
  if (o.blurType === 'directional' || o.blurType === 'motion') {
    const angle = o.blurAngle * Math.PI / 180;
    for (let i = 0; i < 9; i++) {
      const step = amount * (i / 8 - (o.directionalBothSides ? .5 : 0));
      blurred.globalAlpha = 1 / (i + 1);
      blurred.drawImage(layer.canvas, step * Math.cos(angle), step * Math.sin(angle));
    }
  } else {
    blurred.filter = `blur(${amount}px)`;
    blurred.drawImage(layer.canvas, 0, 0);
  }
  blurred.filter = 'none'; blurred.globalAlpha = 1;
  let mask;
  if (o.blurType.startsWith('tilt')) {
    const y = h * o.tiltPosition / 100, band = h * o.tiltFocus / 200;
    const feather = Math.max(1, h * o.tiltFeather / 100);
    mask = blurred.createLinearGradient(0, y - band - feather, 0, y + band + feather);
    const stop = feather / (2 * (band + feather));
    mask.addColorStop(0, '#fff'); mask.addColorStop(stop, 'transparent');
    mask.addColorStop(1 - stop, 'transparent'); mask.addColorStop(1, '#fff');
  } else if (o.blurType === 'lens' || o.blurType === 'radial') {
    const x = w * o.blurCenterX / 100, y = h * o.blurCenterY / 100;
    mask = blurred.createRadialGradient(x, y, 0, x, y, Math.max(w, h) * .7);
    mask.addColorStop(clamp(o.lensFocus / 110), 'transparent'); mask.addColorStop(1, '#fff');
  } else if (o.blurType === 'progressive') {
    mask = blurred.createLinearGradient(0, o.progressiveReverse ? h : 0, 0, o.progressiveReverse ? 0 : h);
    mask.addColorStop(o.progressivePosition / 100, 'transparent'); mask.addColorStop(1, '#fff');
  }
  if (mask) {
    blurred.globalCompositeOperation = 'destination-in'; blurred.fillStyle = mask; blurred.fillRect(0, 0, w, h);
  }
  layer.drawImage(blurred.canvas, 0, 0);
}

function postProcess(layer, o) {
  const { width: w, height: h } = layer.canvas;
  const strength = key => o.pfx[key]?.enabled ? o.pfx[key].intensity / 100 : 0;
  const chromatic = strength('chromatic'), grain = strength('filmGrain');
  if (chromatic || grain) {
    const frame = layer.getImageData(0, 0, w, h), src = frame.data.slice(), out = frame.data;
    const shift = Math.ceil(chromatic * w / 400);
    let seed = 7591;
    for (let i = 0; i < src.length; i += 4) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      const n = (seed / 4294967296 - .5) * grain * 35;
      const x = i / 4 % w;
      out[i] = src[i] * (1 - chromatic) + src[i + Math.min(shift, w - x - 1) * 4] * chromatic + n;
      out[i + 1] += n;
      out[i + 2] = src[i + 2] * (1 - chromatic) + src[i - Math.min(shift, x) * 4 + 2] * chromatic + n;
    }
    layer.putImageData(frame, 0, 0);
  }
  const bloom = strength('bloom');
  if (bloom) {
    const glow = surface(w, h);
    glow.filter = `blur(${1 + bloom * 5}px)`; glow.drawImage(layer.canvas, 0, 0);
    layer.save(); layer.globalCompositeOperation = 'screen'; layer.globalAlpha = bloom;
    layer.drawImage(glow.canvas, 0, 0); layer.restore();
  }
  const pixelate = strength('pixelate');
  if (pixelate) {
    const scale = 1 / (1 + pixelate * 12), small = surface(Math.max(1, w * scale), Math.max(1, h * scale));
    small.drawImage(layer.canvas, 0, 0, small.canvas.width, small.canvas.height);
    layer.save(); layer.imageSmoothingEnabled = false; layer.drawImage(small.canvas, 0, 0, w, h); layer.restore();
  }
  const scan = strength('scanLines'), halftone = strength('halftone'), dust = strength('filmDust');
  if (scan) {
    layer.fillStyle = `rgba(0,0,0,${scan * .65})`;
    for (let y = 0; y < h; y += 4) layer.fillRect(0, y, w, 1);
  }
  if (halftone) {
    layer.fillStyle = `rgba(0,0,0,${halftone})`;
    for (let y = 0; y < h; y += 6) for (let x = y % 4; x < w; x += 6) {
      layer.beginPath(); layer.arc(x, y, 1.5, 0, 2 * Math.PI); layer.fill();
    }
  }
  if (dust) {
    layer.fillStyle = `rgba(242,240,215,${dust})`;
    for (let i = 0; i < dust * 160; i++) layer.fillRect(noise(i, 1) * w, noise(i, 2) * h, 1, 1 + noise(i, 3) * 3);
  }
  const vignette = strength('vignette');
  if (vignette) {
    const shade = layer.createRadialGradient(w / 2, h / 2, w * .17, w / 2, h / 2, Math.hypot(w, h) / 2);
    shade.addColorStop(0, 'transparent'); shade.addColorStop(1, `rgba(0,0,0,${vignette})`);
    layer.fillStyle = shade; layer.fillRect(0, 0, w, h);
  }
}

export function createOfficeRaster(canvas, image, options, maskImage) {
  const out = canvas.getContext('2d'), w = canvas.width, h = canvas.height;
  if (!out) return null;
  const photo = surface(w, h), ink = surface(w, h), frame = surface(w, h);
  const scale = Math.min(w / image.width, h / image.height) * .92;
  photo.drawImage(image, (w - image.width * scale) / 2, (h - image.height * scale) / 2, image.width * scale, image.height * scale);
  const size = Math.max(1, Math.round(options.cellSize * w / 2300));
  const cells = sampleCells(photo, size);
  const reveal = maskImage && surface(w, h);
  if (reveal) {
    reveal.drawImage(photo.canvas, 0, 0);
    reveal.globalCompositeOperation = options.mask.invert ? 'destination-out' : 'destination-in';
    reveal.drawImage(maskImage, 0, 0, w, h);
  }
  function build(time) {
    ink.clearRect(0, 0, w, h);
    ink.save(); ink.globalAlpha = options.bgOpacity / 100;
    if (options.bgMode === 'solid') {
      ink.fillStyle = options.bgColor; ink.fillRect(0, 0, w, h);
    } else if (['blur', 'blurred', 'original', 'photo', 'image'].includes(options.bgMode)) {
      if (options.bgMode.startsWith('blur')) ink.filter = `blur(${options.bgBlur}px)`;
      ink.drawImage(photo.canvas, 0, 0);
    }
    ink.restore(); ink.save(); ink.globalCompositeOperation = options.styleBlend;
    for (const cell of cells) {
      if (!cell.alpha || cell.random >= options.coverage / 100) continue;
      const edge = Math.hypot(cell.slopeX, cell.slopeY) * options.edgeEmphasis / 100;
      const light = curve(options.invert ? 1 - cell.light : cell.light, options.toneCurve);
      const tone = clamp(light * (.5 + options.density / 100) + edge);
      ink.fillStyle = ink.strokeStyle = cell.color;
      ink.globalAlpha = cell.alpha;
      drawCell(ink, cell, size, tone, options, time);
    }
    ink.restore();
    frame.clearRect(0, 0, w, h); frame.save();
    frame.filter = `brightness(${100 + options.brightness}%) contrast(${100 + options.contrast}%) saturate(${options.saturation}%) grayscale(${options.grayscale}%)`;
    frame.drawImage(ink.canvas, 0, 0); frame.restore();
    if (options.tintOpacity) {
      frame.save(); frame.globalCompositeOperation = options.overlayBlend; frame.globalAlpha = options.tintOpacity / 100;
      frame.fillStyle = options.tint; frame.fillRect(0, 0, w, h); frame.restore();
    }
    spatialBlur(frame, options); postProcess(frame, options);
  }
  build(0);
  let matrixTick = 0;
  return elapsed => {
    const time = elapsed * (options.animSpeed.enabled ? .2 + options.animSpeed.intensity / 30 : 1);
    const amount = options.animated && options.animIntensity.enabled ? options.animIntensity.intensity / 100 : 0;
    if (options.renderMode === 'matrix' && Math.floor(time * 4) !== matrixTick) {
      matrixTick = Math.floor(time * 4); build(time);
    }
    out.clearRect(0, 0, w, h); out.drawImage(frame.canvas, 0, 0);
    if (amount) {
      out.save();
      if (options.animStyle === 'ripple' || options.animStyle === 'wave') {
        for (let y = 0; y < h; y += 6) {
          const phase = (options.animStyle === 'ripple' ? Math.abs(y - h / 2) : y) / h * 12 - time * 2;
          out.drawImage(frame.canvas, 0, y, w, 6, Math.sin(phase) * amount * 9, y, w, 6);
        }
      } else if (options.animStyle === 'shimmer') {
        const y = (time * h / 4) % (h * 1.3) - h * .3;
        const beam = out.createLinearGradient(0, y, 0, y + h * .3);
        beam.addColorStop(0, 'transparent'); beam.addColorStop(.5, `rgba(255,255,255,${amount * .4})`); beam.addColorStop(1, 'transparent');
        out.fillStyle = beam; out.fillRect(0, y, w, h * .3);
      } else {
        const wave = options.animStyle === 'pulse' ? (1 + Math.sin(time * 2)) / 2 : noise(Math.floor(time * 8), 1);
        out.fillStyle = `rgba(0,0,0,${amount * wave})`; out.fillRect(0, 0, w, h);
      }
      out.restore();
    }
    const glitch = options.pfx.glitch;
    if (glitch.enabled && glitch.intensity) {
      const tick = Math.floor(time * 5);
      const y = Math.floor(noise(tick, 59) * (h - 4));
      const band = Math.max(1, Math.floor(h * .025 * glitch.intensity / 100));
      out.drawImage(frame.canvas, 0, y, w, band, glitch.intensity * w / 7000, y, w, band);
    }
    if (options.lights.enabled) {
      out.save(); out.globalCompositeOperation = 'screen';
      for (const point of options.lights.points) {
        const x = point.x * w, y = point.y * h;
        const radius = Math.max(1, (point.radius > 1 ? point.radius / 100 : point.radius) * w);
        const light = out.createRadialGradient(x, y, 0, x, y, radius);
        light.addColorStop(0, point.color || '#cee0d5'); light.addColorStop(1, 'transparent');
        out.globalAlpha = clamp(point.intensity > 1 ? point.intensity / 100 : point.intensity);
        out.fillStyle = light; out.fillRect(x - radius, y - radius, radius * 2, radius * 2);
      }
      out.restore();
    }
    if (reveal) out.drawImage(reveal.canvas, 0, 0);
  };
}
