const bayer = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const mixed = ['dots', 'cross', 'diamond', 'lines', 'pixel'];

function polygon(ctx, x, y, radius, sides, inner = 1) {
  ctx.beginPath();
  for (let i = 0; i < sides; i++) {
    const angle = Math.PI * 2 * i / sides - Math.PI / 2;
    const r = radius * (i % 2 ? inner : 1);
    const px = x + r * Math.cos(angle), py = y + r * Math.sin(angle);
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fill();
}

function line(ctx, x, y, dx, dy) {
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + dx, y + dy);
  ctx.stroke();
}

export function drawCell(ctx, cell, size, tone, options, time) {
  const { x, y, col, row, random, upper, lower, slopeX, slopeY } = cell;
  const cx = x + size / 2, cy = y + size / 2;
  const r = size * Math.sqrt(tone) * 0.49;
  const mode = options.renderMode === 'mixed' ? mixed[Math.floor(random * mixed.length)] : options.renderMode;
  ctx.lineWidth = Math.max(.55, size * .09);
  switch (mode) {
    case 'dither': {
      const step = size / 4;
      for (let i = 0; i < 16; i++) {
        if ((bayer[i] + .5) / 16 < tone) ctx.fillRect(x + i % 4 * step, y + Math.floor(i / 4) * step, step, step);
      }
      break;
    }
    case 'pixel': ctx.fillRect(cx - r, cy - r, 2 * r, 2 * r); break;
    case 'mosaic': ctx.fillRect(x + .3, y + .3, size - .6, size - .6); break;
    case 'cross':
      line(ctx, cx - r, cy, r * 2, 0);
      line(ctx, cx, cy - r, 0, r * 2);
      break;
    case 'diamond': polygon(ctx, cx, cy, r, 4); break;
    case 'stars': polygon(ctx, cx, cy, r, 10, .42); break;
    case 'hexagons': polygon(ctx, cx + row % 2 * size / 2, cy, r * 1.1, 6); break;
    case 'triangles': polygon(ctx, cx, cy + (col % 2 ? -1 : 1) * r * .15, r * (col % 2 ? -1 : 1), 3); break;
    case 'dots': case 'rings': case 'bubbles':
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2);
      if (mode === 'dots') ctx.fill();
      else ctx.stroke();
      if (mode === 'bubbles') {
        ctx.beginPath(); ctx.arc(cx, cy, r * .67, 3.6, 4.9); ctx.stroke();
      }
      break;
    case 'lines': line(ctx, cx - r, cy, 2 * r, 0); break;
    case 'diagonal': case 'hatch':
      line(ctx, cx - r, cy + r, r * 2, -r * 2);
      if (mode === 'hatch' && tone > .42) line(ctx, cx - r, cy - r, r * 2, r * 2);
      break;
    case 'contour': {
      // Crossings of evenly spaced luminance levels, interpolated across the local gradient.
      const scale = Math.hypot(slopeX, slopeY);
      if (scale < .001) break;
      const dx = slopeX / scale, dy = slopeY / scale;
      const offset = (Math.round(tone * 10) / 10 - tone) * size / scale;
      if (Math.abs(offset) <= size / 2) {
        ctx.save(); ctx.beginPath(); ctx.rect(x, y, size, size); ctx.clip();
        line(ctx, cx + dx * offset - dy * size, cy + dy * offset + dx * size, dy * size * 2, -dx * size * 2);
        ctx.restore();
      }
      break;
    }
    case 'halfblocks':
      ctx.globalAlpha *= upper;
      ctx.fillRect(x, y, size, size / 2);
      ctx.globalAlpha = cell.alpha * lower;
      ctx.fillRect(x, cy, size, size / 2);
      break;
    case 'voxel': case 'lego':
      ctx.fillRect(cx - r, cy - r, 2 * r, 2 * r);
      ctx.fillStyle = 'rgba(255,255,255,.35)';
      if (mode === 'lego') {
        ctx.beginPath(); ctx.arc(cx, cy, r * .5, 0, 2 * Math.PI); ctx.fill();
      } else {
        ctx.beginPath(); ctx.moveTo(cx - r, cy - r); ctx.lineTo(cx + r, cy - r);
        ctx.lineTo(cx + r / 2, cy - r / 2); ctx.lineTo(cx - r / 2, cy - r / 2); ctx.fill();
        ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.fillRect(cx + r * .5, cy - r, r * .5, r * 2);
      }
      break;
    case 'hearts':
      ctx.beginPath(); ctx.moveTo(cx, cy + r);
      ctx.bezierCurveTo(cx - 2 * r, cy - r * .2, cx - r, cy - 1.6 * r, cx, cy - .45 * r);
      ctx.bezierCurveTo(cx + r, cy - 1.6 * r, cx + 2 * r, cy - r * .2, cx, cy + r); ctx.fill();
      break;
    case 'disco':
      ctx.fillStyle = `hsl(${(tone * 240 + col * 6) % 360} 76% 62%)`;
      ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
      break;
    case 'braille': case 'hexdump': case 'matrix': case 'characters': {
      const ramps = { binary: '01', standard: '.:-=+*#%@', ascii: ' .:-=+*#%@', blocks: '░▒▓█' };
      const ramp = options.customChars || ramps[options.charSet] || ramps.standard;
      let glyph = ramp[Math.round(tone * (ramp.length - 1))];
      if (mode === 'braille') glyph = String.fromCharCode(0x2800 + Math.round(tone * 255));
      if (mode === 'hexdump') glyph = Math.round(tone * 15).toString(16).toUpperCase();
      if (mode === 'matrix') {
        const phase = ((row - time * 7 + col * 19) % 21 + 21) % 21;
        ctx.fillStyle = `rgb(80,${Math.round(250 - phase * 8)},110)`;
        glyph = (row + col + Math.floor(time * 3)) % 2 ? '1' : '0';
      }
      ctx.font = `${size * (.56 + tone * .62)}px monospace`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(glyph, cx, cy);
      break;
    }
  }
}
