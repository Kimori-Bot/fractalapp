import React, { useState, useEffect, useRef } from 'react';
import { StyleSheet, View, Text, TouchableOpacity, Dimensions } from 'react-native';
import { GLView } from 'expo-gl';
import { StatusBar } from 'expo-status-bar';

const VERTEX_SHADER = `
attribute vec2 position;
varying vec2 vUv;
void main() {
  vUv = position * 0.5 + 0.5;
  gl_Position = vec4(position, 0.0, 1.0);
}
`;

const FRAGMENT_SHADER = `
precision highp float;
varying vec2 vUv;
uniform vec2 resolution;
uniform float time;
uniform float zoom;
uniform vec2 center;
uniform int fractalType;
uniform vec2 juliaC;
uniform vec3 rotation;

// Cosine palette - beautiful colors
vec3 palette(float t) {
  vec3 a = vec3(0.5, 0.5, 0.5);
  vec3 b = vec3(0.5, 0.5, 0.5);
  vec3 c = vec3(1.0, 1.0, 1.0);
  vec3 d = vec3(0.0, 0.33, 0.67);
  return a + b * cos(6.28318 * (c * t + d));
}

mat3 rotateX(float a) {
  float c = cos(a), s = sin(a);
  return mat3(1.0, 0.0, 0.0, 0.0, c, -s, 0.0, s, c);
}

mat3 rotateY(float a) {
  float c = cos(a), s = sin(a);
  return mat3(c, 0.0, s, 0.0, 1.0, 0.0, -s, 0.0, c);
}

mat3 rotateZ(float a) {
  float c = cos(a), s = sin(a);
  return mat3(c, -s, 0.0, s, c, 0.0, 0.0, 0.0, 1.0);
}

void main() {
  vec2 uv = (vUv - 0.5) * 2.0;
  uv.x *= resolution.x / resolution.y;
  
  // Apply 3D rotation
  vec3 p = vec3(uv, 1.0 / zoom);
  p = rotateX(rotation.x) * rotateY(rotation.y) * rotateZ(rotation.z) * p;
  
  // Perspective projection
  float persp = 1.0 / (p.z + 1.5);
  vec2 c = p.xy * persp * 1.2 + center;
  
  // Initialize
  vec2 z = vec2(0.0);
  vec2 m = c;
  
  if (fractalType == 1) {
    z = c;
    m = juliaC;
  } else if (fractalType == 2) {
    z = c;
    m = c;
  }
  
  float maxIter = 120.0;
  float iter = 0.0;
  
  // Main fractal iteration
  for (float i = 0.0; i < 120.0; i++) {
    if (fractalType == 2) {
      // Burning Ship
      z = vec2(z.x*z.x - z.y*z.y, abs(2.0*z.x*z.y)) + m;
    } else {
      // Mandelbrot / Julia
      z = vec2(z.x*z.x - z.y*z.y, 2.0*z.x*z.y) + m;
    }
    
    if (dot(z, z) > 64.0) {
      iter = i;
      break;
    }
    iter = i;
  }
  
  vec3 col;
  
  if (iter >= maxIter - 1.0) {
    // Inside - dark
    col = vec3(0.0, 0.0, 0.02);
  } else {
    // Smooth iteration
    float smooth = iter + 1.0 - log(log(length(z))) / log(2.0);
    float t = smooth / 30.0;
    
    // Beautiful colors
    col = palette(t + rotation.y * 0.05);
    
    // Glow effect
    float glow = 1.0 - smooth / maxIter;
    glow = pow(glow, 0.6);
    col *= (0.4 + glow * 0.9);
    
    // Add inner glow
    col += vec3(0.01, 0.02, 0.05) * (1.0 - glow);
  }
  
  // 3D rotation shading
  col *= 0.85 + 0.15 * sin(rotation.x * 0.5 + rotation.y * 0.3);
  
  // Vignette
  float vign = 1.0 - length(vUv - 0.5) * 0.6;
  col *= vign;
  
  // Gamma
  col = pow(col, vec3(0.95));
  
  gl_FragColor = vec4(col, 1.0);
}
`;

export default function App() {
  const [fractalType, setFractalType] = useState(0);
  const [zoom, setZoom] = useState(1.0);
  const [centerX, setCenterX] = useState(-0.5);
  const [centerY, setCenterY] = useState(0);
  const [juliaC, setJuliaC] = useState({ real: -0.7, imag: 0.27015 });
  const [showControls, setShowControls] = useState(false);
  const [autoRotate, setAutoRotate] = useState(false);
  const [rotation, setRotation] = useState([0, 0, 0]);
  
  const stateRef = useRef({ fractalType: 0, zoom: 1, centerX: -0.5, centerY: 0, juliaC: { real: -0.7, imag: 0.27015 }, rotation: [0, 0, 0] });
  const glRef = useRef(null);
  const programRef = useRef(null);
  const startTime = useRef(Date.now());
  
  useEffect(() => {
    stateRef.current = { fractalType, zoom, centerX, centerY, juliaC, rotation };
  }, [fractalType, zoom, centerX, centerY, juliaC, rotation]);
  
  const onContextCreate = (gl) => {
    glRef.current = gl;
    
    const vert = gl.createShader(gl.VERTEX_SHADER);
    gl.shaderSource(vert, VERTEX_SHADER);
    gl.compileShader(vert);
    
    const frag = gl.createShader(gl.FRAGMENT_SHADER);
    gl.shaderSource(frag, FRAGMENT_SHADER);
    gl.compileShader(frag);
    
    const program = gl.createProgram();
    gl.attachShader(program, vert);
    gl.attachShader(program, frag);
    gl.linkProgram(program);
    gl.useProgram(program);
    programRef.current = program;
    
    const vertices = new Float32Array([-1,-1, 1,-1, -1,1, -1,1, 1,-1, 1,1]);
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);
    
    const posLoc = gl.getAttribLocation(program, 'position');
    gl.enableVertexAttribArray(posLoc);
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);
    
    const render = () => {
      if (!glRef.current || !programRef.current) return;
      
      const gl = glRef.current;
      const state = stateRef.current;
      
      gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
      gl.clearColor(0, 0, 0, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
      
      gl.useProgram(programRef.current);
      
      const time = (Date.now() - startTime.current) / 1000;
      const rot = state.rotation;
      const currentRot = autoRotate 
        ? [rot[0] + time * 0.2, rot[1] + time * 0.15, rot[2] + time * 0.1] 
        : rot;
      
      gl.uniform2f(gl.getUniformLocation(programRef.current, 'resolution'), gl.drawingBufferWidth, gl.drawingBufferHeight);
      gl.uniform1f(gl.getUniformLocation(programRef.current, 'time'), time);
      gl.uniform1f(gl.getUniformLocation(programRef.current, 'zoom'), state.zoom);
      gl.uniform2f(gl.getUniformLocation(programRef.current, 'center'), state.centerX, state.centerY);
      gl.uniform1i(gl.getUniformLocation(programRef.current, 'fractalType'), state.fractalType);
      gl.uniform2f(gl.getUniformLocation(programRef.current, 'juliaC'), state.juliaC.real, state.juliaC.imag);
      gl.uniform3fv(gl.getUniformLocation(programRef.current, 'rotation'), currentRot);
      
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      gl.endFrameEXP();
      
      requestAnimationFrame(render);
    };
    
    render();
  };
  
  const handleZoomIn = () => setZoom(z => Math.min(z * 2, 1e10));
  const handleZoomOut = () => setZoom(z => Math.max(z / 2, 0.5));
  
  const nextFractal = () => {
    setFractalType(t => (t + 1) % 3);
    setZoom(1);
    setCenterX(-0.5);
    setCenterY(0);
    setRotation([0, 0, 0]);
  };
  
  const handleReset = () => {
    setZoom(1);
    setCenterX(-0.5);
    setCenterY(0);
    setRotation([0, 0, 0]);
  };
  
  const adjustRotation = (axis, delta) => {
    setAutoRotate(false);
    setRotation(r => { const nr = [...r]; nr[axis] = nr[axis] + delta; return nr; });
  };
  
  const [gestureStart, setGestureStart] = useState(null);
  
  const handleTouchStart = (e) => {
    const touches = e.nativeEvent.touches;
    if (touches.length === 1) {
      setGestureStart({ x: touches[0].pageX, y: touches[0].pageY });
    }
  };
  
  const handleTouchMove = (e) => {
    const touches = e.nativeEvent.touches;
    
    if (touches.length === 1 && gestureStart) {
      const dx = touches[0].pageX - gestureStart.x;
      const dy = touches[0].pageY - gestureStart.y;
      if (Math.abs(dx) > 2 || Math.abs(dy) > 2) {
        // Pan
        const panSpeed = 0.03 / zoom;
        setCenterX(x => Math.max(-3, Math.min(3, x + dx * panSpeed)));
        setCenterY(y => Math.max(-3, Math.min(3, y - dy * panSpeed)));
        setGestureStart({ x: touches[0].pageX, y: touches[0].pageY });
      }
    } else if (touches.length === 2) {
      // Pinch zoom handled elsewhere
    }
  };
  
  const handleTouchEnd = () => setGestureStart(null);
  
  const FRACTAL_NAMES = ['Mandelbrot', 'Julia', 'Burning Ship'];
  
  return (
    <View 
      style={styles.container}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      <GLView style={styles.glView} onContextCreate={onContextCreate} />
      
      <TouchableOpacity style={styles.header} onPress={() => setShowControls(!showControls)}>
        <Text style={styles.title}>🌀 FractalGo</Text>
        <Text style={styles.subtitle}>
          {FRACTAL_NAMES[fractalType]} • {zoom < 10 ? zoom.toFixed(2) + 'x' : zoom.toExponential(1)}
          {autoRotate && ' • Auto'}
        </Text>
      </TouchableOpacity>
      
      {showControls && (
        <View style={styles.controlsPanel}>
          <Text style={styles.controlTitle}>Controls</Text>
          
          <TouchableOpacity style={styles.button} onPress={nextFractal}>
            <Text style={styles.buttonText}>{FRACTAL_NAMES[fractalType]} →</Text>
          </TouchableOpacity>
          
          <Text style={styles.label}>Zoom: {zoom < 10 ? zoom.toFixed(2) + 'x' : zoom.toExponential(1)}</Text>
          <View style={styles.sliderRow}>
            <TouchableOpacity style={styles.smallButton} onPress={handleZoomOut}>
              <Text style={styles.smallButtonText}>−</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.smallButton} onPress={handleZoomIn}>
              <Text style={styles.smallButtonText}>+</Text>
            </TouchableOpacity>
          </View>
          
          <TouchableOpacity 
            style={[styles.button, autoRotate && styles.activeButton]} 
            onPress={() => setAutoRotate(!autoRotate)}
          >
            <Text style={styles.buttonText}>Auto-Rotate: {autoRotate ? 'ON' : 'OFF'}</Text>
          </TouchableOpacity>
          
          <Text style={styles.label}>3D Rotate</Text>
          <View style={styles.sliderRow}>
            <TouchableOpacity style={styles.smallButton} onPress={() => adjustRotation(0, -0.2)}>
              <Text style={styles.smallButtonText}>X−</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.smallButton} onPress={() => adjustRotation(0, 0.2)}>
              <Text style={styles.smallButtonText}>X+</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.smallButton} onPress={() => adjustRotation(1, -0.2)}>
              <Text style={styles.smallButtonText}>Y−</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.smallButton} onPress={() => adjustRotation(1, 0.2)}>
              <Text style={styles.smallButtonText}>Y+</Text>
            </TouchableOpacity>
          </View>
          
          {fractalType === 1 && (
            <View style={styles.sliderRow}>
              <TouchableOpacity style={styles.smallButton} onPress={() => setJuliaC(c => ({ ...c, real: c.real - 0.05 }))}>
                <Text style={styles.smallButtonText}>Re−</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.smallButton} onPress={() => setJuliaC(c => ({ ...c, real: c.real + 0.05 }))}>
                <Text style={styles.smallButtonText}>Re+</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.smallButton} onPress={() => setJuliaC(c => ({ ...c, imag: c.imag - 0.05 }))}>
                <Text style={styles.smallButtonText}>Im−</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.smallButton} onPress={() => setJuliaC(c => ({ ...c, imag: c.imag + 0.05 }))}>
                <Text style={styles.smallButtonText}>Im+</Text>
              </TouchableOpacity>
            </View>
          )}
          
          <TouchableOpacity style={styles.resetButton} onPress={handleReset}>
            <Text style={styles.buttonText}>Reset</Text>
          </TouchableOpacity>
          
          <TouchableOpacity style={styles.closeButton} onPress={() => setShowControls(false)}>
            <Text style={styles.buttonText}>✕</Text>
          </TouchableOpacity>
        </View>
      )}
      
      <View style={styles.bottomBar}>
        <TouchableOpacity style={styles.actionButton} onPress={nextFractal}>
          <Text style={styles.actionText}>🔄</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionButton} onPress={handleZoomIn}>
          <Text style={styles.actionText}>+</Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={[styles.actionButton, autoRotate && styles.activeAction]} 
          onPress={() => setAutoRotate(!autoRotate)}
        >
          <Text style={styles.actionText}>🌀</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionButton} onPress={handleZoomOut}>
          <Text style={styles.actionText}>−</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionButton} onPress={() => setShowControls(true)}>
          <Text style={styles.actionText}>⚙</Text>
        </TouchableOpacity>
      </View>
      
      <StatusBar style="light" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  glView: { flex: 1 },
  header: {
    position: 'absolute', top: 50, left: 15, zIndex: 10,
    backgroundColor: 'rgba(0,0,0,0.7)', padding: 12, borderRadius: 12,
  },
  title: { fontSize: 22, fontWeight: 'bold', color: '#fff' },
  subtitle: { fontSize: 12, color: '#aaa', marginTop: 2 },
  controlsPanel: {
    position: 'absolute', top: 110, left: 15, right: 15, bottom: 110,
    backgroundColor: 'rgba(15,15,25,0.95)', borderRadius: 16, padding: 16,
    borderWidth: 1, borderColor: '#334', zIndex: 20,
  },
  controlTitle: { fontSize: 16, fontWeight: 'bold', color: '#fff', marginBottom: 12, textAlign: 'center' },
  label: { color: '#889', fontSize: 11, marginTop: 8, marginBottom: 3 },
  sliderRow: { flexDirection: 'row', justifyContent: 'space-around', marginBottom: 6 },
  button: { backgroundColor: '#334', padding: 10, borderRadius: 8, alignItems: 'center', marginBottom: 8 },
  activeButton: { backgroundColor: '#4a9' },
  smallButton: { backgroundColor: '#223', padding: 8, borderRadius: 6, minWidth: 50, alignItems: 'center', borderWidth: 1, borderColor: '#445' },
  smallButtonText: { color: '#fff', fontWeight: 'bold', fontSize: 12 },
  resetButton: { backgroundColor: '#4a9', padding: 10, borderRadius: 8, alignItems: 'center', marginTop: 10 },
  closeButton: { backgroundColor: '#844', padding: 10, borderRadius: 8, alignItems: 'center', marginTop: 6 },
  buttonText: { color: '#fff', fontWeight: 'bold', fontSize: 13 },
  bottomBar: {
    position: 'absolute', bottom: 25, left: 0, right: 0,
    flexDirection: 'row', justifyContent: 'space-around', paddingHorizontal: 15,
  },
  actionButton: {
    backgroundColor: 'rgba(40,40,60,0.85)', width: 50, height: 50, borderRadius: 25,
    justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: '#556',
  },
  activeAction: { backgroundColor: '#4a9', borderColor: '#6cb' },
  actionText: { fontSize: 18 },
});
