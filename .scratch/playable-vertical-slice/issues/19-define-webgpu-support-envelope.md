Type: grilling
Status: resolved
Assignee: Codex
Blocked by: 14, 16

# Define the WebGPU slice support envelope

## Question

Given the WebGPU research, which browser/device support target, performance budget, loading behavior, and accessibility baseline should the Playable Vertical Slice promise and expose to the player?
## Answer

The Playable Vertical Slice promises one tested Linux desktop environment:

- Browser: Chromium `151.0.7922.137`.
- Platform: Linux x64. The Linux distribution version is not part of the promise.
- GPU: NVIDIA RTX 2070 SUPER with driver `610.57.04`.
- Firefox on Linux, other browsers, other GPUs and drivers, and mobile devices are outside the promise.

### WebGPU gate

- Require a secure context and a usable WebGPU adapter and device.
- Reject the Three.js WebGL fallback.
- Require a physical GPU adapter. Reject software adapters.
- Require core WebGPU only. Optional features are not launch requirements.
- Request the `high-performance` adapter preference as a hint.
- Stop immediately on device loss and show a readable failure or reload state. The Simulation must not continue while no frame is visible.

### Performance

- Test at a 1920×1080 CSS viewport with a maximum device-pixel ratio of 1.0.
- The seeded bridge battle targets 60 frames per second and has a 30-frames-per-second minimum.
- Report average and 95th-percentile frame time.
- A drop below 30 frames per second must not last more than one second.

### Loading

- Load assets by Scene.
- Set no elapsed-time limit for loading.
- Show loading progress.
- Write detailed browser-console logs for Scene loads, asset download and decode, GPU upload, progress, and failures.
- Stop at the first load error. Show the error state and do not retry automatically.

### Controls and accessibility

- Promise normal keyboard-and-mouse controls only.
- Do not promise keyboard-only play, reduced-motion behavior, touch controls, or mobile support.

## Comments

### Resolution — 2026-08-18

The human confirmed the single current-machine support row, the WebGPU gate, the frame-rate and render limits, Scene-based loading with console diagnostics and no timeout, immediate device-loss handling, and normal desktop controls only.
