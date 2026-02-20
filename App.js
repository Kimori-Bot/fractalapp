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
uniform int fractalType;

#define MAX_STEPS 100
#define MAX_DIST 25.0
#define SURF_DIST 0.02

mat3 rotateY(float a) { float c=cos(a),s=sin(a); return mat3(c,0.0,s,0.0,1.0,0.0,-s,0.0,c); }
mat3 rotateX(float a) { float c=cos(a),s=sin(a); return mat3(1.0,0.0,0.0,0.0,c,-s,0.0,s,c); }

float mandelbulb(vec3 pos) {
  vec3 z = pos;
  float dr = 1.0, r = 0.0;
  for (int i = 0; i < 6; i++) {
    r = length(z);
    if (r > 2.0) break;
    float theta = acos(z.z/r), phi = atan(z.y,z.x);
    dr = pow(r,7.0)*8.0*dr + 1.0;
    z = pow(r,8.0)*vec3(sin(theta*8.0)*cos(phi*8.0), sin(theta*8.0)*sin(phi*8.0), cos(theta*8.0)) + pos;
  }
  return 0.5*log(r)*r/dr;
}

float mandelbox(vec3 p) {
  float scale = 2.5 + sin(time*0.3)*0.3;
  vec4 s = vec4(scale);
  float mr = 4.0, minR2 = 0.25, fixedR2 = 1.0;
  float dr = 1.0;
  for (int i = 0; i < 8; i++) {
    p = clamp(p, -1.0, 1.0)*2.0 - p;
    float r2 = dot(p,p);
    if (r2 < minR2) p = sqrt(minR2/r2)*p;
    else if (r2 < fixedR2) p = sqrt(fixedR2/r2)*p;
    p = s.xyz*p + vec3(0.0,0.0,0.0);
    dr = dr*abs(s.x) + 1.0;
  }
  return (length(p)-2.0)/dr;
}

float sierpinski(vec3 p) {
  float scale = 2.0;
  for (int i = 0; i < 6; i++) {
    p = abs(p);
    if (p.x < p.y) p.xy = p.yx;
    if (p.x < p.z) p.xz = p.zx;
    if (p.y < p.z) p.yz = p.zy;
    p = scale*p - (scale-1.0);
    if (p.z > 1.0) p.z -= 2.0*scale;
  }
  return length(p)*pow(scale, -6.0);
}

float scene(vec3 p) {
  if (fractalType == 0) return mandelbulb(p);
  if (fractalType == 1) return mandelbox(p);
  return sierpinski(p);
}

vec3 getNormal(vec3 p) {
  vec2 e = vec2(0.01, 0.0);
  return normalize(vec3(scene(p+e.xyy)-scene(p-e.xyy), scene(p+e.yxy)-scene(p-e.yxy), scene(p+e.yyx)-scene(p-e.yyx)));
}

float rayMarch(vec3 ro, vec3 rd) {
  float d = 0.0;
  for (int i = 0; i < MAX_STEPS; i++) {
    float ds = scene(ro + rd*d);
    d += ds;
    if (ds < SURF_DIST || d > MAX_DIST) break;
  }
  return d;
}

float sdSphere(vec3 p, float r) { return length(p) - r; }

float littleGuy(vec3 p, float bob) {
  float body = sdSphere(p - vec3(0.0, bob, 0.0), 0.08);
  float head = sdSphere(p - vec3(0.0, 0.12 + bob, 0.0), 0.055);
  float eyeL = sdSphere(p - vec3(-0.025, 0.14 + bob, 0.045), 0.015);
  float eyeR = sdSphere(p - vec3(0.025, 0.14 + bob, 0.045), 0.015);
  return min(min(body, head), min(eyeL, eyeR));
}

void main() {
  vec2 uv = (vUv - 0.5) * 2.0;
  uv.x *= resolution.x / resolution.y;
  
  vec3 ro = cameraPos;
  vec3 forward = normalize(cameraDir);
  vec3 right = normalize(cross(vec3(0.0, 1.0, 0.0), forward));
  vec3 up = cross(forward, right);
  vec3 rd = normalize(uv.x*right + uv.y*up + 1.5*forward);
  
  float bob = sin(time * 2.0) * 0.03;
  float d = rayMarch(ro, rd);
  vec3 col = vec3(0.0);
  
  vec3 guyPos = ro + forward * 1.0;
  float guyDist = littleGuy(guyPos, bob);
  
  if (guyDist < 0.1 && d > 1.0) {
    col = vec3(0.2, 0.9, 1.0);
    col += vec3(0.1, 0.4, 0.8) * (0.08 / (guyDist + 0.08));
  } else if (d < MAX_DIST) {
    vec3 p = ro + rd * d;
    vec3 n = getNormal(p);
    vec3 light = normalize(vec3(1.0, 1.0, 1.0));
    float diff = max(dot(n, light), 0.0);
    float hue = mod(length(p) * 0.4 + time * 0.08 + float(fractalType)*0.3, 1.0);
    col = vec3(0.5+0.5*cos(time*0.15+hue*6.28), 0.5+0.5*cos(time*0.2+hue*6.28+2.0), 0.5+0.5*cos(time*0.25+hue*6.28+4.0));
    col *= (0.25 + diff * 0.75);
    float rim = pow(1.0 - max(dot(-rd, n), 0.0), 2.0);
    col += rim * vec3(0.5, 0.3, 0.7) * 0.4;
  } else {
    col = vec3(0.008, 0.008, 0.025) + vec3(0.04, 0.02, 0.08) * (1.0 - length(uv)*0.25);
  }
  
  col *= 1.0 - length(vUv - 0.5) * 0.45;
  col = pow(col, vec3(0.92));
  gl_FragColor = vec4(col, 1.0);
}
`;

const FRACTAL_NAMES = ['Mandelbulb', 'Mandelbox', 'Sierpinski'];

export default function App() {
  const [showControls, setShowControls] = useState(false);
  const [fractalType, setFractalType] = useState(0);
  const [cameraPos, setCameraPos] = useState([0, 0, 4.0]);
  const [cameraRot, setCameraRot] = useState([0, 0]);
  
  const stateRef = useRef({ cameraPos: [0, 0, 4.0], cameraRot: [0, 0] });
  const glRef = useRef(null);
  const programRef = useRef(null);
  const startTime = useRef(Date.now());
  const velocityRef = useRef([0, 0, 0]);
  const movingRef = useRef({ forward: false, backward: false, left: false, right: false, up: false, down: false });
  
  useEffect(() => { stateRef.current = { cameraPos, cameraRot, fractalType }; }, [cameraPos, cameraRot, fractalType]);
  
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
      
      const speed = 0.03;
      const friction = 0.92;
      let [vx, vy, vz] = velocityRef.current;
      const [pitch, yaw] = state.cameraRot;
      const cosY = Math.cos(yaw), sinY = Math.sin(yaw);
      const cosP = Math.cos(pitch), sinP = Math.sin(pitch);
      
      const m = movingRef.current;
      if (m.forward) { vx -= sinY*cosP*speed; vy -= sinP*speed; vz -= cosY*cosP*speed; }
      if (m.backward) { vx += sinY*cosP*speed; vy += sinP*speed; vz += cosY*cosP*speed; }
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
      gl.uniform1i(gl.getUniformLocation(programRef.current, 'fractalType'), fractalType);
      
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
      setCameraRot([touchStart.rot[0] - dy * 0.004, touchStart.rot[1] - dx * 0.004]);
    }
  };
  
  const handleTouchEnd = () => setTouchStart(null);
  
  const handleReset = () => { setCameraPos([0, 0, 4.0]); setCameraRot([0, 0]); velocityRef.current = [0, 0, 0]; };
  const cycleFractal = () => setFractalType((fractalType + 1) % 3);
  const setMove = (dir, val) => { movingRef.current = { ...movingRef.current, [dir]: val }; };
  
  return (
    <View style={styles.container} onTouchStart={handleTouchStart} onTouchMove={handleTouchMove} onTouchEnd={handleTouchEnd}>
      <GLView style={styles.glView} onContextCreate={onContextCreate} />
      
      <TouchableOpacity style={styles.header} onPress={() => setShowControls(!showControls)}>
        <Text style={styles.title}>FractalFly</Text>
        <Text style={styles.subtitle}>{FRACTAL_NAMES[fractalType]}</Text>
      </TouchableOpacity>
      
      {showControls && (
        <View style={styles.controlsPanel}>
          <Text style={styles.controlTitle}>{FRACTAL_NAMES[fractalType]}</Text>
          <TouchableOpacity style={styles.button} onPress={cycleFractal}><Text style={styles.buttonText}>Next: {FRACTAL_NAMES[(fractalType+1)%3]}</Text></TouchableOpacity>
          <View style={styles.dpad}>
            <TouchableOpacity style={styles.dpadBtn} onPressIn={() => setMove('forward', true)} onPressOut={() => setMove('forward', false)}><Text style={styles.dpadText}>▲</Text></TouchableOpacity>
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
        <TouchableOpacity style={styles.actionButton} onPress={cycleFractal}><Text style={styles.actionText}>3D</Text></TouchableOpacity>
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
  controlTitle: { fontSize: 16, fontWeight: 'bold', color: '#fff', marginBottom: 10, textAlign: 'center' },
  dpad: { alignItems: 'center', marginVertical: 8 },
  dpadRow: { flexDirection: 'row' },
  dpadBtn: { backgroundColor: '#334', width: 50, height: 50, borderRadius: 10, justifyContent: 'center', alignItems: 'center', margin: 3 },
  dpadText: { color: '#fff', fontSize: 20 },
  button: { backgroundColor: '#446', padding: 10, borderRadius: 8, alignItems: 'center', marginBottom: 8 },
  buttonText: { color: '#fff', fontWeight: 'bold', fontSize: 13 },
  resetButton: { backgroundColor: '#4a9', padding: 10, borderRadius: 8, alignItems: 'center', marginTop: 8 },
  closeButton: { backgroundColor: '#844', padding: 10, borderRadius: 8, alignItems: 'center', marginTop: 6 },
  bottomBar: { position: 'absolute', bottom: 25, left: 0, right: 0, flexDirection: 'row', justifyContent: 'space-around', paddingHorizontal: 15 },
  actionButton: { backgroundColor: 'rgba(40,40,60,0.85)', width: 50, height: 50, borderRadius: 25, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: '#556' },
  actionText: { fontSize: 18, color: '#fff' },
});
