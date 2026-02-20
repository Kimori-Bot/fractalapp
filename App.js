import React, { useState, useEffect, useCallback } from 'react';
import { StyleSheet, View, Text, TouchableOpacity, Dimensions, ScrollView, Alert } from 'react-native';
import { Canvas, Skia, Paint, useCanvas, Image } from '@shopify/react-native-skia';

const { width, height } = Dimensions.get('window');

// Color palettes for fractals
const PALETTES = {
  psychedelic: ['#FF00FF', '#00FFFF', '#FFFF00', '#FF0000', '#00FF00'],
  ocean: ['#000033', '#000066', '#000099', '#0000CC', '#0066FF', '#00CCFF'],
  fire: ['#000000', '#330000', '#660000', '#990000', '#CC0000', '#FF0000', '#FFFF00'],
  neon: ['#FF00FF', '#00FFFF', '#FF0080', '#80FF00', '#00FF80'],
  sunset: ['#1a0a2e', '#3d1a5c', '#6b2d7b', '#a33d8f', '#d44d9b', '#f57c8a'],
  rainbow: ['#FF0000', '#FF7F00', '#FFFF00', '#00FF00', '#0000FF', '#4B0082', '#9400D3'],
};

const FRACTAL_TYPES = ['Mandelbrot', 'Julia', 'Burning Ship'];

// Generate pixel data for fractal
function generateFractalData(type, w, h, maxIter, zoom, offsetX, offsetY, juliaC) {
  const pixels = new Uint8Array(w * h * 4);
  
  for (let py = 0; py < h; py++) {
    for (let px = 0; px < w; px++) {
      const x0 = (px - w / 2) / (w / 4 * zoom) + offsetX;
      const y0 = (py - h / 2) / (h / 4 * zoom) + offsetY;
      
      let x = 0, y = 0;
      let iteration = 0;
      
      if (type === 'Mandelbrot') {
        while (x * x + y * y <= 4 && iteration < maxIter) {
          const xTemp = x * x - y * y + x0;
          y = 2 * x * y + y0;
          x = xTemp;
          iteration++;
        }
      } else if (type === 'Julia') {
        x = x0;
        y = y0;
        while (x * x + y * y <= 4 && iteration < maxIter) {
          const xTemp = x * x - y * y + juliaC.real;
          y = 2 * x * y + juliaC.imag;
          x = xTemp;
          iteration++;
        }
      } else if (type === 'Burning Ship') {
        while (x * x + y * y <= 4 && iteration < maxIter) {
          const xTemp = x * x - y * y + x0;
          y = Math.abs(2 * x * y) + y0;
          x = xTemp;
          iteration++;
        }
      }
      
      const index = (py * w + px) * 4;
      
      if (iteration === maxIter) {
        pixels[index] = 0;
        pixels[index + 1] = 0;
        pixels[index + 2] = 0;
      } else {
        // Color based on iteration using palette
        const hue = (iteration / maxIter) * 360;
        const [r, g, b] = hslToRgb(hue, 1, 0.5);
        pixels[index] = r;
        pixels[index + 1] = g;
        pixels[index + 2] = b;
      }
      pixels[index + 3] = 255;
    }
  }
  
  return pixels;
}

function hslToRgb(h, s, l) {
  let r, g, b;
  if (s === 0) {
    r = g = b = l;
  } else {
    const hue2rgb = (p, q, t) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1/6) return p + (q - p) * 6 * t;
      if (t < 1/2) return q;
      if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
      return p;
    };
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h / 360 + 1/3);
    g = hue2rgb(p, q, h / 360);
    b = hue2rgb(p, q, h / 360 - 1/3);
  }
  return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
}

function FractalCanvas({ type, maxIter, zoom, offsetX, offsetY, palette, juliaC }) {
  const canvasWidth = Math.floor(width);
  const canvasHeight = Math.floor(height - 150);
  
  // Generate fractal data (at lower resolution for performance)
  const scale = 4;
  const w = Math.floor(canvasWidth / scale);
  const h = Math.floor(canvasHeight / scale);
  
  const pixelData = generateFractalData(type, w, h, maxIter, zoom, offsetX, offsetY, juliaC);
  
  // Create Skia image from pixel data
  const image = Skia.Image.MakeImage(
    { width: w, height: h, colorType: 'RGBA_8888' },
    pixelData,
    w * 4
  );
  
  return (
    <View style={styles.canvasContainer}>
      <Canvas style={{ width: canvasWidth, height: canvasHeight }}>
        <Image
          image={image}
          rect={{ x: 0, y: 0, width: canvasWidth, height: canvasHeight }}
        />
      </Canvas>
    </View>
  );
}

export default function App() {
  const [fractalType, setFractalType] = useState('Mandelbrot');
  const [maxIter, setMaxIter] = useState(80);
  const [zoom, setZoom] = useState(1);
  const [offsetX, setOffsetX] = useState(0);
  const [offsetY, setOffsetY] = useState(0);
  const [paletteName, setPaletteName] = useState('rainbow');
  const [showControls, setShowControls] = useState(false);
  const [juliaC, setJuliaC] = useState({ real: -0.7, imag: 0.27015 });
  const [renderCount, setRenderCount] = useState(0);
  
  // Force re-render
  const [, setTick] = useState(0);
  
  useEffect(() => {
    const timer = setTimeout(() => {
      setTick(t => t + 1);
    }, 50);
    return () => clearTimeout(timer);
  }, [fractalType, maxIter, zoom, offsetX, offsetY, paletteName, juliaC]);
  
  const nextFractal = useCallback(() => {
    const idx = FRACTAL_TYPES.indexOf(fractalType);
    const next = FRACTAL_TYPES[(idx + 1) % FRACTAL_TYPES.length];
    setFractalType(next);
    setZoom(1);
    setOffsetX(0);
    setOffsetY(0);
  }, [fractalType]);
  
  const nextPalette = useCallback(() => {
    const keys = Object.keys(PALETTES);
    const idx = keys.indexOf(paletteName);
    setPaletteName(keys[(idx + 1) % keys.length]);
  }, [paletteName]);
  
  const handleZoomIn = () => setZoom(z => Math.min(z * 1.5, 100));
  const handleZoomOut = () => setZoom(z => Math.max(z / 1.5, 0.1));
  
  const handleReset = () => {
    setZoom(1);
    setOffsetX(0);
    setOffsetY(0);
  };
  
  const handlePan = (dx, dy) => {
    const panSpeed = 0.3 / zoom;
    setOffsetX(x => x - dx * panSpeed);
    setOffsetY(y => y - dy * panSpeed);
  };
  
  return (
    <View style={styles.container}>
      {/* Fractal Canvas */}
      <View style={styles.canvasWrapper}>
        <FractalCanvas
          type={fractalType}
          maxIter={maxIter}
          zoom={zoom}
          offsetX={offsetX}
          offsetY={offsetY}
          palette={PALETTES[paletteName]}
          juliaC={juliaC}
        />
      </View>
      
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>✨ FractalGo</Text>
        <TouchableOpacity onPress={() => setShowControls(!showControls)}>
          <Text style={styles.settingsIcon}>⚙️</Text>
        </TouchableOpacity>
      </View>
      
      {/* Controls Panel */}
      {showControls && (
        <View style={styles.controlsPanel}>
          <ScrollView>
            <Text style={styles.controlTitle}>✨ Controls</Text>
            
            <Text style={styles.label}>Type: {fractalType}</Text>
            <TouchableOpacity style={styles.button} onPress={nextFractal}>
              <Text style={styles.buttonText}>🔄 Switch Fractal</Text>
            </TouchableOpacity>
            
            <Text style={styles.label}>Iterations: {maxIter}</Text>
            <View style={styles.sliderRow}>
              <TouchableOpacity style={styles.smallButton} onPress={() => setMaxIter(m => Math.max(20, m - 20))}>
                <Text style={styles.smallButtonText}>-</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.smallButton} onPress={() => setMaxIter(m => Math.min(200, m + 20))}>
                <Text style={styles.smallButtonText}>+</Text>
              </TouchableOpacity>
            </View>
            
            <Text style={styles.label}>Zoom: {zoom.toFixed(2)}x</Text>
            <View style={styles.sliderRow}>
              <TouchableOpacity style={styles.smallButton} onPress={handleZoomOut}>
                <Text style={styles.smallButtonText}>🔍-</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.smallButton} onPress={handleZoomIn}>
                <Text style={styles.smallButtonText}>🔍+</Text>
              </TouchableOpacity>
            </View>
            
            <Text style={styles.label}>Pan Position</Text>
            <View style={styles.sliderRow}>
              <TouchableOpacity style={styles.smallButton} onPress={() => setOffsetX(x => x - 0.2 / zoom)}>
                <Text style={styles.smallButtonText}>⬅️</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.smallButton} onPress={() => setOffsetX(x => x + 0.2 / zoom)}>
                <Text style={styles.smallButtonText}>➡️</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.smallButton} onPress={() => setOffsetY(y => y - 0.2 / zoom)}>
                <Text style={styles.smallButtonText}>⬆️</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.smallButton} onPress={() => setOffsetY(y => y + 0.2 / zoom)}>
                <Text style={styles.smallButtonText}>⬇️</Text>
              </TouchableOpacity>
            </View>
            
            <Text style={styles.label}>Colors: {paletteName}</Text>
            <TouchableOpacity style={styles.button} onPress={nextPalette}>
              <Text style={styles.buttonText}>🎨 Change Palette</Text>
            </TouchableOpacity>
            
            {fractalType === 'Julia' && (
              <>
                <Text style={styles.label}>Julia C: {juliaC.real.toFixed(2)} + {juliaC.imag.toFixed(2)}i</Text>
                <View style={styles.sliderRow}>
                  <TouchableOpacity style={styles.smallButton} onPress={() => setJuliaC(c => ({ ...c, real: c.real - 0.05 }))}>
                    <Text style={styles.smallButtonText}>Re-</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.smallButton} onPress={() => setJuliaC(c => ({ ...c, real: c.real + 0.05 }))}>
                    <Text style={styles.smallButtonText}>Re+</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.smallButton} onPress={() => setJuliaC(c => ({ ...c, imag: c.imag - 0.05 }))}>
                    <Text style={styles.smallButtonText}>Im-</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.smallButton} onPress={() => setJuliaC(c => ({ ...c, imag: c.imag + 0.05 }))}>
                    <Text style={styles.smallButtonText}>Im+</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
            
            <TouchableOpacity style={styles.resetButton} onPress={handleReset}>
              <Text style={styles.buttonText}>🔁 Reset View</Text>
            </TouchableOpacity>
            
            <TouchableOpacity style={styles.closeButton} onPress={() => setShowControls(false)}>
              <Text style={styles.buttonText}>✕ Close</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      )}
      
      {/* Bottom Bar */}
      <View style={styles.bottomBar}>
        <TouchableOpacity style={styles.actionButton} onPress={nextFractal}>
          <Text style={styles.actionText}>🔄</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionButton} onPress={nextPalette}>
          <Text style={styles.actionText}>🎨</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionButton} onPress={handleZoomIn}>
          <Text style={styles.actionText}>➕</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionButton} onPress={handleZoomOut}>
          <Text style={styles.actionText}>➖</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionButton} onPress={() => setShowControls(true)}>
          <Text style={styles.actionText}>⚙️</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0D0D0D',
  },
  canvasWrapper: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  canvasContainer: {
    flex: 1,
  },
  header: {
    position: 'absolute',
    top: 50,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    zIndex: 10,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#fff',
    textShadowColor: '#6C5CE7',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 15,
  },
  settingsIcon: {
    fontSize: 28,
  },
  controlsPanel: {
    position: 'absolute',
    top: 100,
    left: 20,
    right: 20,
    bottom: 120,
    backgroundColor: 'rgba(26, 26, 46, 0.98)',
    borderRadius: 24,
    padding: 20,
    borderWidth: 2,
    borderColor: '#6C5CE7',
    zIndex: 20,
  },
  controlTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 15,
    textAlign: 'center',
  },
  label: {
    color: '#aaa',
    fontSize: 14,
    marginTop: 12,
    marginBottom: 6,
  },
  sliderRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 8,
  },
  button: {
    backgroundColor: '#6C5CE7',
    padding: 14,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 8,
  },
  smallButton: {
    backgroundColor: '#2D2D4A',
    padding: 12,
    borderRadius: 10,
    minWidth: 65,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#6C5CE7',
  },
  smallButtonText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 16,
  },
  resetButton: {
    backgroundColor: '#00CEC9',
    padding: 14,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 15,
  },
  closeButton: {
    backgroundColor: '#FD79A8',
    padding: 14,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 10,
  },
  buttonText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 16,
  },
  bottomBar: {
    position: 'absolute',
    bottom: 30,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingHorizontal: 10,
    paddingBottom: 10,
  },
  actionButton: {
    backgroundColor: 'rgba(108, 92, 231, 0.8)',
    width: 60,
    height: 60,
    borderRadius: 30,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#fff',
  },
  actionText: {
    fontSize: 24,
  },
});
