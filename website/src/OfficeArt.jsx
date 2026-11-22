import React, { useEffect, useRef, useState } from 'react';
import { Monitor, Pause, Play } from 'lucide-react';
import { heroPreset } from './heroPreset.js';
import { createOfficeRaster } from './officeRaster.js';

// Source: Evan-Amos, Apple-eMac-FL (transparent), public domain on Wikimedia Commons.
const source = '/assets/hero-emac.webp';
const motionQuery = '(prefers-reduced-motion: reduce)';

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = url;
  });
}

export function OfficeArt({ options = heroPreset }) {
  const canvasRef = useRef(null);
  const running = useRef(null);
  const [ready, setReady] = useState(false);
  const [reduced, setReduced] = useState(() => matchMedia(motionQuery).matches);
  const [paused, setPaused] = useState(null);
  const moving = (options.animated || options.renderMode === 'matrix') && !(paused ?? reduced);

  useEffect(() => {
    const query = matchMedia(motionQuery);
    const change = () => { setReduced(query.matches); setPaused(null); };
    query.addEventListener('change', change);
    return () => query.removeEventListener('change', change);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    let disposed = false, visible = true, playing = false, timer, frame, images;
    let elapsed = 0, lastTime = null;
    setReady(false);
    function stop() {
      clearTimeout(timer);
      lastTime = null;
    }
    function tick() {
      if (disposed || !frame || !visible || document.hidden || !playing) return;
      const now = performance.now();
      if (lastTime !== null) elapsed += (now - lastTime) / 1000;
      lastTime = now;
      frame(elapsed);
      timer = setTimeout(tick, 125);
    }
    function sync() { stop(); tick(); }
    function resize() {
      if (disposed || !images) return;
      const rect = canvas.getBoundingClientRect();
      if (rect.width < 1 || rect.height < 1) return;
      const ratio = Math.min(1.7, devicePixelRatio || 1, 900 / rect.width);
      const width = Math.round(rect.width * ratio), height = Math.round(rect.height * ratio);
      if (frame && width === canvas.width && height === canvas.height) return;
      canvas.width = width; canvas.height = height;
      frame = createOfficeRaster(canvas, images[0], options, images[1]);
      if (frame) { frame(elapsed); setReady(true); sync(); }
    }
    running.current = value => { playing = value; sync(); };
    const viewport = typeof IntersectionObserver !== 'undefined' && new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting; sync();
    });
    viewport && viewport.observe(canvas);
    const sizes = typeof ResizeObserver !== 'undefined' && new ResizeObserver(resize);
    sizes && sizes.observe(canvas);
    window.addEventListener('resize', resize);
    document.addEventListener('visibilitychange', sync);
    const maskUrl = options.mask.enabled && options.mask.dataUrl;
    Promise.all([loadImage(source), maskUrl ? loadImage(maskUrl) : null])
      .then(result => { images = result; resize(); })
      .catch(() => { if (!disposed) setReady(false); });
    return () => {
      disposed = true; stop(); running.current = null;
      viewport && viewport.disconnect(); sizes && sizes.disconnect();
      window.removeEventListener('resize', resize); document.removeEventListener('visibilitychange', sync);
    };
  }, [options]);
  useEffect(() => { running.current?.(moving); }, [moving, options]);

  return <figure className="office-art">
    <div className="art-stage" role="img" aria-label="A vintage eMac with a glowing terminal prompt, rendered in dithered pixels">
      {!ready && <img className="art-fallback" src={source} alt="" fetchPriority="high" />}
      <canvas ref={canvasRef} aria-hidden="true" style={{ opacity: ready ? 1 : 0 }} />
      <i className="registration top-left" /><i className="registration top-right" />
      <i className="registration bottom-left" /><i className="registration bottom-right" />
    </div>
    <figcaption><span><Monitor size={14} aria-hidden="true" /> Apple eMac, 2002</span>
      {ready && (options.animated || options.renderMode === 'matrix') &&
        <button type="button" onClick={() => setPaused(moving)} aria-label={moving ? 'Pause artwork animation' : 'Play artwork animation'}>
          {moving ? <Pause size={12} /> : <Play size={12} />} {moving ? 'Pause' : 'Play'}
        </button>}
    </figcaption>
  </figure>;
}
