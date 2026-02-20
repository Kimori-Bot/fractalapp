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
uniform int fractalType;
uniform vec3 rotation;

#define MAX_STEPS 64
#define MAX_DIST 10.0
#define SURF_DIST 0.01

mat3 rotateY(float a) {
  float c = cos(a), s = sin(a);
  return mat3(c, 0.0, s, 0.0, 1.0, 0.0, -s, 0.0, c);
}

mat3 rotateX(float a) {
  float c = cos(a), s = sin(a);
  return mat3(1.0, 0.0, 0.0, 0.0, c, -s, 0.0, s, c);
}

float mandelbulb(vec3 pos) {
  vec3 z = pos;
  float dr = 1.0;
  float r = 0.0;
  float power = 8.0;
  
  for (int i = 0; i < 6; i++) {
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

float scene(vec3 p) {
  // Rotate point
  vec3 rp = rotateY(rotation.y) * rotateX(rotation.x) * p;
  return mandelbulb(rp);
}

vec3 getNormal(vec3 p) {
  float d = scene(p);
  vec2 e = vec2(0.01, 0.0);
  return normalize(vec3(
    scene(p + e.xyy) - scene(p - e.xyy),
    scene(p + e.yxy) - scene(p - e.yxy),
    scene(p + e.yyx) - scene(p - e.yyx)
  ));
}

float rayMarch(vec3 ro, vec3 rd) {
  float d = 0.0;
  for (int i = 0; i < MAX_STEPS; i++) {
    vec3 p = ro + rd * d;
    float ds = scene(p);
    d += ds;
    if (ds < SURF_DIST || d > MAX_DIST) break;
  }
  return d;
}

void main() {
  vec2 uv = (vUv - 0.5) * 2.0;
  uv.x *= resolution.x / resolution.y;
  
  // Camera
  vec3 ro = vec3(0.0, 0.0, 2.5 / zoom);
  vec3 rd = normalize(vec3(uv, -1.5));
  
  // Rotate camera
  rd = rotateY(rotation.y * 0.5) * rotateX(rotation.x * 0.5) * rd;
  
  float d = rayMarch(ro, rd);
  
  vec3 col = vec3(0.0);
  
  if (d < MAX_DIST) {
    vec3 p = ro + rd * d;
    vec3 n = getNormal(p);
    
    // Simple lighting
    vec3 light = normalize(vec3(1.0, 1.0, 1.0));
    float diff = max(dot(n, light), 0.0);
    float amb = 0.2;
    
    // Color based on position
    col = vec3(0.3, 0.5, 0.8) * (amb + diff * 0.8);
    
    // Rim light
    float rim = 1.0 - max(dot(-rd, n), 0.0);
    col += rim * rim * vec3(0.4, 0.3, 0.6);
  } else {
    // Background
    col = vec3(0.02, 0.02, 0.05);
    col += vec3(0.05, 0.0, 0.1) * (1.0 - length(uv) * 0.4);
  }
  
  // Vignette
  col *= 1.0 - length(vUv - 0.5) * 0.6;
  
  gl_FragColor = vec4(col, 1.0);
}
`;

export default function App() {
  const [fractalType, setFractalType] = useState(0);
  const [zoom, setZoom] = useState(1.0);
  const [showControls, setShowControls] = useState(false);
  const [autoRotate, setAutoRotate] = useState(false);
  const [rotation, setRotation] = useState([0, 0]);
  
  const stateRef = useRef({ fractalType: 0, zoom: 1, rotation: [0, 0] });
  const glRef = useRef(null);
  const programRef = useRef(null);
  const startTime = useRef(Date.now());
  
  useEffect(() => {
    stateRef.current = { fractalType, zoom, rotation };
  }, [fractalType, zoom, rotation]);
  
  const onContextCreate = (gl) => {
    glRef.current = gl;
    
    const vert = gl.createShader(gl.VERTEX_SHADER);
    gl.shaderSource(vert, VERTEX_SHADER);
    gl.compileShader(vert);
    if (!gl.getShaderParameter(vert, gl.COMPILE_STATUS)) {
      console.log('Vert error:', gl.getShaderInfoLog(vert));
    }
    
    const frag = gl.createShader(gl.FRAGMENT_SHADER);
    gl.shaderSource(frag, FRAGMENT_SHADER);
    gl.compileShader(frag);
    if (!gl.getShaderParameter(frag, gl.COMPILE_STATUS)) {
      console.log('Frag error:', gl.getShaderInfoLog(frag));
    }
    
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
        ? [rot[0] + time * 0.3, rot[1] + time * 0.2] 
        : rot;
      
      gl.uniform2f(gl.getUniformLocation(programRef.current, 'resolution'), gl.drawingBufferWidth, gl.drawingBufferHeight);
      gl.uniform1f(gl.getUniformLocation(programRef.current, 'time'), time);
      gl.uniform1f(gl.getUniformLocation(programRef.current, 'zoom'), state.zoom);
      gl.uniform1i(gl.getUniformLocation(programRef.current, 'fractalType'), state.fractalType);
      gl.uniform2fv(gl.getUniformLocation(programRef.current, 'rotation'), currentRot);
      
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      gl.endFrameEXP();
      
      requestAnimationFrame(render);
    };
    
    render();
  };
  
  const handleZoomIn = () => setZoom(z => Math.min(z * 1.5, 20));
  const handleZoomOut = () => setZoom(z => Math.max(z / 1.5, 0.3));
  
  const handleReset = () => {
    setZoom(1);
    setRotation([0, 0]);
  };
  
  const adjustRotation = (axis, delta) => {
    setAutoRotate(false);
    setRotation(r => { const nr = [...r]; nr[axis] = nr[axis] + delta; return nr; });
  };
  
  const [gestureStart, setGestureStart] = useState(null);
  
  const handleTouchMove = (e) => {
    if (!gestureStart) return;
    const touches = e.nativeEvent.touches;
    if (touches.length === 1) {
      const dx = touches[0].pageX - gestureStart.x;
      const dy = touches[0].pageY - gestureStart.y;
      if (Math.abs(dx) > 2 || Math.abs(dy) > 2) {
        setRotation(r => [r[0] + dy * 0.01, r[1] + dx * 0.01]);
        setGestureStart({ x: touches[0].pageX, y: touches[0].pageY });
      }
    }
  };
  
  return (
    <View 
      style={styles.container}
      onTouchStart={(e) => setGestureStart({ x: e.nativeEvent.touches[0].pageX, y: e.nativeEvent.touches[0].pageY })}
      onTouchMove={handleTouchMove}
      onTouchEnd={() => setGestureStart(null)}
    >
      <GLView style={styles.glView} onContextCreate={onContextCreate} />
      
      <TouchableOpacity style={styles.header} onPress={() => setShowControls(!showControls)}>
        <Text style={styles.title}>💎 Mandelbulb 3D</Text>
        <Text style={styles.subtitle}>Zoom: {zoom.toFixed(2)}x {autoRotate && '• Auto'}</Text>
      </TouchableOpacity>
      
      {showControls && (
        <View style={styles.controlsPanel}>
          <Text style={styles.controlTitle}>3D Controls</Text>
          
          <Text style={styles.label}>Zoom: {zoom.toFixed(2)}x</Text>
          <View style={styles.sliderRow}>
            <TouchableOpacity style={styles.smallButton} onPress={handleZoomOut}>
              <Text style={styles.smallButtonText}>−</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.smallButton} onPress={handleZoomIn}>
              <Text style={styles.smallButtonText}>+</Text>
            </TouchableOpacity>
          </View>
          
          <TouchableOpacity style={[styles.button, autoRotate && styles.activeButton]} onPress={() => setAutoRotate(!autoRotate)}>
            <Text style={styles.buttonText}>Auto: {autoRotate ? 'ON' : 'OFF'}</Text>
          </TouchableOpacity>
          
          <Text style={styles.label}>Rotate</Text>
          <View style={styles.sliderRow}>
            <TouchableOpacity style={styles.smallButton} onPress={() => adjustRotation(0, -0.3)}>
              <Text style={styles.smallButtonText}>X−</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.smallButton} onPress={() => adjustRotation(0, 0.3)}>
              <Text style={styles.smallButtonText}>X+</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.smallButton} onPress={() => adjustRotation(1, -0.3)}>
              <Text style={styles.smallButtonText}>Y−</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.smallButton} onPress={() => adjustRotation(1, 0.3)}>
              <Text style={styles.smallButtonText}>Y+</Text>
            </TouchableOpacity>
          </View>
          
          <TouchableOpacity style={styles.resetButton} onPress={handleReset}>
            <Text style={styles.buttonText}>Reset</Text>
          </TouchableOpacity>
          
          <TouchableOpacity style={styles.closeButton} onPress={() => setShowControls(false)}>
            <Text style={styles.buttonText}>✕</Text>
          </TouchableOpacity>
        </View>
      )}
      
      <View style={styles.bottomBar}>
        <TouchableOpacity style={styles.actionButton} onPress={handleZoomIn}>
          <Text style={styles.actionText}>+</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.actionButton, autoRotate && styles.activeAction]} onPress={() => setAutoRotate(!autoRotate)}>
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
  title: { fontSize: 20, fontWeight: 'bold', color: '#fff' },
  subtitle: { fontSize: 12, color: '#aaa', marginTop: 2 },
  controlsPanel: {
    position: 'absolute', top: 110, left: 15, right: 15, bottom: 110,
    backgroundColor: 'rgba(15,15,25,0.95)', borderRadius: 16, padding: 16,
    borderWidth: 1, borderColor: '#334', zIndex: 20,
  },
  controlTitle: { fontSize: 16, fontWeight: 'bold', color: '#fff', marginBottom: 12, textAlign: 'center' },
  label: { color: '#889', fontSize: 11, marginTop: 8, marginBottom: 3 },
  sliderRow: { flexDirection: 'row', justifyContent: 'space-around', marginBottom: 8 },
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
