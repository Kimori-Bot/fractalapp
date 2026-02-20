import React, { useState, useEffect, useRef } from 'react';
import { StyleSheet, View, Text, TouchableOpacity } from 'react-native';
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

#define MAX_STEPS 80
#define MAX_DIST 20.0
#define SURF_DIST 0.02

mat3 rotateY(float a) {
  float c = cos(a), s = sin(a);
  return mat3(c, 0.0, s, 0.0, 1.0, 0.0, -s, 0.0, c);
}

float mandelbulb(vec3 pos) {
  vec3 z = pos;
  float dr = 1.0;
  float r = 0.0;
  for (int i = 0; i < 6; i++) {
    r = length(z);
    if (r > 2.0) break;
    float theta = acos(z.z / r);
    float phi = atan(z.y, z.x);
    dr = pow(r, 7.0) * 8.0 * dr + 1.0;
    float zr = pow(r, 8.0);
    z = zr * vec3(sin(theta*8.0)*cos(phi*8.0), sin(theta*8.0)*sin(phi*8.0), cos(theta*8.0));
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

float sdSphere(vec3 p, float r) {
  return length(p) - r;
}

float littleGuy(vec3 p, float bob) {
  float body = sdSphere(p - vec3(0.0, bob, 0.0), 0.1);
  float head = sdSphere(p - vec3(0.0, 0.15 + bob, 0.0), 0.07);
  return min(body, head);
}

void main() {
  vec2 uv = (vUv - 0.5) * 2.0;
  uv.x *= resolution.x / resolution.y;
  
  vec3 ro = cameraPos;
  vec3 forward = normalize(cameraDir);
  vec3 right = normalize(cross(vec3(0.0, 1.0, 0.0), forward));
  vec3 up = cross(forward, right);
  vec3 rd = normalize(uv.x * right + uv.y * up + 1.5 * forward);
  
  float bob = sin(time * 2.0) * 0.03;
  float d = rayMarch(ro, rd);
  vec3 col = vec3(0.0);
  
  vec3 guyPos = ro + forward * 1.2;
  float guyDist = littleGuy(guyPos, bob);
  
  if (guyDist < 0.12 && d > 1.0) {
    col = vec3(0.2, 0.85, 0.95);
    float glow = 0.1 / (guyDist + 0.1);
    col += vec3(0.2, 0.6, 1.0) * glow * 0.3;
  } else if (d < MAX_DIST) {
    vec3 p = ro + rd * d;
    vec3 n = getNormal(p);
    vec3 light = normalize(vec3(1.0, 1.0, 1.0));
    float diff = max(dot(n, light), 0.0);
    float hue = mod(length(p) * 0.5 + time * 0.05, 1.0);
    col = vec3(0.5+0.5*cos(time*0.2+hue*6.28), 0.5+0.5*cos(time*0.3+hue*6.28+2.0), 0.5+0.5*cos(time*0.25+hue*6.28+4.0));
    col *= (0.2 + diff * 0.8);
    float rim = pow(1.0 - max(dot(-rd, n), 0.0), 2.5);
    col += rim * vec3(0.4, 0.3, 0.7) * 0.5;
  } else {
    col = vec3(0.01, 0.01, 0.03) + vec3(0.05, 0.02, 0.1) * (1.0 - length(uv) * 0.3);
  }
  
  col *= 1.0 - length(vUv - 0.5) * 0.5;
  col = pow(col, vec3(0.9));
  gl_FragColor = vec4(col, 1.0);
}
`;

export default function App() {
  const [showControls, setShowControls] = useState(false);
  const [cameraPos, setCameraPos] = useState([0, 0, 2.5]);
  const [cameraRot, setCameraRot] = useState([0, 0]);
  
  const stateRef = useRef({ cameraPos: [0, 0, 2.5], cameraRot: [0, 0] });
  const glRef = useRef(null);
  const programRef = useRef(null);
  const startTime = useRef(Date.now());
  const velocityRef = useRef([0, 0, 0]);
  const movingRef = useRef({ forward: false, backward: false, left: false, right: false, up: false, down: false });
  
  useEffect(() => {
    stateRef.current = { cameraPos, cameraRot };
  }, [cameraPos, cameraRot]);
  
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
      
      const speed = 0.025;
      const friction = 0.92;
      let [vx, vy, vz] = velocityRef.current;
      const [pitch, yaw] = state.cameraRot;
      const cosY = Math.cos(yaw), sinY = Math.sin(yaw);
      const cosP = Math.cos(pitch), sinP = Math.sin(pitch);
      
      const m = movingRef.current;
      if (m.forward) { vx += sinY*cosP*speed; vy += sinP*speed; vz += cosY*cosP*speed; }
      if (m.backward) { vx -= sinY*cosP*speed; vy -= sinP*speed; vz -= cosY*cosP*speed; }
      if (m.left) { vx -= cosY*speed; vz += sinY*speed; }
      if (m.right) { vx += cosY*speed; vz -= sinY*speed; }
      if (m.up) vy += speed;
      if (m.down) vy -= speed;
      
      vx *= friction; vy *= friction; vz *= friction;
      velocityRef.current = [vx, vy, vz];
      
      const [px, py, pz] = state.cameraPos;
      const newPos = [px + vx, py + vy, pz + vz];
      setCameraPos(newPos);
      
      gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
      gl.clearColor(0, 0, 0, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.useProgram(programRef.current);
      
      const time = (Date.now() - startTime.current) / 1000;
      const camDir = [Math.sin(yaw)*Math.cos(pitch), Math.sin(pitch), Math.cos(yaw)*Math.cos(pitch)];
      
      gl.uniform2f(gl.getUniformLocation(programRef.current, 'resolution'), gl.drawingBufferWidth, gl.drawingBufferHeight);
      gl.uniform1f(gl.getUniformLocation(programRef.current, 'time'), time);
      gl.uniform3f(gl.getUniformLocation(programRef.current, 'cameraPos'), newPos[0], newPos[1], newPos[2]);
      gl.uniform3f(gl.getUniformLocation(programRef.current, 'cameraDir'), camDir[0], camDir[1], camDir[2]);
      
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      gl.endFrameEXP();
      requestAnimationFrame(render);
    };
    render();
  };
  
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
      setCameraRot([touchStart.rot[0] + dy * 0.004, touchStart.rot[1] + dx * 0.004]);
    }
  };
  
  const handleTouchEnd = () => setTouchStart(null);
  
  const handleReset = () => {
    setCameraPos([0, 0, 2.5]);
    setCameraRot([0, 0]);
    velocityRef.current = [0, 0, 0];
  };
  
  const setMove = (dir, val) => { movingRef.current = { ...movingRef.current, [dir]: val }; };
  
  return (
    <View style={styles.container} onTouchStart={handleTouchStart} onTouchMove={handleTouchMove} onTouchEnd={handleTouchEnd}>
      <GLView style={styles.glView} onContextCreate={onContextCreate} />
      
      <TouchableOpacity style={styles.header} onPress={() => setShowControls(!showControls)}>
        <Text style={styles.title}>FractalFly</Text>
        <Text style={styles.subtitle}>Drag to look</Text>
      </TouchableOpacity>
      
      {showControls && (
        <View style={styles.controlsPanel}>
          <Text style={styles.controlTitle}>Controls</Text>
          <View style={styles.dpad}>
            <TouchableOpacity style={styles.dpadBtn} onPressIn={() => setMove('forward', true)} onPressOut={() => setMove('forward', false)}>
              <Text style={styles.dpadText}>▲</Text>
            </TouchableOpacity>
            <View style={styles.dpadRow}>
              <TouchableOpacity style={styles.dpadBtn} onPressIn={() => setMove('left', true)} onPressOut={() => setMove('left', false)}><Text style={styles.dpadText}>◀</Text></TouchableOpacity>
              <TouchableOpacity style={styles.dpadBtn} onPressIn={() => setMove('backward', true)} onPressOut={() => setMove('backward', false)}><Text style={styles.dpadText}>▼</Text></TouchableOpacity>
              <TouchableOpacity style={styles.dpadBtn} onPressIn={() => setMove('right', true)} onPressOut={() => setMove('right', false)}><Text style={styles.dpadText}>▶</Text></TouchableOpacity>
            </View>
          </View>
          <TouchableOpacity style={styles.resetButton} onPress={handleReset}><Text style={styles.buttonText}>Reset</Text></TouchableOpacity>
          <TouchableOpacity style={styles.closeButton} onPress={() => setShowControls(false)}><Text style={styles.buttonText}>X</Text></TouchableOpacity>
        </View>
      )}
      
      <View style={styles.bottomBar}>
        <TouchableOpacity style={styles.actionButton} onPressIn={() => setMove('left', true)} onPressOut={() => setMove('left', false)}><Text style={styles.actionText}>◀</Text></TouchableOpacity>
        <TouchableOpacity style={styles.actionButton} onPressIn={() => setMove('forward', true)} onPressOut={() => setMove('forward', false)}><Text style={styles.actionText}>▲</Text></TouchableOpacity>
        <TouchableOpacity style={styles.actionButton} onPressIn={() => setMove('backward', true)} onPressOut={() => setMove('backward', false)}><Text style={styles.actionText}>▼</Text></TouchableOpacity>
        <TouchableOpacity style={styles.actionButton} onPressIn={() => setMove('right', true)} onPressOut={() => setMove('right', false)}><Text style={styles.actionText}>▶</Text></TouchableOpacity>
        <TouchableOpacity style={styles.actionButton} onPress={() => setShowControls(true)}><Text style={styles.actionText}>S</Text></TouchableOpacity>
      </View>
      <StatusBar style="light" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  glView: { flex: 1 },
  header: { position: 'absolute', top: 50, left: 15, zIndex: 10, backgroundColor: 'rgba(0,0,0,0.7)', padding: 12, borderRadius: 12 },
  title: { fontSize: 20, fontWeight: 'bold', color: '#fff' },
  subtitle: { fontSize: 11, color: '#aaa', marginTop: 2 },
  controlsPanel: { position: 'absolute', top: 110, left: 15, right: 15, bottom: 110, backgroundColor: 'rgba(15,15,25,0.95)', borderRadius: 16, padding: 16, borderWidth: 1, borderColor: '#334', zIndex: 20 },
  controlTitle: { fontSize: 16, fontWeight: 'bold', color: '#fff', marginBottom: 12, textAlign: 'center' },
  dpad: { alignItems: 'center', marginVertical: 10 },
  dpadRow: { flexDirection: 'row' },
  dpadBtn: { backgroundColor: '#334', width: 50, height: 50, borderRadius: 10, justifyContent: 'center', alignItems: 'center', margin: 3 },
  dpadText: { color: '#fff', fontSize: 20 },
  resetButton: { backgroundColor: '#4a9', padding: 10, borderRadius: 8, alignItems: 'center', marginTop: 10 },
  closeButton: { backgroundColor: '#844', padding: 10, borderRadius: 8, alignItems: 'center', marginTop: 6 },
  buttonText: { color: '#fff', fontWeight: 'bold', fontSize: 13 },
  bottomBar: { position: 'absolute', bottom: 25, left: 0, right: 0, flexDirection: 'row', justifyContent: 'space-around', paddingHorizontal: 15 },
  actionButton: { backgroundColor: 'rgba(40,40,60,0.85)', width: 50, height: 50, borderRadius: 25, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: '#556' },
  actionText: { fontSize: 18, color: '#fff' },
});
