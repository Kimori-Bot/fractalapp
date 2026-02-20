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
uniform vec3 cameraPos;
uniform vec3 cameraDir;
uniform float fractalType;

#define MAX_STEPS 80
#define MAX_DIST 20.0
#define SURF_DIST 0.02

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
  return mandelbulb(p);
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

// Simple capsule SDF for the little guy
float sdCapsule(vec3 p, vec3 a, vec3 b, float r) {
  vec3 pa = p - a, ba = b - a;
  float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
  return length(pa - ba * h) - r;
}

float sdSphere(vec3 p, float r) {
  return length(p) - r;
}

// Little guy SDF
float littleGuy(vec3 p, float bob) {
  // Body (capsule)
  float body = sdCapsule(p, vec3(0.0, -0.3 + bob, 0.0), vec3(0.0, 0.2 + bob, 0.0), 0.15);
  
  // Head (sphere)
  float head = sdSphere(p - vec3(0.0, 0.4 + bob, 0.0), 0.12);
  
  // Eyes
  float eyeL = sdSphere(p - vec3(-0.04, 0.45 + bob, 0.1), 0.025);
  float eyeR = sdSphere(p - vec3(0.04, 0.45 + bob, 0.1), 0.025);
  
  // Combine
  float guy = min(body, head);
  guy = min(guy, eyeL);
  guy = min(guy, eyeR);
  
  return guy;
}

void main() {
  vec2 uv = (vUv - 0.5) * 2.0;
  uv.x *= resolution.x / resolution.y;
  
  // Camera setup from uniforms
  vec3 ro = cameraPos;
  
  // Build camera matrix from direction
  vec3 forward = normalize(cameraDir);
  vec3 right = normalize(cross(vec3(0.0, 1.0, 0.0), forward));
  vec3 up = cross(forward, right);
  
  vec3 rd = normalize(uv.x * right + uv.y * up + 1.5 * forward);
  
  // Bob animation for little guy
  float bob = sin(time * 2.0) * 0.05;
  
  float d = rayMarch(ro, rd);
  
  vec3 col = vec3(0.0);
  
  // Check little guy intersection first
  vec3 guyPos = ro + rd * 1.5; // Little guy in front of camera
  float guyDist = littleGuy(guyPos, bob);
  
  if (guyDist < 0.1 && d > 1.5) {
    // Render little guy
    vec3 gp = guyPos;
    float gd = littleGuy(gp, bob);
    
    vec3 gn;
    if (gd < 0.01) {
      gn = normalize(vec3(
        littleGuy(gp + vec3(0.01, 0, 0), bob) - littleGuy(gp - vec3(0.01, 0, 0), bob),
        littleGuy(gp + vec3(0, 0.01, 0), bob) - littleGuy(gp - vec3(0, 0.01, 0), bob),
        littleGuy(gp + vec3(0, 0, 0.01), bob) - littleGuy(gp - vec3(0, 0, 0.01), bob)
      ));
    } else {
      gn = normalize(-rd);
    }
    
    vec3 light = normalize(vec3(0.5, 1.0, 0.5));
    float diff = max(dot(gn, light), 0.0);
    
    // Little guy colors - cute cyan/teal
    col = vec3(0.2, 0.8, 0.9) * (0.4 + diff * 0.6);
    
    // Glow around little guy
    float glow = 0.1 / (guyDist + 0.1);
    col += vec3(0.3, 0.9, 1.0) * glow * 0.3;
  }
  else if (d < MAX_DIST) {
    // Render fractal
    vec3 p = ro + rd * d;
    vec3 n = getNormal(p);
    
    vec3 light = normalize(vec3(1.0, 1.0, 1.0));
    float diff = max(dot(n, light), 0.0);
    float amb = 0.2;
    
    // Color based on position
    float hue = mod(length(p) * 0.5 + time * 0.05, 1.0);
    vec3 baseCol = vec3(
      0.5 + 0.5 * cos(time * 0.2 + hue * 6.28),
      0.5 + 0.5 * cos(time * 0.3 + hue * 6.28 + 2.0),
      0.5 + 0.5 * cos(time * 0.25 + hue * 6.28 + 4.0)
    );
    
    col = baseCol * (amb + diff * 0.8);
    
    // Rim light
    float rim = 1.0 - max(dot(-rd, n), 0.0);
    col += rim * rim * vec3(0.4, 0.3, 0.7) * 0.5;
    
    // Glow near surface
    col += vec3(0.1, 0.2, 0.4) * (1.0 / (d + 1.0));
  } else {
    // Background - deep space
    col = vec3(0.01, 0.01, 0.03);
    col += vec3(0.05, 0.02, 0.1) * (1.0 - length(uv) * 0.3);
  }
  
  // Vignette
  col *= 1.0 - length(vUv - 0.5) * 0.5;
  
  // Gamma
  col = pow(col, vec3(0.9));
  
  gl_FragColor = vec4(col, 1.0);
}
`;

export default function App() {
  const [fractalType, setFractalType] = useState(0);
  const [showControls, setShowControls] = useState(false);
  
  // Camera state
  const [cameraPos, setCameraPos] = useState([0, 0, 2.5]);
  const [cameraRot, setCameraRot] = useState([0, 0]); // pitch, yaw
  
  // Movement state
  const [moving, setMoving] = useState({ forward: false, backward: false, left: false, right: false, up: false, down: false });
  
  const stateRef = useRef({ cameraPos: [0, 0, 2.5], cameraRot: [0, 0], moving: { forward: false, backward: false, left: false, right: false, up: false, down: false } });
  const glRef = useRef(null);
  const programRef = useRef(null);
  const startTime = useRef(Date.now());
  const velocityRef = useRef([0, 0, 0]);
  
  useEffect(() => {
    stateRef.current = { cameraPos, cameraRot, moving };
  }, [cameraPos, cameraRot, moving]);
  
  // Keyboard handlers
  useEffect(() => {
    const handleKeyDown = (e) => {
      const key = e.key.toLowerCase();
      setMoving(m => ({
        ...m,
        forward: m.forward || key === 'w' || key === 'arrowup',
        backward: m.backward || key === 's' || key === 'arrowdown',
        left: m.left || key === 'a' || key === 'arrowleft',
        right: m.right || key === 'd' || key === 'arrowright',
        up: m.up || key === ' ',
        down: m.down || key === 'shift'
      }));
    };
    
    const handleKeyUp = (e) => {
      const key = e.key.toLowerCase();
      setMoving(m => ({
        ...m,
        forward: m.forward && key !== 'w' && key !== 'arrowup',
        backward: m.backward && key !== 's' && key !== 'arrowdown',
        left: m.left && key !== 'a' && key !== 'arrowleft',
        right: m.right && key !== 'd' && key !== 'arrowright',
        up: m.up && key !== ' ',
        down: m.down && key !== 'shift'
      }));
    };
    
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);
  
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
      
      // Update physics
      const speed = 0.03;
      const friction = 0.9;
      
      let [vx, vy, vz] = velocityRef.current;
      const [pitch, yaw] = state.cameraRot;
      
      // Direction vectors
      const cosY = Math.cos(yaw), sinY = Math.sin(yaw);
      const cosP = Math.cos(pitch), sinP = Math.sin(pitch);
      
      if (state.moving.forward) { vx += sinY * cosP * speed; vy += sinP * speed; vz += cosY * cosP * speed; }
      if (state.moving.backward) { vx -= sinY * cosP * speed; vy -= sinP * speed; vz -= cosY * cosP * speed; }
      if (state.moving.left) { vx -= cosY * speed; vz += sinY * speed; }
      if (state.moving.right) { vx += cosY * speed; vz -= sinY * speed; }
      if (state.moving.up) { vy += speed; }
      if (state.moving.down) { vy -= speed; }
      
      vx *= friction; vy *= friction; vz *= friction;
      velocityRef.current = [vx, vy, vz];
      
      // Update camera position
      const [px, py, pz] = state.cameraPos;
      setCameraPos([px + vx, py + vy, pz + vz]);
      
      gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
      gl.clearColor(0, 0, 0, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
      
      gl.useProgram(programRef.current);
      
      const time = (Date.now() - startTime.current) / 1000;
      
      // Camera direction from rotation
      const camDir = [Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch)];
      
      gl.uniform2f(gl.getUniformLocation(programRef.current, 'resolution'), gl.drawingBufferWidth, gl.drawingBufferHeight);
      gl.uniform1f(gl.getUniformLocation(programRef.current, 'time'), time);
      gl.uniform3f(gl.getUniformLocation(programRef.current, 'cameraPos'), px + vx, py + vy, pz + vz);
      gl.uniform3f(gl.getUniformLocation(programRef.current, 'cameraDir'), camDir[0], camDir[1], camDir[2]);
      gl.uniform1f(gl.getUniformLocation(programRef.current, 'fractalType'), fractalType);
      
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      gl.endFrameEXP();
      
      requestAnimationFrame(render);
    };
    
    render();
  };
  
  // Touch controls
  const [touchStart, setTouchStart] = useState(null);
  
  const handleTouchStart = (e) => {
    const t = e.nativeEvent.touches;
    if (t.length === 1) setTouchStart({ x: t[0].pageX, y: t[0].pageY, rot: [...cameraRot] });
  };
  
  const handleTouchMove = (e) => {
    if (!touchStart) return;
    const t = e.nativeEvent.touches;
    if (t.length === 1) {
      const dx = t[0].pageX - touchStart.x;
      const dy = t[0].pageY - touchStart.y;
      setCameraRot([touchStart.rot[0] + dy * 0.005, touchStart.rot[1] + dx * 0.005]);
    }
  };
  
  const handleTouchEnd = () => setTouchStart(null);
  
  const handleReset = () => {
    setCameraPos([0, 0, 2.5]);
    setCameraRot([0, 0]);
    velocityRef.current = [0, 0, 0];
  };
  
  const moveForward = () => { setMoving(m => ({ ...m, forward: true })); setTimeout(() => setMoving(m => ({ ...m, forward: false })), 100); };
  const moveBack = () => { setMoving(m => ({ ...m, backward: true })); setTimeout(() => setMoving(m => ({ ...m, backward: false })), 100); };
  const moveLeft = () => { setMoving(m => ({ ...m, left: true })); setTimeout(() => setMoving(m => ({ ...m, left: false })), 100); };
  const moveRight = () => { setMoving(m => ({ ...m, right: true })); setTimeout(() => setMoving(m => ({ ...m, right: false })), 100); };
  
  return (
    <View 
      style={styles.container}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      <GLView style={styles.glView} onContextCreate={onContextCreate} />
      
      <TouchableOpacity style={styles.header} onPress={() => setShowControls(!showControls)}>
        <Text style={styles.title}>🌀 FractalFly</Text>
        <Text style={styles.subtitle}>WASD to move • Drag to look</Text>
      </TouchableOpacity>
      
      {showControls && (
        <View style={styles.controlsPanel}>
          <Text style={styles.controlTitle}>Fly Controls</Text>
          <Text style={styles.label}>WASD - Move | Space/Shift - Up/Down</Text>
          <Text style={styles.label}>Drag - Look around</Text>
          <Text style={styles.label}>Pos: {cameraPos.map(p => p.toFixed(2)).join(', ')}</Text>
          
          <View style={styles.dpad}>
            <TouchableOpacity style={styles.dpadBtn} onPress={moveForward}><Text style={styles.dpadText}>▲</Text></TouchableOpacity>
            <View style={styles.dpadRow}>
              <TouchableOpacity style={styles.dpadBtn} onPress={moveLeft}><Text style={styles.dpadText}>◀</Text></TouchableOpacity>
              <TouchableOpacity style={styles.dpadBtn} onPress={moveBack}><Text style={styles.dpadText}>▼</Text></TouchableOpacity>
              <TouchableOpacity style={styles.dpadBtn} onPress={moveRight}><Text style={styles.dpadText}>▶</Text></TouchableOpacity>
            </View>
          </View>
          
          <TouchableOpacity style={styles.resetButton} onPress={handleReset}>
            <Text style={styles.buttonText}>Reset Position</Text>
          </TouchableOpacity>
          
          <TouchableOpacity style={styles.closeButton} onPress={() => setShowControls(false)}>
            <Text style={styles.buttonText}>✕</Text>
          </TouchableOpacity>
        </View>
      )}
      
      <View style={styles.bottomBar}>
        <TouchableOpacity style={styles.actionButton} onPress={moveLeft}><Text style={styles.actionText}>◀</Text></TouchableOpacity>
        <TouchableOpacity style={styles.actionButton} onPress={moveForward}><Text style={styles.actionText}>▲</Text></TouchableOpacity>
        <TouchableOpacity style={styles.actionButton} onPress={moveBack}><Text style={styles.actionText}>▼</Text></TouchableOpacity>
        <TouchableOpacity style={styles.actionButton} onPress={moveRight}><Text style={styles.actionText}>▶</Text></TouchableOpacity>
        <TouchableOpacity style={styles.actionButton} onPress={() => setShowControls(true)}><Text style={styles.actionText}>⚙</Text></TouchableOpacity>
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
  subtitle: { fontSize: 11, color: '#aaa', marginTop: 2 },
  controlsPanel: {
    position: 'absolute', top: 110, left: 15, right: 15, bottom: 110,
    backgroundColor: 'rgba(15,15,25,0.95)', borderRadius: 16, padding: 16,
    borderWidth: 1, borderColor: '#334', zIndex: 20,
  },
  controlTitle: { fontSize: 16, fontWeight: 'bold', color: '#fff', marginBottom: 8, textAlign: 'center' },
  label: { color: '#889', fontSize: 11, marginBottom: 4 },
  dpad: { alignItems: 'center', marginVertical: 10 },
  dpadRow: { flexDirection: 'row' },
  dpadBtn: { backgroundColor: '#334', width: 45, height: 45, borderRadius: 8, justifyContent: 'center', alignItems: 'center', margin: 3 },
  dpadText: { color: '#fff', fontSize: 18 },
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
  actionText: { fontSize: 18, color: '#fff' },
});
