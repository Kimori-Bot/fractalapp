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
uniform vec3 center;
uniform int fractalType;
uniform vec3 juliaC;
uniform vec3 rotation;

#define MAX_STEPS 100
#define MAX_DIST 50.0
#define SURF_DIST 0.002

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

vec3 palette(float t) {
  vec3 a = vec3(0.5, 0.5, 0.5);
  vec3 b = vec3(0.5, 0.5, 0.5);
  vec3 c = vec3(1.0, 1.0, 1.0);
  vec3 d = vec3(0.0, 0.33, 0.67);
  return a + b * cos(6.28318 * (c * t + d));
}

// Mandelbulb distance estimator
float mandelbulbDE(vec3 pos, float power) {
  vec3 z = pos;
  float dr = 1.0;
  float r = 0.0;
  
  for (int i = 0; i < 8; i++) {
    r = length(z);
    if (r > 2.0) break;
    
    float theta = acos(z.z / r);
    float phi = atan(z.y, z.x);
    dr = pow(r, power - 1.0) * power * dr + 1.0;
    
    float zr = pow(r, power);
    theta = theta * power;
    phi = phi * power;
    
    z = zr * vec3(sin(theta) * cos(phi), sin(theta) * sin(phi), cos(theta));
    z += pos;
  }
  return 0.5 * log(r) * r / dr;
}

// Julia bulb
float juliaDE(vec3 pos, vec3 c) {
  vec3 z = pos;
  float md = 1.0;
  float mz2 = dot(z, z);
  
  for (int i = 0; i < 8; i++) {
    md *= 4.0 * sqrt(mz2);
    
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

// Mandelbox
float mandelboxDE(vec3 pos, float scale) {
  vec4 s = vec4(scale);
  float mr = 4.0;
  float minR2 = 0.25;
  float fixedR2 = 1.0;
  
  vec3 p = pos;
  float dr = 1.0;
  
  for (int i = 0; i < 10; i++) {
    p = clamp(p, -1.0, 1.0) * 2.0 - p;
    
    float r2 = dot(p, p);
    if (r2 < minR2) {
      p = sqrt(minR2 / r2) * p;
      dr = dr * (sqrt(minR2 / minR2));
    } else if (r2 < fixedR2) {
      p = sqrt(fixedR2 / r2) * p;
      dr = dr * (sqrt(fixedR2 / r2));
    }
    
    p = s.xyz * p + pos;
    dr = dr * abs(s.x) + 1.0;
  }
  return (length(p) - 2.0) / dr;
}

float sceneSDF(vec3 p) {
  // Apply 3D rotation to the point
  p = rotateX(rotation.x) * rotateY(rotation.y) * rotateZ(rotation.z) * p;
  
  // Center offset
  p -= center;
  
  if (fractalType == 0) {
    return mandelbulbDE(p, 8.0);
  } else if (fractalType == 1) {
    return juliaDE(p, juliaC);
  } else {
    return mandelboxDE(p, 2.0);
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
  vec2 uv = (vUv - 0.5) * 2.0;
  uv.x *= resolution.x / resolution.y;
  
  // Camera setup
  float camDist = 3.0 / zoom;
  
  vec3 ro = vec3(0.0, 0.0, camDist);
  vec3 rd = normalize(vec3(uv, -1.5));
  
  // Orbit camera rotation
  float camAngleX = rotation.x * 0.5;
  float camAngleY = rotation.y * 0.5;
  
  ro = rotateY(camAngleY) * rotateX(camAngleX) * ro;
  rd = rotateY(camAngleY) * rotateX(camAngleX) * rd;
  
  float d = rayMarch(ro, rd);
  
  vec3 col = vec3(0.0);
  
  if (d < MAX_DIST) {
    vec3 p = ro + rd * d;
    vec3 n = getNormal(p);
    
    // Lighting
    vec3 lightDir = normalize(vec3(1.0, 1.0, 1.0));
    float diff = max(dot(n, lightDir), 0.0);
    float amb = 0.15;
    
    // Rim lighting
    float rim = 1.0 - max(dot(-rd, n), 0.0);
    rim = pow(rim, 2.5);
    
    // Color based on position and normal
    float hue = mod(length(p) * 0.3 + rotation.z * 0.1, 1.0);
    col = palette(hue);
    
    // Apply lighting
    col *= (amb + diff * 0.85);
    col += rim * vec3(0.4, 0.3, 0.6) * 0.8;
    
    // Ambient occlusion approximation
    col *= 0.7 + 0.3 * (1.0 - d / MAX_DIST);
  } else {
    // Background - deep space gradient
    col = vec3(0.01, 0.01, 0.03);
    col += vec3(0.05, 0.02, 0.08) * (1.0 - length(uv) * 0.3);
  }
  
  // Vignette
  float vign = 1.0 - length(vUv - 0.5) * 0.5;
  col *= vign;
  
  // Gamma correction
  col = pow(col, vec3(0.9));
  
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
  const [autoRotate, setAutoRotate] = useState(false);
  const [rotation, setRotation] = useState([0, 0, 0]);
  
  const stateRef = useRef({ fractalType: 0, zoom: 1, center: [0, 0, 0], juliaC: [0, 0, 0], rotation: [0, 0, 0] });
  const glRef = useRef(null);
  const programRef = useRef(null);
  const startTime = useRef(Date.now());
  
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
      const currentRot = autoRotate 
        ? [rot[0] + time * 0.3, rot[1] + time * 0.2, rot[2] + time * 0.1] 
        : rot;
      
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
  
  const handleZoomIn = () => setZoom(z => Math.min(z * 1.5, 50));
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
        const rotSpeed = 0.01;
        setRotation(r => [r[0] + dy * rotSpeed, r[1] + dx * rotSpeed, r[2]]);
        setGestureStart({ x: touches[0].pageX, y: touches[0].pageY });
      }
    }
  };
  
  const handleTouchEnd = () => setGestureStart(null);
  
  const FRACTAL_NAMES = ['Mandelbulb', 'Julia 3D', 'Mandelbox'];
  
  return (
    <View 
      style={styles.container}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      <GLView style={styles.glView} onContextCreate={onContextCreate} />
      
      <TouchableOpacity style={styles.header} onPress={() => setShowControls(!showControls)}>
        <Text style={styles.title}>💎 FractalGo 3D</Text>
        <Text style={styles.subtitle}>
          {FRACTAL_NAMES[fractalType]} • {zoom < 10 ? zoom.toFixed(2) + 'x' : zoom.toExponential(1)}
          {autoRotate && ' • Auto'}
        </Text>
      </TouchableOpacity>
      
      {showControls && (
        <View style={styles.controlsPanel}>
          <Text style={styles.controlTitle}>3D Fractals</Text>
          
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
              <TouchableOpacity style={styles.smallButton} onPress={() => setJuliaC(c => ({ ...c, x: c.x - 0.1 }))}>
                <Text style={styles.smallButtonText}>X−</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.smallButton} onPress={() => setJuliaC(c => ({ ...c, x: c.x + 0.1 }))}>
                <Text style={styles.smallButtonText}>X+</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.smallButton} onPress={() => setJuliaC(c => ({ ...c, y: c.y - 0.1 }))}>
                <Text style={styles.smallButtonText}>Y−</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.smallButton} onPress={() => setJuliaC(c => ({ ...c, y: c.y + 0.1 }))}>
                <Text style={styles.smallButtonText}>Y+</Text>
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
