import React, { useState, useEffect, useRef } from 'react';
import { StyleSheet, View, Text, TouchableOpacity, Dimensions } from 'react-native';
import { GLView } from 'expo-gl';
import { StatusBar } from 'expo-status-bar';

const { width, height } = Dimensions.get('window');

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
uniform float beat;
uniform float bass;

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

vec3 hsv2rgb(vec3 c) {
  vec4 K = vec4(1.0, 2.0/3.0, 1.0/3.0, 3.0);
  vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
  return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}

// Drum & Bass beat fast 170 BPM
float dnbBeat(float t) {
  float bpm = 170.0;
  float beatTime = 60.0 / bpm;
  float phase = mod(t, beatTime) / beatTime;
  // Sharp attack, quick decay
  return pow(1.0 - phase, 8.0) * step(0.02, phase);
}

float dnbBass(float t) {
  // Sub bass pulse every beat
  float bpm = 170.0;
  float beatTime = 60.0 / bpm;
  float phase = mod(t, beatTime * 2.0) / (beatTime * 2.0);
  return pow(1.0 - phase, 4.0);
}

void main() {
  // Audio reactivity
  float beatPulse = dnbBeat(time);
  float bassPulse = dnbBass(time);
  
  // Beat affects zoom and rotation
  float beatZoom = zoom * (1.0 + beatPulse * 0.15);
  float beatRot = time * (0.5 + beatPulse * 2.0);
  
  vec2 uv = (vUv - 0.5) * 3.0;
  uv.x *= resolution.x / resolution.y;
  
  // Bass shakes the perspective
  uv += vec2(sin(time * 50.0), cos(time * 47.0)) * bassPulse * 0.02;
  
  vec3 p = vec3(uv, 1.0 / (beatZoom * 0.5 + 0.5));
  
  // Beat-reactive rotation
  p = rotateX(rotation.x + beatRot * 0.5) * rotateY(rotation.y + beatRot * 0.8) * rotateZ(rotation.z) * p;
  
  p.xy /= max(p.z, 0.1);
  
  vec2 c = p.xy * 0.3 + center;
  vec2 z = vec2(0.0);
  vec2 m = c;
  
  if (fractalType == 1) {
    z = c;
    m = juliaC;
  }
  
  float maxIter = 100.0 + log(beatZoom + 1.0) * 30.0;
  maxIter = min(maxIter, 400.0);
  float iter = 0.0;
  
  for (float i = 0.0; i < 400.0; i++) {
    if (i >= maxIter) break;
    
    if (fractalType == 2) {
      z = vec2(z.x*z.x - z.y*z.y, abs(2.0*z.x*z.y)) + m;
    } else {
      z = vec2(z.x*z.x - z.y*z.y, 2.0*z.x*z.y) + m;
    }
    
    if (dot(z, z) > 4.0) {
      iter = i;
      break;
    }
    iter = i;
  }
  
  if (iter >= maxIter - 1.0) {
    gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
  } else {
    float smooth = iter + 1.0 - log(log(length(z))) / log(2.0);
    
    // Rave colors - neon cyan, magenta, yellow
    float hue = mod(smooth * 0.04 + time * 0.3 + rotation.x + beatPulse * 0.3, 1.0);
    
    // Bass hits shift the hue dramatically
    hue += bassPulse * 0.15;
    
    float sat = 0.85 + beatPulse * 0.15;
    float val = 1.0 - pow(smooth / maxIter, 0.4);
    
    // Beat flash
    val = val * (0.7 + beatPulse * 0.5);
    
    // Neon glow
    vec3 color = hsv2rgb(vec3(hue, sat, val));
    
    // Add rave glow
    color += vec3(beatPulse * 0.3, bassPulse * 0.2, beatPulse * 0.4);
    
    // 3D lighting
    float lighting = 0.5 + 0.5 * sin(p.z * 3.14159 + rotation.x + beatRot);
    color *= (0.6 + 0.4 * lighting);
    
    // Flash on beat
    color += vec3(bassPulse * 0.15, bassPulse * 0.1, bassPulse * 0.2);
    
    gl_FragColor = vec4(color, 1.0);
  }
}
`;

export default function App() {
  const [fractalType, setFractalType] = useState(0);
  const [zoom, setZoom] = useState(1.0);
  const [centerX, setCenterX] = useState(-0.5);
  const [centerY, setCenterY] = useState(0);
  const [juliaC, setJuliaC] = useState({ real: -0.7, imag: 0.27015 });
  const [showControls, setShowControls] = useState(false);
  const [autoZoom, setAutoZoom] = useState(false);
  const [autoRotate, setAutoRotate] = useState(true);
  const [raveMode, setRaveMode] = useState(true); // Rave mode ON by default
  const [rotation, setRotation] = useState([0, 0, 0]);
  
  // Refs for WebGL to access current state
  const stateRef = useRef({ fractalType: 0, zoom: 1, centerX: -0.5, centerY: 0, juliaC: { real: -0.7, imag: 0.27015 }, rotation: [0, 0, 0] });
  const glRef = useRef(null);
  const programRef = useRef(null);
  const startTime = useRef(Date.now());
  
  // Keep refs in sync with state
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
      // Rave mode = crazy fast rotation
      const speed = raveMode ? 3.0 : 0.5;
      const currentRot = autoRotate ? [rot[0] + time * speed, rot[1] + time * speed * 1.5, rot[2] + time * speed * 0.5] : rot;
      
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
  
  // Animation loop for auto-zoom
  useEffect(() => {
    let animId;
    if (autoZoom) {
      const animate = () => {
        setZoom(z => Math.min(z * 1.015, 1e10));
        animId = requestAnimationFrame(animate);
      };
      animId = requestAnimationFrame(animate);
    }
    return () => cancelAnimationFrame(animId);
  }, [autoZoom]);
  
  const handleZoomIn = () => { setAutoZoom(false); setZoom(z => Math.min(z * 1.5, 1e10)); };
  const handleZoomOut = () => { setAutoZoom(false); setZoom(z => Math.max(z / 1.5, 0.3)); };
  
  const nextFractal = () => {
    setFractalType(t => (t + 1) % 3);
    setZoom(1);
    setCenterX(-0.5);
    setCenterY(0);
    setRotation([0, 0, 0]);
  };
  
  const handleReset = () => {
    setAutoZoom(false);
    setZoom(1);
    setCenterX(-0.5);
    setCenterY(0);
    setRotation([0, 0, 0]);
  };
  
  const adjustRotation = (axis, delta) => {
    setAutoRotate(false);
    setRotation(r => {
      const nr = [...r];
      nr[axis] = nr[axis] + delta;
      return nr;
    });
  };
  
  const handlePan = (dx, dy) => {
    const speed = 0.08 / zoom;
    setCenterX(x => Math.max(-3, Math.min(3, x - dx * speed)));
    setCenterY(y => Math.max(-3, Math.min(3, y - dy * speed)));
  };
  
  const [gestureStart, setGestureStart] = useState(null);
  
  const handleTouchMove = (e) => {
    if (!gestureStart) return;
    const dx = e.nativeEvent.pageX - gestureStart.x;
    const dy = e.nativeEvent.pageY - gestureStart.y;
    if (Math.abs(dx) > 2 || Math.abs(dy) > 2) {
      handlePan(dx * 0.015, dy * 0.015);
      setGestureStart({ x: e.nativeEvent.pageX, y: e.nativeEvent.pageY });
    }
  };
  
  const FRACTAL_NAMES = ['Mandelbrot', 'Julia', 'Burning Ship'];
  
  return (
    <View 
      style={styles.container}
      onTouchStart={(e) => setGestureStart({ x: e.nativeEvent.pageX, y: e.nativeEvent.pageY })}
      onTouchMove={handleTouchMove}
      onTouchEnd={() => setGestureStart(null)}
    >
      <GLView style={styles.glView} onContextCreate={onContextCreate} />
      
      <TouchableOpacity style={styles.header} onPress={() => setShowControls(!showControls)}>
        <Text style={styles.title}>✨ FractalGo 3D</Text>
        <Text style={styles.subtitle}>
          {FRACTAL_NAMES[fractalType]} • {zoom.toExponential(1)}x
          {autoRotate && ' • 🌀'}
        </Text>
      </TouchableOpacity>
      
      {showControls && (
        <View style={styles.controlsPanel}>
          <Text style={styles.controlTitle}>✨ 3D Controls</Text>
          
          <TouchableOpacity style={styles.button} onPress={nextFractal}>
            <Text style={styles.buttonText}>🔄 {FRACTAL_NAMES[fractalType]}</Text>
          </TouchableOpacity>
          
          <Text style={styles.label}>Zoom: {zoom.toExponential(1)}x</Text>
          <View style={styles.sliderRow}>
            <TouchableOpacity style={styles.smallButton} onPress={handleZoomOut}>
              <Text style={styles.smallButtonText}>-</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.smallButton, autoZoom && styles.activeButton]} onPress={() => setAutoZoom(!autoZoom)}>
              <Text style={styles.smallButtonText}>{autoZoom ? '🚀 ON' : '🚀'}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.smallButton} onPress={handleZoomIn}>
              <Text style={styles.smallButtonText}>+</Text>
            </TouchableOpacity>
          </View>
          
          <TouchableOpacity style={[styles.button, autoRotate && styles.activeButton]} onPress={() => setAutoRotate(!autoRotate)}>
            <Text style={styles.buttonText}>🌀 Auto-Rotate: {autoRotate ? 'ON' : 'OFF'}</Text>
          </TouchableOpacity>
          
          <Text style={styles.label}>Manual 3D Rotate</Text>
          <View style={styles.sliderRow}>
            <TouchableOpacity style={styles.smallButton} onPress={() => adjustRotation(0, -0.2)}>
              <Text style={styles.smallButtonText}>X-</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.smallButton} onPress={() => adjustRotation(0, 0.2)}>
              <Text style={styles.smallButtonText}>X+</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.smallButton} onPress={() => adjustRotation(1, -0.2)}>
              <Text style={styles.smallButtonText}>Y-</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.smallButton} onPress={() => adjustRotation(1, 0.2)}>
              <Text style={styles.smallButtonText}>Y+</Text>
            </TouchableOpacity>
          </View>
          
          {fractalType === 1 && (
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
          )}
          
          <TouchableOpacity style={styles.resetButton} onPress={handleReset}>
            <Text style={styles.buttonText}>🔁 Reset</Text>
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
        <TouchableOpacity style={[styles.actionButton, raveMode && styles.activeAction]} onPress={() => setRaveMode(!raveMode)}>
          <Text style={styles.actionText}>🎵</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionButton} onPress={handleZoomOut}>
          <Text style={styles.actionText}>-</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionButton} onPress={() => setShowControls(true)}>
          <Text style={styles.actionText}>⚙️</Text>
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
    position: 'absolute', top: 50, left: 20, zIndex: 10,
    backgroundColor: 'rgba(0,0,0,0.6)', padding: 10, borderRadius: 12,
  },
  title: { fontSize: 22, fontWeight: 'bold', color: '#fff' },
  subtitle: { fontSize: 11, color: '#aaa', marginTop: 2 },
  controlsPanel: {
    position: 'absolute', top: 110, left: 20, right: 20, bottom: 110,
    backgroundColor: 'rgba(20,20,40,0.95)', borderRadius: 20, padding: 18,
    borderWidth: 2, borderColor: '#6C5CE7', zIndex: 20,
  },
  controlTitle: { fontSize: 18, fontWeight: 'bold', color: '#fff', marginBottom: 15, textAlign: 'center' },
  label: { color: '#aaa', fontSize: 12, marginTop: 8, marginBottom: 3 },
  sliderRow: { flexDirection: 'row', justifyContent: 'space-around', marginBottom: 10 },
  button: { backgroundColor: '#6C5CE7', padding: 12, borderRadius: 8, alignItems: 'center', marginBottom: 10 },
  activeButton: { backgroundColor: '#00CEC9' },
  smallButton: { backgroundColor: '#2D2D4A', padding: 10, borderRadius: 6, minWidth: 55, alignItems: 'center', borderWidth: 1, borderColor: '#6C5CE7' },
  smallButtonText: { color: '#fff', fontWeight: 'bold', fontSize: 12 },
  resetButton: { backgroundColor: '#00CEC9', padding: 12, borderRadius: 8, alignItems: 'center', marginTop: 10 },
  closeButton: { backgroundColor: '#FD79A8', padding: 12, borderRadius: 8, alignItems: 'center', marginTop: 8 },
  buttonText: { color: '#fff', fontWeight: 'bold', fontSize: 14 },
  bottomBar: {
    position: 'absolute', bottom: 30, left: 0, right: 0,
    flexDirection: 'row', justifyContent: 'space-around', paddingHorizontal: 10,
  },
  actionButton: {
    backgroundColor: 'rgba(108,92,231,0.85)', width: 54, height: 54, borderRadius: 27,
    justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: '#fff',
  },
  activeAction: { backgroundColor: '#00CEC9', borderColor: '#00CEC9' },
  actionText: { fontSize: 20 },
});
