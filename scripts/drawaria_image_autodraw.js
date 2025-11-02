// Paste this script into the drawaria.online console to auto-draw any image
// by replaying pixel-perfect strokes through Drawaria's websocket channel.
(() => {
  const SCRIPT_HANDLE = '__drawariaImageAutodraw';

  if (window[SCRIPT_HANDLE]?.cleanup) {
    try {
      window[SCRIPT_HANDLE].cleanup();
    } catch (err) {
      console.warn('drawaria image autodraw: cleanup error from previous run', err);
    }
  }

  const state = {
    running: false,
    abortRequested: false,
    prepared: false,
    previewDataUrl: null,
    pixelWidth: 0,
    pixelHeight: 0,
    palette: [],
    assignments: null,
  };

  const cleanupCallbacks = [];

  const wsBridge = installSocketBridge();
  cleanupCallbacks.push(() => wsBridge.release());

  function registerCleanup(fn) {
    cleanupCallbacks.push(fn);
  }

  function runCleanup() {
    while (cleanupCallbacks.length) {
      const fn = cleanupCallbacks.pop();
      try {
        fn();
      } catch (err) {
        console.warn('drawaria image autodraw: cleanup callback failed', err);
      }
    }
    delete window[SCRIPT_HANDLE];
  }

  class AbortPainting extends Error {
    constructor() {
      super('Drawing aborted');
      this.name = 'AbortPainting';
    }
  }

  function ensureNotAborted() {
    if (state.abortRequested) {
      throw new AbortPainting();
    }
  }

  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  const ui = createPanel();
  registerCleanup(() => {
    ui.panel.remove();
    ui.style.remove();
  });

  const hiddenCanvas = document.createElement('canvas');
  const hiddenCtx = hiddenCanvas.getContext('2d', { willReadFrequently: true });

  async function loadImageFromFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (event) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = event.target.result;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  function resizeImageToFit(img, maxDimension) {
    const scale = Math.min(1, maxDimension / Math.max(img.width, img.height));
    const width = Math.max(1, Math.round(img.width * scale));
    const height = Math.max(1, Math.round(img.height * scale));
    hiddenCanvas.width = width;
    hiddenCanvas.height = height;
    hiddenCtx.clearRect(0, 0, width, height);
    hiddenCtx.imageSmoothingEnabled = true;
    hiddenCtx.imageSmoothingQuality = 'high';
    hiddenCtx.drawImage(img, 0, 0, width, height);
    return hiddenCtx.getImageData(0, 0, width, height);
  }

  function previewImage(img, width, height) {
    const ctx = ui.previewCanvas.getContext('2d');
    const { width: previewW, height: previewH } = ui.previewCanvas;
    ctx.clearRect(0, 0, previewW, previewH);
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, previewW, previewH);
    ctx.save();
    ctx.shadowColor = 'rgba(15,23,42,0.45)';
    ctx.shadowBlur = 28;
    const scale = Math.min((previewW - 40) / width, (previewH - 40) / height);
    const drawW = width * scale;
    const drawH = height * scale;
    ctx.drawImage(hiddenCanvas, 0, 0, width, height, (previewW - drawW) / 2, (previewH - drawH) / 2, drawW, drawH);
    ctx.restore();
  }

  function quantizeToPalette(imageData, width, height, maxColors) {
    const data = imageData.data;
    const totalPixels = width * height;
    const buckets = new Map();
    const bucketAverages = new Map();

    for (let i = 0; i < totalPixels; i++) {
      const offset = i * 4;
      const alpha = data[offset + 3];
      if (alpha < 16) {
        continue;
      }
      const r = data[offset];
      const g = data[offset + 1];
      const b = data[offset + 2];
      const bucketR = r & 0xf0;
      const bucketG = g & 0xf0;
      const bucketB = b & 0xf0;
      const key = (bucketR << 8) | (bucketG << 4) | bucketB;
      const count = (buckets.get(key) || 0) + 1;
      buckets.set(key, count);
      const avg = bucketAverages.get(key) || { r: 0, g: 0, b: 0, count: 0 };
      avg.r += r;
      avg.g += g;
      avg.b += b;
      avg.count += 1;
      bucketAverages.set(key, avg);
    }

    const sortedBuckets = Array.from(buckets.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, maxColors);

    const palette = sortedBuckets.map(([key]) => {
      const avg = bucketAverages.get(key);
      const count = Math.max(1, avg.count);
      const r = Math.round(avg.r / count);
      const g = Math.round(avg.g / count);
      const b = Math.round(avg.b / count);
      return {
        r,
        g,
        b,
        hex: `#${[r, g, b]
          .map((component) => component.toString(16).padStart(2, '0'))
          .join('')}`,
      };
    });

    if (!palette.length) {
      palette.push({ r: 0, g: 0, b: 0, hex: '#000000' });
    }

    const assignments = new Uint16Array(totalPixels);
    const paletteLength = palette.length;

    for (let i = 0; i < totalPixels; i++) {
      const offset = i * 4;
      const alpha = data[offset + 3];
      if (alpha < 16) {
        assignments[i] = 0xffff;
        continue;
      }
      const r = data[offset];
      const g = data[offset + 1];
      const b = data[offset + 2];
      let bestIndex = 0;
      let bestDistance = Infinity;
      for (let j = 0; j < paletteLength; j++) {
        const pr = palette[j].r;
        const pg = palette[j].g;
        const pb = palette[j].b;
        const dr = r - pr;
        const dg = g - pg;
        const db = b - pb;
        const distance = dr * dr + dg * dg + db * db;
        if (distance < bestDistance) {
          bestDistance = distance;
          bestIndex = j;
        }
      }
      assignments[i] = bestIndex;
    }

    return { palette, assignments };
  }

  function renderPaletteSwatches(palette) {
    ui.paletteStrip.innerHTML = '';
    palette.forEach((color, index) => {
      const swatch = document.createElement('div');
      swatch.className = 'pxa-swatch';
      swatch.style.background = color.hex;
      swatch.title = `${index + 1}. ${color.hex}`;
      ui.paletteStrip.appendChild(swatch);
    });
    ui.paletteSummary.textContent = `${palette.length} colours (max 400)`;
  }

  async function prepareFromFile(file) {
    if (!file) {
      throw new Error('Select an image file to begin.');
    }

    ui.previewLoading.classList.add('visible');
    ui.progressBar.style.width = '0%';
    ui.progressLabel.textContent = '0%';
    ui.status.textContent = 'Loading image…';

    try {
      await wait(10);

      const maxDimension = Number(ui.dimensionInput.value) || 500;
      const image = await loadImageFromFile(file);
      const imageData = resizeImageToFit(image, maxDimension);
      const { width, height } = imageData;
      state.pixelWidth = width;
      state.pixelHeight = height;
      previewImage(image, width, height);

      ui.status.textContent = `Quantising colours (≤400)…`;
      await wait(10);
      const { palette, assignments } = quantizeToPalette(imageData, width, height, 400);

      state.palette = palette;
      state.assignments = assignments;
      state.prepared = true;
      state.previewDataUrl = hiddenCanvas.toDataURL('image/png');

      renderPaletteSwatches(palette);
      ui.status.textContent = `Ready: ${width}×${height}px, ${palette.length} colours.`;
    } finally {
      ui.previewLoading.classList.remove('visible');
    }
  }

  async function waitForSocket(timeout = 5000) {
    const start = performance.now();
    while (performance.now() - start < timeout) {
      const socket = wsBridge.getSocket();
      if (socket && socket.readyState === WebSocket.OPEN) {
        return socket;
      }
      await wait(120);
    }
    return null;
  }

  function buildPixelCommands(canvasWidth, canvasHeight) {
    const assignments = state.assignments;
    const palette = state.palette;
    const width = state.pixelWidth;
    const height = state.pixelHeight;
    const totalPixels = width * height;

    const commands = [];
    const boardWidth = canvasWidth;
    const boardHeight = canvasHeight;
    const offsetX = Math.max(0, (boardWidth - width) / 2);
    const offsetY = Math.max(0, (boardHeight - height) / 2);

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const index = y * width + x;
        const paletteIndex = assignments[index];
        if (paletteIndex === 0xffff) {
          continue;
        }
        const color = palette[paletteIndex];
        const startX = offsetX + x + 0.05;
        const startY = offsetY + y + 0.05;
        const endX = startX + 0.1;
        const endY = startY + 0.1;
        const nx1 = clamp(startX / boardWidth, 0.0001, 0.9999).toFixed(6);
        const ny1 = clamp(startY / boardHeight, 0.0001, 0.9999).toFixed(6);
        const nx2 = clamp(endX / boardWidth, 0.0001, 0.9999).toFixed(6);
        const ny2 = clamp(endY / boardHeight, 0.0001, 0.9999).toFixed(6);
        commands.push({
          color: color.hex,
          nx1,
          ny1,
          nx2,
          ny2,
        });
      }
    }

    return commands;
  }

  async function streamCommands(commands, socket, delayMs) {
    const total = commands.length;
    let completed = 0;
    ui.progressBar.style.width = '0%';

    for (const command of commands) {
      ensureNotAborted();
      try {
        socket.send(
          `42["drawcmd",0,[${command.nx1},${command.ny1},${command.nx2},${command.ny2},false,-1,"${command.color}",0,0,{}]]`
        );
      } catch (err) {
        console.warn('drawaria image autodraw: socket send failed', err);
      }
      completed += 1;
      if (completed % 50 === 0 || completed === total) {
        const progress = (completed / total) * 100;
        ui.progressBar.style.width = `${progress}%`;
        ui.progressLabel.textContent = `${progress.toFixed(1)}%`;
        ui.status.textContent = `Drawing pixels… ${completed}/${total}`;
      }
      await wait(delayMs);
    }

    ui.progressBar.style.width = '100%';
    ui.progressLabel.textContent = '100%';
  }

  async function runDrawing() {
    if (state.running) {
      return;
    }
    state.running = true;
    state.abortRequested = false;
    ui.startButton.disabled = true;
    ui.stopButton.disabled = false;
    ui.panel.classList.add('running');

    try {
      if (!state.prepared) {
        const file = ui.fileInput.files[0];
        await prepareFromFile(file);
      }
      ensureNotAborted();
      ui.status.textContent = 'Waiting for websocket…';
      const socket = await waitForSocket(5000);
      if (!socket) {
        throw new Error('Could not detect Drawaria websocket. Join a room and try again.');
      }
      const canvas = selectLargestCanvas();
      if (!canvas) {
        throw new Error('Canvas not found. Wait for Drawaria to finish loading.');
      }
      ensureNotAborted();
      ui.status.textContent = 'Mapping pixels to strokes…';
      await wait(10);
      const commands = buildPixelCommands(canvas.width, canvas.height);
      if (!commands.length) {
        throw new Error('No drawable pixels were detected.');
      }
      ensureNotAborted();
      ui.status.textContent = `Streaming ${commands.length} pixels…`;
      await streamCommands(commands, socket, 8);
      ensureNotAborted();
      ui.status.textContent = 'Image rendered successfully!';
    } catch (err) {
      if (err instanceof AbortPainting) {
        ui.status.textContent = 'Drawing aborted.';
      } else {
        console.error('drawaria image autodraw: error', err);
        ui.status.textContent = `Error: ${err.message || err}`;
      }
    } finally {
      state.running = false;
      state.abortRequested = false;
      ui.startButton.disabled = false;
      ui.stopButton.disabled = true;
      ui.panel.classList.remove('running');
    }
  }

  function handleStop() {
    if (!state.running) {
      return;
    }
    state.abortRequested = true;
    ui.status.textContent = 'Finishing current stroke…';
  }

  async function handleStartClick() {
    if (!ui.fileInput.files.length && !state.prepared) {
      ui.status.textContent = 'Please choose an image before drawing.';
      ui.fileInput.classList.add('shake');
      setTimeout(() => ui.fileInput.classList.remove('shake'), 500);
      return;
    }
    await runDrawing();
  }

  async function handleGeneratePreview() {
    const file = ui.fileInput.files[0];
    try {
      await prepareFromFile(file);
    } catch (err) {
      console.error('drawaria image autodraw: preview error', err);
      ui.status.textContent = `Error: ${err.message || err}`;
      ui.previewLoading.classList.remove('visible');
    }
  }

  const handleFileChange = () => {
    state.prepared = false;
    if (ui.fileInput.files.length) {
      handleGeneratePreview();
    } else {
      ui.status.textContent = 'Select an image to begin (max 500px).';
      ui.paletteStrip.innerHTML = '';
      ui.paletteSummary.textContent = '0 colours';
      ui.progressBar.style.width = '0%';
      ui.progressLabel.textContent = '0%';
    }
  };

  ui.fileInput.addEventListener('change', handleFileChange);
  registerCleanup(() => ui.fileInput.removeEventListener('change', handleFileChange));

  const handleDimensionInput = () => {
    ui.dimensionValue.textContent = `${ui.dimensionInput.value}px`;
    state.prepared = false;
    if (ui.fileInput.files.length) {
      ui.status.textContent = 'Dimension changed — regenerate preview.';
    }
  };

  ui.dimensionInput.addEventListener('input', handleDimensionInput);
  registerCleanup(() => ui.dimensionInput.removeEventListener('input', handleDimensionInput));

  ui.previewButton.addEventListener('click', handleGeneratePreview);
  registerCleanup(() => ui.previewButton.removeEventListener('click', handleGeneratePreview));

  ui.startButton.addEventListener('click', handleStartClick);
  registerCleanup(() => ui.startButton.removeEventListener('click', handleStartClick));

  ui.stopButton.addEventListener('click', handleStop);
  registerCleanup(() => ui.stopButton.removeEventListener('click', handleStop));

  ui.closeButton.addEventListener('click', () => {
    state.abortRequested = true;
    runCleanup();
  });

  window[SCRIPT_HANDLE] = {
    cleanup: runCleanup,
    state,
  };

  ui.status.textContent = 'Select an image to begin (max 500px).';

  function selectLargestCanvas() {
    const canvases = Array.from(document.querySelectorAll('canvas'));
    if (!canvases.length) {
      return null;
    }
    return canvases.reduce((largest, candidate) => {
      const largestArea = largest.width * largest.height;
      const candidateArea = candidate.width * candidate.height;
      return candidateArea > largestArea ? candidate : largest;
    }, canvases[0]);
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function createPanel() {
    const style = document.createElement('style');
    style.textContent = `
      #pxa-panel { position: fixed; top: 40px; right: 40px; width: 520px; z-index: 999999; font-family: 'Inter', 'Segoe UI', sans-serif; color: #0f172a; border-radius: 22px; overflow: hidden; box-shadow: 0 34px 96px rgba(15, 23, 42, 0.35); background: linear-gradient(150deg, rgba(248,250,252,0.94) 0%, rgba(226,232,240,0.9) 52%, rgba(226,232,240,0.97) 100%); backdrop-filter: blur(24px); border: 1px solid rgba(148,163,184,0.32); }
      #pxa-panel.running { box-shadow: 0 44px 120px rgba(30,64,175,0.48); }
      #pxa-head { display: flex; align-items: center; gap: 14px; padding: 20px 26px; cursor: grab; background: radial-gradient(circle at top left, rgba(59,130,246,0.42), rgba(37,99,235,0.72)); color: white; }
      #pxa-logo { width: 48px; height: 48px; border-radius: 18px; background: linear-gradient(150deg, rgba(255,255,255,0.38), rgba(255,255,255,0.08)); display: flex; align-items: center; justify-content: center; font-weight: 700; letter-spacing: 0.08em; font-size: 14px; box-shadow: inset 0 1px 2px rgba(255,255,255,0.45), inset 0 -1px 1px rgba(30,64,175,0.4); }
      #pxa-title { flex: 1; min-width: 0; }
      #pxa-title h1 { margin: 0; font-size: 18px; letter-spacing: 0.03em; font-weight: 700; }
      #pxa-title p { margin: 4px 0 0 0; font-size: 12px; opacity: 0.85; letter-spacing: 0.05em; text-transform: uppercase; }
      #pxa-close { border: none; background: rgba(255,255,255,0.18); color: white; width: 34px; height: 34px; border-radius: 11px; font-size: 14px; cursor: pointer; transition: transform 0.2s ease, background 0.2s ease; }
      #pxa-close:hover { transform: scale(1.07); background: rgba(255,255,255,0.32); }
      #pxa-body { padding: 24px; display: flex; flex-direction: column; gap: 20px; }
      .pxa-tabs { display: flex; gap: 10px; background: rgba(255,255,255,0.55); border-radius: 16px; padding: 8px; box-shadow: inset 0 1px 0 rgba(255,255,255,0.7); border: 1px solid rgba(148,163,184,0.25); }
      .pxa-tab { flex: 1; border: none; border-radius: 12px; padding: 12px 0; font-weight: 600; letter-spacing: 0.05em; text-transform: uppercase; font-size: 12px; cursor: pointer; color: rgba(30,41,59,0.75); background: rgba(148,163,184,0.12); transition: all 0.2s ease; }
      .pxa-tab:hover { filter: brightness(1.05); }
      .pxa-tab.active { background: linear-gradient(135deg, rgba(37,99,235,0.9), rgba(30,64,175,0.95)); color: white; box-shadow: 0 12px 26px rgba(30,64,175,0.35); }
      .pxa-tab-panels { display: flex; flex-direction: column; gap: 16px; }
      .pxa-tab-panel { display: none; }
      .pxa-tab-panel.active { display: block; }
      .pxa-section { background: rgba(255,255,255,0.68); border-radius: 18px; padding: 18px; box-shadow: inset 0 1px 0 rgba(255,255,255,0.58); border: 1px solid rgba(148,163,184,0.24); }
      .pxa-section h2 { margin: 0 0 12px; font-size: 13px; text-transform: uppercase; letter-spacing: 0.08em; color: #1e3a8a; }
      #pxa-preview-wrapper { position: relative; height: 240px; border-radius: 16px; overflow: hidden; background: linear-gradient(145deg, #0f172a, #1e3a8a); display: flex; align-items: center; justify-content: center; }
      #pxa-preview { width: 100%; height: 100%; }
      #pxa-preview-loading { position: absolute; inset: 0; display: grid; place-items: center; background: rgba(15,23,42,0.68); color: white; font-weight: 600; font-size: 14px; letter-spacing: 0.1em; opacity: 0; pointer-events: none; transition: opacity 0.3s ease; }
      #pxa-preview-loading.visible { opacity: 1; }
      .pxa-controls { display: grid; gap: 12px; }
      .pxa-field { display: grid; gap: 6px; }
      .pxa-label { font-size: 12px; letter-spacing: 0.05em; text-transform: uppercase; color: #475569; font-weight: 600; }
      .pxa-input, .pxa-slider { width: 100%; border: 1px solid rgba(148,163,184,0.45); border-radius: 12px; padding: 10px 12px; font-size: 13px; background: rgba(255,255,255,0.78); color: #0f172a; box-shadow: inset 0 1px 1px rgba(255,255,255,0.9); }
      .pxa-slider { -webkit-appearance: none; height: 6px; padding: 0; border-radius: 999px; background: linear-gradient(90deg, rgba(37,99,235,0.7), rgba(29,78,216,0.95)); position: relative; }
      .pxa-slider::-webkit-slider-thumb { -webkit-appearance: none; width: 18px; height: 18px; background: white; border-radius: 50%; border: 2px solid rgba(37,99,235,0.8); box-shadow: 0 4px 10px rgba(30,58,138,0.4); cursor: grab; }
      .pxa-slider::-moz-range-thumb { width: 18px; height: 18px; background: white; border-radius: 50%; border: 2px solid rgba(37,99,235,0.8); box-shadow: 0 4px 10px rgba(30,58,138,0.4); cursor: grab; }
      .pxa-buttons { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; }
      .pxa-btn { border: none; border-radius: 12px; padding: 12px 0; font-weight: 600; letter-spacing: 0.05em; text-transform: uppercase; font-size: 12px; cursor: pointer; transition: transform 0.2s ease, box-shadow 0.2s ease, filter 0.2s ease; }
      .pxa-btn.primary { background: linear-gradient(135deg, #2563eb, #1e3a8a); color: white; box-shadow: 0 12px 24px rgba(37,99,235,0.3); }
      .pxa-btn.primary:hover { transform: translateY(-1px); box-shadow: 0 16px 32px rgba(30,64,175,0.45); }
      .pxa-btn.secondary { background: rgba(255,255,255,0.85); color: #1e293b; border: 1px solid rgba(148,163,184,0.35); }
      .pxa-btn.secondary:hover { transform: translateY(-1px); box-shadow: 0 10px 20px rgba(148,163,184,0.35); }
      .pxa-btn.danger { background: linear-gradient(135deg, #f43f5e, #be123c); color: white; box-shadow: 0 12px 22px rgba(244,63,94,0.35); }
      .pxa-btn.danger:hover { transform: translateY(-1px); box-shadow: 0 16px 32px rgba(190,18,60,0.4); }
      #pxa-progress { height: 10px; border-radius: 999px; background: rgba(148,163,184,0.28); overflow: hidden; position: relative; }
      #pxa-progress-bar { position: absolute; inset: 0; width: 0%; background: linear-gradient(90deg, #22d3ee, #3b82f6); box-shadow: 0 8px 20px rgba(59,130,246,0.35); transition: width 0.2s ease; }
      #pxa-progress-label { position: absolute; right: 12px; top: 50%; transform: translateY(-50%); font-size: 11px; font-weight: 600; color: rgba(15,23,42,0.8); letter-spacing: 0.08em; }
      #pxa-status { font-size: 12px; letter-spacing: 0.05em; text-transform: uppercase; color: #1e293b; font-weight: 600; margin-top: 8px; }
      #pxa-palette-strip { display: grid; grid-template-columns: repeat(auto-fit, minmax(18px, 1fr)); gap: 4px; border-radius: 12px; padding: 10px; background: rgba(15,23,42,0.08); border: 1px solid rgba(148,163,184,0.35); max-height: 140px; overflow-y: auto; }
      .pxa-swatch { width: 100%; padding-bottom: 100%; border-radius: 8px; position: relative; box-shadow: inset 0 0 0 1px rgba(15,23,42,0.12); }
      .pxa-swatch::after { content: ''; position: absolute; inset: 0; border-radius: inherit; box-shadow: inset 0 1px 0 rgba(255,255,255,0.35); }
      .pxa-meta { display: flex; justify-content: space-between; align-items: center; font-size: 11px; text-transform: uppercase; color: #475569; letter-spacing: 0.06em; margin-top: 10px; }
      input[type='file'].shake { animation: pxa-shake 0.45s ease; }
      @keyframes pxa-shake { 0%, 100% { transform: translateX(0); } 20%, 60% { transform: translateX(-6px); } 40%, 80% { transform: translateX(6px); } }
    `;
    document.head.appendChild(style);

    const panel = document.createElement('div');
    panel.id = 'pxa-panel';
    panel.innerHTML = `
      <div id="pxa-head">
        <div id="pxa-logo">AUTO</div>
        <div id="pxa-title">
          <h1>Autodraw Studio</h1>
          <p>WebSocket Pixel Renderer</p>
        </div>
        <button id="pxa-close">✕</button>
      </div>
      <div id="pxa-body">
        <div class="pxa-tabs">
          <button class="pxa-tab active" data-tab="setup">Setup</button>
          <button class="pxa-tab" data-tab="preview">Preview</button>
          <button class="pxa-tab" data-tab="palette">Palette</button>
        </div>
        <div class="pxa-tab-panels">
          <section class="pxa-section pxa-tab-panel active" data-tab="setup">
            <h2>Setup</h2>
            <div class="pxa-controls">
              <label class="pxa-field">
                <span class="pxa-label">Image File</span>
                <input id="pxa-file" type="file" accept="image/*" class="pxa-input" />
              </label>
              <label class="pxa-field">
                <span class="pxa-label">Max Dimension (px)</span>
                <input id="pxa-dimension" type="range" min="64" max="500" value="500" class="pxa-slider" />
                <div class="pxa-meta"><span>64px</span><span id="pxa-dimension-value">500px</span></div>
              </label>
              <div class="pxa-meta"><span>Colour Capacity</span><span>400 Colours</span></div>
              <div class="pxa-meta"><span>Stroke Delay</span><span>8ms</span></div>
              <div class="pxa-buttons">
                <button id="pxa-preview-btn" class="pxa-btn secondary">Preview</button>
                <button id="pxa-start" class="pxa-btn primary">Start Drawing</button>
                <button id="pxa-stop" class="pxa-btn danger" disabled>Stop</button>
              </div>
            </div>
          </section>
          <section class="pxa-section pxa-tab-panel" data-tab="preview">
            <h2>Preview</h2>
            <div id="pxa-preview-wrapper">
              <canvas id="pxa-preview" width="420" height="220"></canvas>
              <div id="pxa-preview-loading">Preparing…</div>
            </div>
          </section>
          <section class="pxa-section pxa-tab-panel" data-tab="palette">
            <h2>Palette &amp; Progress</h2>
            <div id="pxa-progress">
              <div id="pxa-progress-bar"></div>
              <span id="pxa-progress-label">0%</span>
            </div>
            <div id="pxa-status">Awaiting image…</div>
            <div class="pxa-meta"><span id="pxa-palette-summary">0 colours</span><span>1px brush</span></div>
            <div id="pxa-palette-strip"></div>
          </section>
        </div>
      </div>
    `;
    document.body.appendChild(panel);

    const head = panel.querySelector('#pxa-head');
    let dragOffsetX = 0;
    let dragOffsetY = 0;
    let dragging = false;

    const handlePointerDown = (event) => {
      dragging = true;
      const rect = panel.getBoundingClientRect();
      dragOffsetX = event.clientX - rect.left;
      dragOffsetY = event.clientY - rect.top;
      panel.style.transition = 'none';
      head.style.cursor = 'grabbing';
      event.preventDefault();
    };

    const handlePointerMove = (event) => {
      if (!dragging) return;
      panel.style.left = `${event.clientX - dragOffsetX}px`;
      panel.style.top = `${event.clientY - dragOffsetY}px`;
      panel.style.right = 'auto';
      panel.style.bottom = 'auto';
    };

    const handlePointerUp = () => {
      dragging = false;
      head.style.cursor = 'grab';
      panel.style.transition = '';
    };

    head.addEventListener('mousedown', handlePointerDown);
    window.addEventListener('mousemove', handlePointerMove);
    window.addEventListener('mouseup', handlePointerUp);

    registerCleanup(() => {
      head.removeEventListener('mousedown', handlePointerDown);
      window.removeEventListener('mousemove', handlePointerMove);
      window.removeEventListener('mouseup', handlePointerUp);
    });

    const tabButtons = Array.from(panel.querySelectorAll('.pxa-tab'));
    const tabPanels = Array.from(panel.querySelectorAll('.pxa-tab-panel'));

    const activateTab = (name) => {
      tabButtons.forEach((btn) => {
        btn.classList.toggle('active', btn.dataset.tab === name);
      });
      tabPanels.forEach((tabPanel) => {
        tabPanel.classList.toggle('active', tabPanel.dataset.tab === name);
      });
    };

    tabButtons.forEach((btn) => {
      const onClick = () => activateTab(btn.dataset.tab);
      btn.addEventListener('click', onClick);
      registerCleanup(() => btn.removeEventListener('click', onClick));
    });

    activateTab('setup');

    return {
      panel,
      style,
      fileInput: panel.querySelector('#pxa-file'),
      dimensionInput: panel.querySelector('#pxa-dimension'),
      previewCanvas: panel.querySelector('#pxa-preview'),
      previewButton: panel.querySelector('#pxa-preview-btn'),
      startButton: panel.querySelector('#pxa-start'),
      stopButton: panel.querySelector('#pxa-stop'),
      closeButton: panel.querySelector('#pxa-close'),
      status: panel.querySelector('#pxa-status'),
      progressBar: panel.querySelector('#pxa-progress-bar'),
      progressLabel: panel.querySelector('#pxa-progress-label'),
      paletteStrip: panel.querySelector('#pxa-palette-strip'),
      paletteSummary: panel.querySelector('#pxa-palette-summary'),
      previewLoading: panel.querySelector('#pxa-preview-loading'),
      dimensionValue: panel.querySelector('#pxa-dimension-value'),
    };
  }

  function installSocketBridge() {
    const HANDLE = '__drawariaAutodrawSocketBridge';
    if (window[HANDLE]) {
      window[HANDLE].refCount += 1;
      return window[HANDLE];
    }

    const sockets = new Set();
    const originalSend = WebSocket.prototype.send;

    function track(socket) {
      if (sockets.has(socket)) {
        return;
      }
      sockets.add(socket);
      socket.addEventListener('close', () => sockets.delete(socket));
      socket.addEventListener('error', () => sockets.delete(socket));
    }

    function patchedSend(...args) {
      track(this);
      return originalSend.apply(this, args);
    }

    WebSocket.prototype.send = patchedSend;

    const bridge = {
      refCount: 1,
      release() {
        bridge.refCount -= 1;
        if (bridge.refCount <= 0) {
          WebSocket.prototype.send = originalSend;
          sockets.clear();
          delete window[HANDLE];
        }
      },
      getSocket() {
        const list = Array.from(sockets);
        for (let i = list.length - 1; i >= 0; i--) {
          const socket = list[i];
          if (socket && socket.readyState === WebSocket.OPEN) {
            return socket;
          }
        }
        return null;
      },
    };

    window[HANDLE] = bridge;
    return bridge;
  }
})();
