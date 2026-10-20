# Galfus Feature Tour

A guided, cross-binding demonstration proving the core capabilities of the Galfus engine in one coherent split-screen experience.

## Architecture

- **Split Viewports**:
  - **Upper 50vh**: `Realm3D` guided exhibition across 9 rooms.
  - **Lower 50vh**: `Realm2D` companion telemetry and status HUD panel rendered via GPU-tessellated SVG.
- **Dual Path Following**:
  - `cameraPositionPath`: Traverses corridor and exhibits bound directly to `camera3DTransform`.
  - `cameraLookTargetPath`: Guides focus points toward room exhibits bound directly to `camera3DLookAt`.
- **Procedural Runtime Factories**:
  - Deterministic geometry, checker/tile textures, harmonic chime sound (16-bit PCM WAV), and palettes seeded by shared parameters in `tour.json`.
- **Direct Event Batch Consumption**:
  - Keyboard and window events consumed through the fixed-layout event batch.

## Controls

- `Space`: Pause / Resume tour playback.
- `←` / `→`: Navigate to previous / next room.
- `R`: Restart tour from Room 1.
- `Esc`: Exit demonstration.

## Running the Tour

### 1. Bun Reference Runner (Interactive GUI)

```bash
bun demo tour
```

or directly:

```bash
bun examples/feature-tour/runners/bun/index.ts
```

### 2. Headless Verification Test

```bash
bun examples/feature-tour/test_tour_headless.ts
```

### 3. Python 3 Runner

```bash
python3 examples/feature-tour/runners/python/main.py
```

### 4. LuaJIT Runner

```bash
luajit examples/feature-tour/runners/lua/main.lua
```

### 5. C Native Runner

```bash
gcc examples/feature-tour/runners/c/main.c -Isdk/c -Lbuild/cargo-target/debug -lgalfus_native -Wl,-rpath,$(pwd)/build/cargo-target/debug -o run_tour_c
./run_tour_c
```

### 6. C# Runner

Include `sdk/csharp/Galfus.cs` and `examples/feature-tour/runners/csharp/Program.cs` in your .NET project with native library in search path.
