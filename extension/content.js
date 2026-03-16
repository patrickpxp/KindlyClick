const DEFAULT_SOURCE_WIDTH = 1280;
const DEFAULT_SOURCE_HEIGHT = 720;
const OVERLAY_ID = "kindlyclick-highlight-overlay";
const STYLE_ID = "kindlyclick-highlight-style";
const MAX_HEADING_HINTS = 5;
const MAX_BUTTON_HINTS = 8;
const MAX_LABEL_LENGTH = 80;
const MIN_LABEL_MATCH_SCORE = 3;
const SENSITIVE_FIELD_PATTERN =
  /\b(password|passcode|pass code|otp|one[- ]time|verification|security code|cvv|cvc|pin|ssn|social security|card number)\b/i;
const MATCH_STOP_WORDS = new Set([
  "the",
  "a",
  "an",
  "button",
  "field",
  "box",
  "bar",
  "icon",
  "menu",
  "tab",
  "link",
  "area",
  "section"
]);

let highlightTimeoutId = null;

function normalizeText(value, maxLength = MAX_LABEL_LENGTH) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (!text) {
    return "";
  }

  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text;
}

function collectTextList(selector, limit) {
  return Array.from(document.querySelectorAll(selector))
    .map((node) => normalizeText(node.textContent || node.value || ""))
    .filter(Boolean)
    .slice(0, limit);
}

function readTextFromIdRefs(idsValue) {
  return String(idsValue || "")
    .split(/\s+/)
    .map((id) => document.getElementById(id))
    .map((node) => normalizeText(node?.textContent || ""))
    .filter(Boolean)
    .join(" ");
}

function inferRole(element) {
  if (!element || typeof element.getAttribute !== "function") {
    return "";
  }

  const explicitRole = normalizeText(element.getAttribute("role") || "", 40).toLowerCase();
  if (explicitRole) {
    return explicitRole;
  }

  const tagName = String(element.tagName || "").toLowerCase();
  if (tagName === "button") {
    return "button";
  }

  if (tagName === "a" && element.hasAttribute("href")) {
    return "link";
  }

  if (tagName === "textarea") {
    return "textbox";
  }

  if (tagName === "select") {
    return "combobox";
  }

  if (tagName === "input") {
    const inputType = String(element.getAttribute("type") || "text").toLowerCase();
    if (inputType === "search") {
      return "searchbox";
    }
    if (
      inputType === "button" ||
      inputType === "submit" ||
      inputType === "reset" ||
      inputType === "checkbox" ||
      inputType === "radio"
    ) {
      return inputType;
    }
    return "textbox";
  }

  return "";
}

function findElementLabel(element) {
  if (!element || typeof element.getAttribute !== "function") {
    return "";
  }

  const ariaLabel = normalizeText(element.getAttribute("aria-label") || "");
  if (ariaLabel) {
    return ariaLabel;
  }

  const labelledBy = readTextFromIdRefs(element.getAttribute("aria-labelledby") || "");
  if (labelledBy) {
    return normalizeText(labelledBy);
  }

  if (element.labels && element.labels.length > 0) {
    const labelText = Array.from(element.labels)
      .map((label) => normalizeText(label.textContent || ""))
      .filter(Boolean)
      .join(" ");
    if (labelText) {
      return normalizeText(labelText);
    }
  }

  const closestLabel = typeof element.closest === "function" ? element.closest("label") : null;
  const closestLabelText = normalizeText(closestLabel?.textContent || "");
  if (closestLabelText) {
    return closestLabelText;
  }

  const placeholder = normalizeText(element.getAttribute("placeholder") || "");
  if (placeholder) {
    return placeholder;
  }

  const title = normalizeText(element.getAttribute("title") || "");
  if (title) {
    return title;
  }

  if (element instanceof HTMLButtonElement || element.getAttribute("role") === "button") {
    return normalizeText(element.textContent || element.value || "");
  }

  if (element instanceof HTMLAnchorElement) {
    return normalizeText(element.textContent || "");
  }

  return "";
}

function isSensitiveElement(element, label) {
  if (!element || typeof element.getAttribute !== "function") {
    return false;
  }

  const tagName = String(element.tagName || "").toLowerCase();
  const type = String(element.getAttribute("type") || "").toLowerCase();
  const autoComplete = String(element.getAttribute("autocomplete") || "").toLowerCase();
  const descriptor = [
    label,
    element.getAttribute("name") || "",
    element.getAttribute("id") || "",
    element.getAttribute("aria-label") || "",
    element.getAttribute("placeholder") || "",
    autoComplete
  ]
    .filter(Boolean)
    .join(" ");

  if (type === "password" || autoComplete === "one-time-code") {
    return true;
  }

  if (tagName !== "input" && tagName !== "textarea") {
    return false;
  }

  return SENSITIVE_FIELD_PATTERN.test(descriptor);
}

function roundCoordinate(value, step = 10) {
  if (!Number.isFinite(value)) {
    return null;
  }

  return Math.round(value / step) * step;
}

function getBoundsSummary(element) {
  if (!element || typeof element.getBoundingClientRect !== "function") {
    return null;
  }

  const rect = element.getBoundingClientRect();
  if (!Number.isFinite(rect.width) || !Number.isFinite(rect.height) || rect.width <= 0 || rect.height <= 0) {
    return null;
  }

  return {
    x: roundCoordinate(rect.left),
    y: roundCoordinate(rect.top),
    width: roundCoordinate(rect.width),
    height: roundCoordinate(rect.height)
  };
}

function getFocusedElementSummary() {
  const activeElement = document.activeElement;
  if (
    !activeElement ||
    activeElement === document.body ||
    activeElement === document.documentElement
  ) {
    return null;
  }

  const tag = String(activeElement.tagName || "").toLowerCase();
  if (!tag) {
    return null;
  }

  const rawLabel = findElementLabel(activeElement);
  const sensitive = isSensitiveElement(activeElement, rawLabel);

  return {
    tag,
    role: inferRole(activeElement) || null,
    type: tag === "input" ? String(activeElement.getAttribute("type") || "text").toLowerCase() : null,
    label: sensitive ? null : rawLabel || null,
    disabled: Boolean(activeElement.disabled || activeElement.getAttribute("aria-disabled") === "true"),
    readOnly: Boolean(activeElement.readOnly || activeElement.getAttribute("aria-readonly") === "true"),
    sensitive,
    bounds: getBoundsSummary(activeElement)
  };
}

function getViewportSummary() {
  return {
    width: Math.max(1, Math.round(window.innerWidth || document.documentElement.clientWidth || 1)),
    height: Math.max(1, Math.round(window.innerHeight || document.documentElement.clientHeight || 1)),
    scrollX: roundCoordinate(window.scrollX || window.pageXOffset || 0, 100),
    scrollY: roundCoordinate(window.scrollY || window.pageYOffset || 0, 100)
  };
}

function collectHints() {
  const headings = collectTextList("h1, h2, h3", MAX_HEADING_HINTS);
  const buttons = collectTextList(
    "button, [role='button'], input[type='submit'], input[type='button']",
    MAX_BUTTON_HINTS
  );

  return {
    pageTitle: document.title || "",
    pageLanguage: normalizeText(document.documentElement.lang || "", 20),
    viewport: getViewportSummary(),
    focusedElement: getFocusedElementSummary(),
    headingHints: headings,
    buttonHints: buttons
  };
}

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

function normalizeMatchText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenizeMatchText(value) {
  return normalizeMatchText(value)
    .split(" ")
    .map((token) => token.trim())
    .filter((token) => token && !MATCH_STOP_WORDS.has(token));
}

function getElementTextCandidates(element) {
  if (!element || typeof element.getAttribute !== "function") {
    return [];
  }

  return [
    findElementLabel(element),
    element.textContent || "",
    element.value || "",
    element.getAttribute("placeholder") || "",
    element.getAttribute("title") || "",
    element.getAttribute("aria-label") || "",
    inferRole(element),
    element.getAttribute("type") || ""
  ]
    .map((value) => normalizeText(value))
    .filter(Boolean);
}

function isVisibleCandidate(element) {
  if (!element || typeof element.getBoundingClientRect !== "function") {
    return false;
  }

  const rect = element.getBoundingClientRect();
  if (!Number.isFinite(rect.width) || !Number.isFinite(rect.height) || rect.width <= 0 || rect.height <= 0) {
    return false;
  }

  return rect.bottom >= 0 && rect.right >= 0 && rect.top <= window.innerHeight && rect.left <= window.innerWidth;
}

function scoreLabelMatch(labelText, element) {
  const normalizedLabel = normalizeMatchText(labelText);
  const labelTokens = tokenizeMatchText(labelText);
  if (!normalizedLabel || labelTokens.length === 0) {
    return 0;
  }

  const candidateText = normalizeMatchText(getElementTextCandidates(element).join(" "));
  if (!candidateText) {
    return 0;
  }

  const candidateTokens = new Set(tokenizeMatchText(candidateText));
  let score = 0;

  if (candidateText.includes(normalizedLabel) || normalizedLabel.includes(candidateText)) {
    score += 3;
  }

  for (const token of labelTokens) {
    if (candidateTokens.has(token)) {
      score += 1;
    }
  }

  const role = inferRole(element);
  const type = String(element.getAttribute("type") || "").toLowerCase();
  if (labelTokens.includes("search") && (role === "searchbox" || type === "search")) {
    score += 2;
  }
  if (labelTokens.includes("button") && role === "button") {
    score += 2;
  }
  if (labelTokens.includes("link") && role === "link") {
    score += 2;
  }

  return score;
}

function findAnchorElementForLabel(labelText) {
  const normalizedLabel = normalizeText(labelText);
  if (!normalizedLabel) {
    return null;
  }

  const candidates = Array.from(
    document.querySelectorAll(
      [
        "button",
        "a[href]",
        "input",
        "textarea",
        "select",
        "[role='button']",
        "[role='link']",
        "[role='textbox']",
        "[role='searchbox']",
        "[contenteditable='true']"
      ].join(", ")
    )
  ).filter(isVisibleCandidate);

  let bestMatch = null;

  for (const candidate of candidates) {
    const score = scoreLabelMatch(normalizedLabel, candidate);
    if (score < MIN_LABEL_MATCH_SCORE) {
      continue;
    }

    if (!bestMatch || score > bestMatch.score) {
      bestMatch = { element: candidate, score };
    }
  }

  return bestMatch ? bestMatch.element : null;
}

function mapElementToViewport(element) {
  if (!element || typeof element.getBoundingClientRect !== "function") {
    return null;
  }

  const rect = element.getBoundingClientRect();
  if (!Number.isFinite(rect.width) || !Number.isFinite(rect.height) || rect.width <= 0 || rect.height <= 0) {
    return null;
  }

  const viewportWidth = Math.max(1, window.innerWidth || document.documentElement.clientWidth || 1);
  const viewportHeight = Math.max(1, window.innerHeight || document.documentElement.clientHeight || 1);

  return {
    x: clamp(rect.left + rect.width / 2, 0, viewportWidth),
    y: clamp(rect.top + rect.height / 2, 0, viewportHeight),
    viewportWidth,
    viewportHeight,
    sourceWidth: viewportWidth,
    sourceHeight: viewportHeight,
    coordinateType: "anchored",
    anchorRect: {
      left: roundCoordinate(rect.left),
      top: roundCoordinate(rect.top),
      width: roundCoordinate(rect.width),
      height: roundCoordinate(rect.height)
    }
  };
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
  const labelText = String(args.label || "").trim();
  const anchoredElement = labelText ? findAnchorElementForLabel(labelText) : null;
  const mapped = anchoredElement ? mapElementToViewport(anchoredElement) : mapToViewport(args);
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
    mapped,
    anchoredByLabel: Boolean(anchoredElement)
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
