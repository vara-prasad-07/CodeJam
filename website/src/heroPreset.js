// HS Office preset. Cell sizes refer to the design raster, independent of display density.
export const heroPreset = {
  renderMode: 'dither', bgMode: 'solid', bgColor: '#0c100e', bgBlur: 12,
  bgOpacity: 90, cellSize: 20, coverage: 62, invert: false,
  styleBlend: 'source-over', charSet: 'binary', customChars: '',
  brightness: -42, contrast: -26, edgeEmphasis: 21, density: 37,
  toneCurve: [{ x: 0, y: 0 }, { x: 1, y: 1 }],
  tint: '#cee0d5', tintOpacity: 0, overlayBlend: 'overlay', saturation: 102, grayscale: 0,
  blurType: 'off', blurAmount: 35, blurAngle: 0, directionalBothSides: false,
  tiltFocus: 35, tiltPosition: 50, tiltFeather: 15, lensFocus: 40,
  blurCenterX: 50, blurCenterY: 50, progressivePosition: 55, progressiveReverse: false,
  pfx: {
    scanLines: { enabled: true, intensity: 28 }, vignette: { enabled: true, intensity: 15 },
    bloom: { enabled: true, intensity: 60 }, chromatic: { enabled: true, intensity: 40 },
    filmGrain: { enabled: true, intensity: 40 }, glitch: { enabled: true, intensity: 20 },
    halftone: { enabled: false, intensity: 20 }, pixelate: { enabled: false, intensity: 15 },
    filmDust: { enabled: false, intensity: 20 },
  },
  animated: true, animStyle: 'flicker', animSpeed: { enabled: false, intensity: 41 },
  animIntensity: { enabled: true, intensity: 4 },
  lights: { enabled: false, points: [] },
  mask: { enabled: false, tool: 'freehand', brushSize: 30, showOverlay: false,
    invert: false, dataUrl: null, shapes: [] },
};
