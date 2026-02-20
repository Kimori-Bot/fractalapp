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
uniform vec3 center;
uniform int fractalType;
uniform vec3 juliaC;
uniform vec3 rotation;
uniform float beat;
uniform float bass;

#define MAX_STEPS 80
#define MAX_DIST 10.0
#define SURF_DIST 0.001
#define POWER 8.0

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

// Drum & Bass 170 BPM beat
float dnbBeat(float t) {
  float bpm = 170.0;
  float beatTime = 60.0 / bpm;
  float phase = mod(t, beatTime) / beatTime;
  return pow(1.0 - phase, 8.0) * step(0.02, phase);
}

float dnbBass(float t) {
  float bpm = 170.0;
  float beatTime = 60.0 / bpm;
  float phase = mod(t, beatTime * 2.0) / (beatTime * 2.0);
  return pow(1.0 - phase, 4.0);
}

// Mandelbulb distance estimator
float mandelbulbDE(vec3 pos, float power) {
  vec3 z = pos;
  float dr = 1.0;
  float r = 0.0;
  
  for (int i = 0; i < 8; i++) {
    r = length(z);
    if (r > 2.0) break;
    
    // Convert to spherical
    float theta = acos(z.z / r);
    float phi = atan(z.y, z.x);
    dr = pow(r, power - 1.0) * power * dr + 1.0;
    
    // Scale and rotate
    float zr = pow(r, power);
    theta = theta * power;
    phi = phi * power;
    
    // Convert back to cartesian
    z = zr * vec3(sin(theta) * cos(phi), sin(theta) * sin(phi), cos(theta));
    z += pos;
  }
  return 0.5 * log(r) * r / dr;
}

// Julia bulb with quaternion-like iteration
float juliaDE(vec3 pos, vec3 c) {
  vec3 z = pos;
  float md = 1.0;
  float mz2 = dot(z, z);
  
  for (int i = 0; i < 8; i++) {
    md *= 4.0 * sqrt(mz2);
    
    // Quaternion-like iteration
    float x = z.x; float x2 = x*x;
    float y = z.y; float y2 = y*y;
    float z2 = z.z*z.z;
    
    z.y = 2.0*x*y + c.y;
    z.z = 2.0*x*z + c.z;
    z.x = x2 - y2 - z2 + c.x;
    
    mz2 = dot(z, z);
    if (mz2 > 4.0) break;
  }
  return 0.25 * sqrt(mz2 / md) * log(mz2);
}

// Mandelbox fold
float mandelboxDE(vec3 pos, float s) {
  vec4 scale = vec4(s);
  float mr = 4.0;
  float minRadius2 = 0.25;
  float fixedRadius2 = 1.0;
  
  vec3 p = pos;
  float dr = 1.0;
  
  for (int i = 0; i < 10; i++) {
    // Box fold
    p = clamp(p, -1.0, 1.0) * 2.0 - p;
    
    // Sphere fold
    float r2 = dot(p, p);
    if (r2 < minRadius2) {
      p = sqrt(minRadius2 / r2) * p;
      dr = dr * (sqrt(minRadius2 / minRadius2));
    } else if (r2 < fixedRadius2) {
      p = sqrt(fixedRadius2 / r2) * p;
      dr = dr * (sqrt(fixedRadius2 / r2));
    }
    
    // Scale and translate
    p = scale.xyz * p + pos;
    dr = dr * abs(scale.x) + 1.0;
  }
  return (length(p) - 2.0) / dr;
}

float sceneSDF(vec3 p) {
  // Apply rotation
  float beatRot = time * (0.5 + dnbBeat(time) * 2.0);
  p = rotateX(rotation.x + beatRot * 0.3) * rotateY(rotation.y + beatRot * 0.5) * rotateZ(rotation.z) * p;
  
  // Center offset
  p -= center;
  
  if (fractalType == 0) {
    return mandelbulbDE(p, POWER + sin(time * 0.5) * 0.5);
  } else if (fractalType == 1) {
    return juliaDE(p, juliaC);
  } else {
    return mandelboxDE(p, 2.0 + dnbBass(time) * 0.5);
  }
}

vec3 getNormal(vec3 p) {
  float d = sceneSDF(p);
  vec2 e = vec2(0.001, 0.0);
  vec3 n = d - vec3(
    sceneSDF(p - e.xyy),
    sceneSDF(p - e.yxy),
    sceneSDF(p - e.yyx)
  );
  return normalize(n);
}

float rayMarch(vec3 ro, vec3 rd) {
  float dO = 0.0;
  
  for (int i = 0; i < MAX_STEPS; i++) {
    vec3 p = ro + rd * dO;
    float dS = sceneSDF(p);
    dO += dS;
    if (dO > MAX_DIST || dS < SURF_DIST) break;
  }
  
  return dO;
}

void main() {
  float beatPulse = dnbBeat(time);
  float bassPulse = dnbBass(time);
  
  vec2 uv = (vUv - 0.5) * 2.0;
  uv.x *= resolution.x / resolution.y;
  
  // Camera setup
  float camDist = 3.5 / zoom;
  // Bass-reactive camera shake
  vec2 shake = vec2(sin(time * 50.0), cos(time * 47.0)) * bassPulse * 0.05;
  uv += shake;
  
  vec3 ro = vec3(0.0, 0.0, camDist);
  vec3 rd = normalize(vec3(uv, -1.5));
  
  // Rotate camera
  float camRot = time * 0.2;
  ro = rotateY(camRot) * ro;
  rd = rotateY(camRot) * rd;
  
  float d = rayMarch(ro, rd);
  
  vec3 col = vec3(0.0);
  
  if (d < MAX_DIST) {
    vec3 p = ro + rd * d;
    vec3 n = getNormal(p);
    
    // Lighting
    vec3 lightDir = normalize(vec3(1.0, 1.0, 1.0));
    float diff = max(dot(n, lightDir), 0.0);
    float amb = 0.2;
    
    // Rim lighting
    float rim = 1.0 - max(dot(-rd, n), 0.0);
    rim = pow(rim, 3.0);
    
    // Color based on iteration/depth
    float depth = d / MAX_DIST;
    float hue = mod(depth * 0.5 + time * 0.1 + rotation.x * 0.1 + bassPulse * 0.2, 1.0);
    
    // Neon rave colors
    col = hsv2rgb(vec3(hue, 0.9, 1.0));
    
    // Apply lighting
    col *= (amb + diff * 0.8);
    col += rim * vec3(0.5, 0.2, 0.8) * (1.0 + beatPulse);
    
    // Beat flash
    col += vec3(beatPulse * 0.2, beatPulse * 0.1, beatPulse * 0.3);
    
    // Bass pulse glow
    col += vec3(0.2, 0.0, 0.4) * bassPulse;
  } else {
    // Background with subtle gradient
    col = vec3(0.02, 0.01, 0.05);
    col += vec3(0.1, 0.0, 0.2) * (1.0 - length(uv) * 0.5);
  }
  
  // Vignette
  float vign = 1.0 - length(vUv - 0.5) * 0.8;
  col *= vign;
  
  // Beat flash overlay
  col += vec3(beatPulse * 0.1, 0.0, beatPulse * 0.15);
  
  gl_FragColor = vec4(col, 1.0);
}
`;

export default function App() {
  const [fractalType, setFractalType] = useState(0);
  const [zoom, setZoom] = useState(1.0);
  const [centerX, setCenterX] = useState(0);
  const [centerY, setCenterY] = useState(0);
  const [centerZ, setCenterZ] = useState(0);
  const [juliaC, setJuliaC] = useState({ x: 0, y: 0, z: 0 });
  const [showControls, setShowControls] = useState(false);
  const [autoRotate, setAutoRotate] = useState(true);
  const [rotation, setRotation] = useState([0, 0, 0]);
  
  // Refs for WebGL
  const stateRef = useRef({ fractalType: 0, zoom: 1, center: [0, 0, 0], juliaC: [0, 0, 0], rotation: [0, 0, 0] });
  const glRef = useRef(null);
  const programRef = useRef(null);
  const startTime = useRef(Date.now());
  const raveMode = useRef(true);
  
  // Keep refs in sync
  useEffect(() => {
    stateRef.current = { fractalType, zoom, center: [centerX, centerY, centerZ], juliaC: [juliaC.x, juliaC.y, juliaC.z], rotation };
  }, [fractalType, zoom, centerX, centerY, centerZ, juliaC, rotation]);
  
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
      const speed = raveMode.current ? 3.0 : 0.5;
      const currentRot = autoRotate ? [rot[0] + time * speed, rot[1] + time * speed * 1.5, rot[2] + time * speed * 0.5] : rot;
      
      gl.uniform2f(gl.getUniformLocation(programRef.current, 'resolution'), gl.drawingBufferWidth, gl.drawingBufferHeight);
      gl.uniform1f(gl.getUniformLocation(programRef.current, 'time'), time);
      gl.uniform1f(gl.getUniformLocation(programRef.current, 'zoom'), state.zoom);
      gl.uniform3f(gl.getUniformLocation(programRef.current, 'center'), state.center[0], state.center[1], state.center[2]);
      gl.uniform1i(gl.getUniformLocation(programRef.current, 'fractalType'), state.fractalType);
      gl.uniform3f(gl.getUniformLocation(programRef.current, 'juliaC'), state.juliaC[0], state.juliaC[1], state.juliaC[2]);
      gl.uniform3fv(gl.getUniformLocation(programRef.current, 'rotation'), currentRot);
      
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      gl.endFrameEXP();
      
      requestAnimationFrame(render);
    };
    
    render();
  };
  
  const handleZoomIn = () => setZoom(z => Math.min(z * 1.5, 100));
  const handleZoomOut = () => setZoom(z => Math.max(z / 1.5, 0.3));
  
  const nextFractal = () => {
    setFractalType(t => (t + 1) % 3);
    setZoom(1);
    setCenterX(0); setCenterY(0); setCenterZ(0);
    setRotation([0, 0, 0]);
  };
  
  const handleReset = () => {
    setZoom(1);
    setCenterX(0); setCenterY(0); setCenterZ(0);
    setRotation([0, 0, 0]);
  };
  
  const adjustRotation = (axis, delta) => {
    setAutoRotate(false);
    setRotation(r => { const nr = [...r]; nr[axis] = nr[axis] + delta; return nr; });
  };
  
  const [gestureStart, setGestureStart] = useState(null);
  
  const handleTouchMove = (e) => {
    if (!gestureStart) return;
    const dx = e.nativeEvent.pageX - gestureStart.x;
    const dy = e.nativeEvent.pageY - gestureStart.y;
    if (Math.abs(dx) > 2 || Math.abs(dy) > 2) {
      const speed = 0.01 / zoom;
      setRotation(r => [r[0] + dy * speed, r[1] + dx * speed, r[2]]);
      setGestureStart({ x: e.nativeEvent.pageX, y: e.nativeEvent.pageY });
    }
  };
  
  const FRACTAL_NAMES = ['Mandelbulb', 'Julia 3D', 'Mandelbox'];
  
  return (
    <View 
      style={styles.container}
      onTouchStart={(e) => setGestureStart({ x: e.nativeEvent.pageX, y: e.nativeEvent.pageY })}
      onTouchMove={handleTouchMove}
      onTouchEnd={() => setGestureStart(null)}
    >
      <GLView style={styles.glView} onContextCreate={onContextCreate} />
      
      <TouchableOpacity style={styles.header} onPress={() => setShowControls(!showControls)}>
        <Text style={styles.title}>🔮 FractalGo 3D</Text>
        <Text style={styles.subtitle}>
          {FRACTAL_NAMES[fractalType]} • {zoom.toExponential(1)}x
          {autoRotate && ' • 🌀'}
        </Text>
      </TouchableOpacity>
      
      {showControls && (
        <View style={styles.controlsPanel}>
          <Text style={styles.controlTitle}>🔮 3D Fractals</Text>
          
          <TouchableOpacity style={styles.button} onPress={nextFractal}>
            <Text style={styles.buttonText}>🔄 {FRACTAL_NAMES[fractalType]}</Text>
          </TouchableOpacity>
          
          <Text style={styles.label}>Zoom: {zoom.toExponential(1)}x</Text>
          <View style={styles.sliderRow}>
            <TouchableOpacity style={styles.smallButton} onPress={handleZoomOut}>
              <Text style={styles.smallButtonText}>-</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.smallButton} onPress={handleZoomIn}>
              <Text style={styles.smallButtonText}>+</Text>
            </TouchableOpacity>
          </View>
          
          <TouchableOpacity style={[styles.button, autoRotate && styles.activeButton]} onPress={() => setAutoRotate(!autoRotate)}>
            <Text style={styles.buttonText}>🌀 Auto-Rotate: {autoRotate ? 'ON' : 'OFF'}</Text>
          </TouchableOpacity>
          
          <Text style={styles.label}>Manual Rotate</Text>
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
              <TouchableOpacity style={styles.smallButton} onPress={() => setJuliaC(c => ({ ...c, x: c.x - 0.1 }))}>
                <Text style={styles.smallButtonText}>X-</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.smallButton} onPress={() => setJuliaC(c => ({ ...c, x: c.x + 0.1 }))}>
                <Text style={styles.smallButtonText}>X+</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.smallButton} onPress={() => setJuliaC(c => ({ ...c, y: c.y - 0.1 }))}>
                <Text style={styles.smallButtonText}>Y-</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.smallButton} onPress={() => setJuliaC(c => ({ ...c, y: c.y + 0.1 }))}>
                <Text style={styles.smallButtonText}>Y+</Text>
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
        <TouchableOpacity style={styles.actionButton} onPress={() => raveMode.current = !raveMode.current}>
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
