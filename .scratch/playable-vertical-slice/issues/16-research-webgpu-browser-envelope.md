Type: research
Status: resolved
Assignee: Codex
Blocked by: 14

# Establish the WebGPU browser and device envelope

## Question

What do current first-party browser, WebGPU, Three.js, and GPU documentation establish about the supported browser versions, required WebGPU features, device/GPU constraints, loading limits, and accessibility implications for this WebGPU-only Playable Vertical Slice?

## Answer

The AFK research asset [WebGPU-only browser envelope findings](../research/16-webgpu-browser-envelope.md) establishes these constraints:

- WebGPU requires a secure context. Startup must feature-detect `navigator.gpu`, handle a null adapter, inspect adapter features and limits, request only tested core capabilities, and handle device initialization failure and `GPUDevice.lost`.
- Support is browser, operating-system, and GPU specific. The current source set covers Chrome/Edge desktop from 113, qualifying Android Chromium from 121, Firefox 141 on Windows with later Apple-silicon macOS lanes, and Safari 26 on Apple platforms. Version numbers alone do not establish that the Scene meets its performance budget.
- Three.js `WebGPURenderer` has a WebGL2 fallback. The WebGPU-only architecture must fail closed and must not accept that fallback.
- Optional GPU features, adapter limits, software adapters, canvas dimensions, device-pixel ratio, texture formats, and driver behavior require a tested floor. Asset loading, decoder setup, GPU upload, same-origin/CORS behavior, and device loss need explicit visible states.
- Essential interface actions and state must remain in semantic DOM. Keyboard and single-pointer alternatives, visible focus, color-independent feedback, and reduced-motion behavior are required baseline considerations around the canvas.

The findings leave the product choices for **Define the WebGPU slice support envelope**: the exact browser/device matrix, GPU and performance floor, loading and device-loss behavior, accessibility promise, and evidence matrix.

## Comments

### Resolution — 2026-08-17

The research asset was written and verified by the AFK research subagent. It cites official browser, WebGPU, Three.js, GPU, and WCAG sources and does not choose the product support promise.
