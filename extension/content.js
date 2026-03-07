function collectHints() {
  const headings = Array.from(document.querySelectorAll("h1, h2, h3"))
    .map((node) => node.textContent || "")
    .map((text) => text.trim())
    .filter(Boolean)
    .slice(0, 5);

  const buttons = Array.from(document.querySelectorAll("button, [role='button'], input[type='submit']"))
    .map((node) => {
      const text = node.textContent || node.value || "";
      return String(text).trim();
    })
    .filter(Boolean)
    .slice(0, 8);

  return {
    pageTitle: document.title || "",
    headingHints: headings,
    buttonHints: buttons
  };
}

const DEFAULT_SOURCE_WIDTH = 1280;
const DEFAULT_SOURCE_HEIGHT = 720;
const OVERLAY_ID = "kindlyclick-highlight-overlay";
const STYLE_ID = "kindlyclick-highlight-style";

let highlightTimeoutId = null;

function ensureHighlightStyle() {
  if (document.getElementById(STYLE_ID)) {
    return;
  }

  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    @keyframes kindlyclick-pulse {
      0% { transform: translate(-50%, -50%) scale(0.75); opacity: 0.85; }
      70% { transform: translate(-50%, -50%) scale(1.2); opacity: 0.3; }
      100% { transform: translate(-50%, -50%) scale(1.35); opacity: 0; }
    }

    .kindlyclick-highlight-ring {
      position: absolute;
      width: 56px;
      height: 56px;
      border-radius: 50%;
      border: 3px solid rgba(251, 191, 36, 0.95);
      box-shadow: 0 0 0 8px rgba(239, 68, 68, 0.18), 0 0 30px rgba(239, 68, 68, 0.35);
      animation: kindlyclick-pulse 1.1s ease-out infinite;
      pointer-events: none;
      z-index: 2147483647;
    }

    .kindlyclick-highlight-label {
      position: absolute;
      transform: translate(-50%, 8px);
      background: rgba(17, 24, 39, 0.9);
      color: #f9fafb;
      border-radius: 6px;
      padding: 4px 8px;
      font: 600 12px/1.2 "Segoe UI", Tahoma, sans-serif;
      white-space: nowrap;
      pointer-events: none;
      z-index: 2147483647;
    }
  `;

  (document.head || document.documentElement).appendChild(style);
}

function ensureOverlayRoot() {
  let overlay = document.getElementById(OVERLAY_ID);
  if (overlay) {
    return overlay;
  }

  overlay = document.createElement("div");
  overlay.id = OVERLAY_ID;
  overlay.style.position = "fixed";
  overlay.style.inset = "0";
  overlay.style.pointerEvents = "none";
  overlay.style.zIndex = "2147483647";

  (document.body || document.documentElement).appendChild(overlay);
  return overlay;
}

function asNumber(value, fallback = null) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function mapToViewport(args = {}) {
  const viewportWidth = Math.max(1, window.innerWidth || document.documentElement.clientWidth || 1);
  const viewportHeight = Math.max(1, window.innerHeight || document.documentElement.clientHeight || 1);

  const sourceWidth = Math.max(1, asNumber(args.sourceWidth, DEFAULT_SOURCE_WIDTH));
  const sourceHeight = Math.max(1, asNumber(args.sourceHeight, DEFAULT_SOURCE_HEIGHT));

  const rawX = asNumber(args.x);
  const rawY = asNumber(args.y);
  if (rawX === null || rawY === null) {
    return null;
  }

  const coordinateTypeRaw = String(args.coordinateType || args.coordinate_type || "")
    .trim()
    .toLowerCase();
  const coordinateType =
    coordinateTypeRaw === "normalized" || coordinateTypeRaw === "pixel"
      ? coordinateTypeRaw
      : rawX >= 0 && rawX <= 1 && rawY >= 0 && rawY <= 1
        ? "normalized"
        : "pixel";

  let viewportX = 0;
  let viewportY = 0;

  if (coordinateType === "normalized") {
    viewportX = rawX * viewportWidth;
    viewportY = rawY * viewportHeight;
  } else {
    // Scale from model-space (e.g., 1280x720 frame) into current viewport.
    viewportX = rawX * (viewportWidth / sourceWidth);
    viewportY = rawY * (viewportHeight / sourceHeight);
  }

  return {
    x: clamp(viewportX, 0, viewportWidth),
    y: clamp(viewportY, 0, viewportHeight),
    viewportWidth,
    viewportHeight,
    sourceWidth,
    sourceHeight,
    coordinateType
  };
}

function drawHighlight(args = {}) {
  const mapped = mapToViewport(args);
  if (!mapped) {
    return { ok: false, error: "Invalid coordinates" };
  }

  ensureHighlightStyle();
  const overlay = ensureOverlayRoot();
  overlay.textContent = "";

  const ring = document.createElement("div");
  ring.className = "kindlyclick-highlight-ring";
  ring.style.left = `${mapped.x}px`;
  ring.style.top = `${mapped.y}px`;

  overlay.appendChild(ring);

  const labelText = String(args.label || "").trim();
  if (labelText) {
    const label = document.createElement("div");
    label.className = "kindlyclick-highlight-label";
    label.style.left = `${mapped.x}px`;
    label.style.top = `${mapped.y}px`;
    label.textContent = labelText;
    overlay.appendChild(label);
  }

  if (highlightTimeoutId) {
    clearTimeout(highlightTimeoutId);
  }

  highlightTimeoutId = setTimeout(() => {
    overlay.textContent = "";
  }, 2600);

  return {
    ok: true,
    mapped
  };
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || typeof message.type !== "string") {
    return;
  }

  if (message.type === "kindlyclick:get-content-hints") {
    sendResponse(collectHints());
    return;
  }

  if (message.type === "kindlyclick:draw-highlight") {
    const command = message.command || {};
    const args = command.args || {};
    sendResponse(drawHighlight(args));
  }
});
