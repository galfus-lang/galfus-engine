# Galfus Feature Tour

A guided, cross-binding demonstration proving the core capabilities of the Galfus engine in one coherent split-screen experience across all supported SDKs (Bun, Node.js, Python, LuaJIT, C99, and C#).

## Architecture

- **Split Viewports**:
  - **Upper 50vh**: `Realm3D` guided exhibition across 10 interactive rooms.
  - **Lower 50vh**: `Realm2D` companion telemetry and status HUD panel rendered via GPU-tessellated SVG.
- **Dual Path Following**:
  - `cameraPositionPath`: Traverses corridor and exhibits bound directly to `camera3DTransform`.
  - `cameraLookTargetPath`: Guides focus points toward room exhibits bound directly to `camera3DLookAt`.
- **Procedural Runtime Factories**:
  - Deterministic geometry, harmonic chime sound (16-bit PCM WAV), 12-bone waving column mesh, and palettes seeded by shared parameters in `tour.json`.
- **Direct Native Engine Integration**:
  - All runners interface directly with the compiled native library (`libgalfus_native.so`, `galfus.node`, or `galfus_native.dll`) with full window creation and rendering.

## 10 Exhibit Rooms

1. **Room 1: Welcome & Engine Overview** — Architecture overview, PBR gold cube exhibit.
2. **Room 2: PBR Primitives & Materials** — High-subdivision sphere showing metallic and roughness properties.
3. **Room 3: Dynamic Lights & Shadows** — Point light casting dynamic shadows on emissive pedestal.
4. **Room 4: 3D GPU Particle Systems** — Kinetic spark particle emitter with gravity and spread angle.
5. **Room 5: Animation & Motion Paths** — Eased ping-pong bouncing sculpture on transformation tracks.
6. **Room 6: Planar Mirrors & Portals** — Planar mirror surface reflecting the environment.
7. **Room 7: Procedural Skeletal Bones** — 12-bone skinned column waving procedurally in real time.
8. **Room 8: Screen-Space Refraction** — Cylinder with refractive index (IOR 1.52) distorting the background.
9. **Room 9: Multiverse Screen Filters** — Post-processing screen pipeline (Chromatic Aberration & Vignette).
10. **Room 10: Spatial Audio & Parity Finale** — Audio beacon emitting synthesized 16-bit PCM WAV chimes.

## Controls

- `Space`: Pause / Resume tour playback.
- `←` / `→`: Navigate to previous / next room.
- `R`: Restart tour from Room 1.
- `Esc`: Exit demonstration.

---

## Running the Tour Across SDKs

You can run any SDK tour directly using the configured npm/bun scripts:

| SDK         | Script Command                         | Direct Command                                                                 |
| :---------- | :------------------------------------- | :----------------------------------------------------------------------------- |
| **Bun**     | `bun run tour:bun` (or `bun run tour`) | `bun examples/feature-tour/runners/bun/index.ts`                               |
| **Node.js** | `bun run tour:node`                    | `node examples/feature-tour/runners/node/index.ts`                             |
| **Python**  | `bun run tour:python`                  | `python3 examples/feature-tour/runners/python/main.py`                         |
| **LuaJIT**  | `bun run tour:lua`                     | `luajit examples/feature-tour/runners/lua/main.lua`                            |
| **C99**     | `bun run tour:c`                       | `make -C examples/feature-tour/runners/c run`                                  |
| **C#**      | `bun run tour:csharp`                  | `dotnet run --project examples/feature-tour/runners/csharp/FeatureTour.csproj` |
