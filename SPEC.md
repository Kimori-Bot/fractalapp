# Fractal App - Specification

## Project Overview
- **Name**: FractalGo
- **Type**: Expo Go mobile application
- **Core Functionality**: Generate live fractal designs with real-time parameter modifications and sharing capabilities
- **Target Users**: Creative users, math enthusiasts, social media content creators

## UI/UX Specification

### Layout Structure
- **Single screen** with fractal canvas as main view
- **Bottom sheet** for parameter controls
- **Floating action buttons** for share/export
- **Header** with app name and settings

### Visual Design
- **Color Palette**: 
  - Primary: #6C5CE7 (Purple)
  - Secondary: #00CEC9 (Teal)
  - Background: #0D0D0D (Dark)
  - Surface: #1A1A2E (Dark surface)
  - Accent: #FD79A8 (Pink)
- **Typography**: System fonts, bold headers
- **Fractal Colors**: Customizable gradient palettes

### Components
1. **FractalCanvas** - Main WebGL canvas for rendering
2. **ParameterPanel** - Bottom sheet with sliders
3. **ShareButton** - Export/share functionality
4. **PresetSelector** - Quick fractal type selection
5. **ColorPicker** - Color scheme editor

## Functionality

### Core Features
1. **Fractal Rendering**
   - Mandelbrot set
   - Julia set
   - Burning Ship
   - Fractal trees (2D)
   
2. **Real-time Modifications**
   - Zoom in/out (pinch or slider)
   - Pan around (drag)
   - Adjust iterations (detail level)
   - Modify fractal parameters (c value for Julia, etc.)
   - Color scheme selection
   - Animation speed (for animated fractals)

3. **Sharing**
   - Export as PNG image
   - Copy to clipboard
   - Save to camera roll

### User Interactions
- Pinch to zoom
- Drag to pan
- Tap presets to switch fractal types
- Swipe up for parameter panel
- Tap share button to export

## Technical Implementation

### Stack
- Expo SDK 52
- React Native
- expo-gl for WebGL
- react-native-reanimated for smooth animations

### Performance
- WebGL for GPU-accelerated rendering
- Adaptive iteration count based on zoom level
- Debounced parameter updates

## Acceptance Criteria
- [ ] App loads and displays Mandelbrot set by default
- [ ] User can zoom and pan the fractal
- [ ] User can switch between at least 3 fractal types
- [ ] User can modify colors
- [ ] User can export fractal as image
- [ ] Smooth 30+ FPS rendering
