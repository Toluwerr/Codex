# Codex

Automated drawing experiments.

## Auto-draw any image on drawaria.online

The console script now renders any image as pixel-perfect artwork streamed
through Drawaria's websocket channel. It converts the picture into a 1px brush
matrix (capped at 500×500), quantises the colours to a lush 400-tone palette,
and replays every pixel as a websocket stroke so the room sees the piece appear
live.

### Usage

1. Open [drawaria.online](https://drawaria.online/) in your browser and wait for
   the interface to finish loading.
2. Join or create a room so the Drawaria websocket connects. The painter refuses
   to start without that socket, so refresh or rejoin the room if it never
   appears.
3. Open the developer console (`Cmd+Option+J` on macOS Chrome, `Ctrl+Shift+J`
   on Windows/Linux Chrome, or your browser's equivalent shortcut).
4. Copy the contents of `scripts/drawaria_image_autodraw.js`, paste it into the
   console, and press Enter. A floating **Autodraw Studio** control surface
   fades in above the canvas.
5. Drop an image into the **Image File** field (any common raster type works),
   tweak the maximum dimension slider if you want a smaller render (64–500px),
   then tap **Preview**. The studio resizes the source, generates a glassy
   preview, and quantises the palette down to 400 colours.
6. Press **Start Drawing** to stream the pixels. The painter sends 1px strokes
   with an 8 ms delay between commands, updates the progress bar in real time,
   and fills the palette swatches so you can monitor coverage.
7. Hit **Stop** if you need to abort mid-run—the current pixel finishes and the
   script halts gracefully. Use the ✕ button to close the panel and unregister
   the hooks when you are done.

The control panel is fully draggable, glassmorphism-styled, and now features
wide glass tabs that organise setup, preview, and palette/progress tools while
keeping a live status readout so you always know how far along the pixel stream
has travelled.
