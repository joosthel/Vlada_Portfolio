// Minimal PDF.js-backed slideshow reader with fullscreen pan/zoom lightbox.
// — spread view on wide screens (even left, odd right; cover + back alone)
// — keyboard (←/→, Home/End, Esc), touch-swipe, click-to-enlarge

import * as pdfjsLib from "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.min.mjs";

pdfjsLib.GlobalWorkerOptions.workerSrc =
  "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.worker.min.mjs";

const PDF_URL = "portfolio.pdf";
const PIXEL_RATIO_CAP = 2;
const LIGHTBOX_RENDER_SCALE = 2.2;
const LIGHTBOX_ZOOM_MIN = 0.5;
const LIGHTBOX_ZOOM_MAX = 5;

const stageInner = document.getElementById("stage-inner");
const stage = document.getElementById("stage");
const reader = document.getElementById("reader");
const counterEl = document.getElementById("counter");
const prevBtn = document.getElementById("prev");
const nextBtn = document.getElementById("next");
const lightbox = document.getElementById("lightbox");
const lightboxStage = document.getElementById("lightbox-stage");
const lightboxCounter = document.getElementById("lightbox-counter");
const lbCloseBtn = document.getElementById("lightbox-close");
const lbZoomIn = document.getElementById("lightbox-zoom-in");
const lbZoomOut = document.getElementById("lightbox-zoom-out");
const lbZoomReset = document.getElementById("lightbox-zoom-reset");

const pixelRatio = Math.min(window.devicePixelRatio || 1, PIXEL_RATIO_CAP);

let pdf;
let pageMeta = []; // { page, viewportAtScale1 }
let views = []; // array of arrays of 1-based page numbers (usually single-entry)
let viewIndex = 0;
let renderToken = 0;

function showFallback(message) {
  stageInner.innerHTML = `<p class="fallback">${message} <a href="${PDF_URL}" download>Portfolio als PDF herunterladen</a>.</p>`;
}

function buildViews(numPages) {
  // Each PDF page in this portfolio is already a pre-composed spread, so one
  // view = one PDF page. Kept as arrays-of-pages so future changes (e.g.
  // on-the-fly splitting of views on mobile) can slot in without touching
  // the rendering code.
  return Array.from({ length: numPages }, (_, i) => [i + 1]);
}

function findViewIndexForPage(pageNumber) {
  for (let i = 0; i < views.length; i++) {
    if (views[i].includes(pageNumber)) return i;
  }
  return 0;
}

async function renderPageToCanvas(pageNumber, cssWidth, cssHeight, scaleBoost = 1) {
  const page = pageMeta[pageNumber - 1].page;
  const base = page.getViewport({ scale: 1 });
  const scale =
    (Math.min(cssWidth / base.width, cssHeight / base.height) || 1) * pixelRatio * scaleBoost;
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(viewport.width);
  canvas.height = Math.round(viewport.height);
  canvas.style.width = `${canvas.width / pixelRatio / scaleBoost}px`;
  canvas.style.height = `${canvas.height / pixelRatio / scaleBoost}px`;
  const ctx = canvas.getContext("2d", { alpha: false });
  await page.render({ canvasContext: ctx, viewport }).promise;
  return canvas;
}

function computeStageBox() {
  // Stage is the middle grid row; measure what's available.
  const rect = stage.getBoundingClientRect();
  return {
    width: Math.max(240, rect.width),
    height: Math.max(240, rect.height - 8),
  };
}

async function renderCurrentView() {
  if (!views.length) return;
  const token = ++renderToken;
  const pages = views[viewIndex];
  const { width: stageW, height: stageH } = computeStageBox();

  const metas = pages.map((p) => pageMeta[p - 1].viewportAtScale1);
  const totalNaturalWidth = metas.reduce((s, v) => s + v.width, 0);
  const maxNaturalHeight = Math.max(...metas.map((v) => v.height));
  const gap = pages.length > 1 ? 4 : 0;

  const widthLimit = stageW - gap;
  const heightLimit = stageH;

  const scaleByWidth = widthLimit / totalNaturalWidth;
  const scaleByHeight = heightLimit / maxNaturalHeight;
  const fitScale = Math.min(scaleByWidth, scaleByHeight);

  stageInner.classList.add("is-fading");
  await new Promise((r) => setTimeout(r, 120));
  if (token !== renderToken) return;
  stageInner.innerHTML = "";

  const leaves = await Promise.all(
    pages.map(async (p, idx) => {
      const natural = metas[idx];
      const cssW = natural.width * fitScale;
      const cssH = natural.height * fitScale;
      const leaf = document.createElement("div");
      leaf.className = "leaf";
      leaf.style.width = `${cssW}px`;
      leaf.style.height = `${cssH}px`;
      leaf.setAttribute("role", "button");
      leaf.setAttribute("tabindex", "0");
      leaf.setAttribute("aria-label", `Seite ${p} vergrößern`);
      leaf.dataset.pageNumber = String(p);
      const label = document.createElement("span");
      label.className = "leaf-label";
      label.textContent = String(p).padStart(2, "0");
      leaf.appendChild(label);
      const canvas = await renderPageToCanvas(p, cssW, cssH, 1);
      canvas.style.width = `${cssW}px`;
      canvas.style.height = `${cssH}px`;
      leaf.appendChild(canvas);
      leaf.addEventListener("click", () => openLightbox(p));
      leaf.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          openLightbox(p);
        }
      });
      return leaf;
    })
  );

  if (token !== renderToken) return;
  stageInner.innerHTML = "";
  for (const leaf of leaves) stageInner.appendChild(leaf);
  stageInner.classList.remove("is-fading");
  updateChrome();
}

function updateChrome() {
  const pages = views[viewIndex];
  const label = pages.length === 2 ? `${pages[0]}–${pages[1]}` : String(pages[0]).padStart(2, "0");
  counterEl.innerHTML = `<strong>${label}</strong> &nbsp;/&nbsp; ${String(pdf.numPages).padStart(2, "0")}`;
  prevBtn.disabled = viewIndex === 0;
  nextBtn.disabled = viewIndex === views.length - 1;
}

function go(delta) {
  const next = Math.max(0, Math.min(views.length - 1, viewIndex + delta));
  if (next === viewIndex) return;
  viewIndex = next;
  renderCurrentView();
}

function goToPage(pageNumber) {
  const idx = findViewIndexForPage(pageNumber);
  if (idx === viewIndex) return;
  viewIndex = idx;
  renderCurrentView();
}

/* ---------- Lightbox ---------- */

const lb = {
  pageNumber: 0,
  scale: 1,
  baseScale: 1,
  tx: 0,
  ty: 0,
  canvas: null,
  pointers: new Map(),
  lastPinchDist: 0,
  lastPanPointerId: null,
  lastPanX: 0,
  lastPanY: 0,
};

function applyLightboxTransform() {
  if (!lb.canvas) return;
  lb.canvas.style.transform = `translate(${lb.tx}px, ${lb.ty}px) scale(${lb.scale})`;
}

function fitLightbox() {
  if (!lb.canvas) return;
  const stageRect = lightboxStage.getBoundingClientRect();
  const cw = lb.canvas.width / pixelRatio / LIGHTBOX_RENDER_SCALE;
  const ch = lb.canvas.height / pixelRatio / LIGHTBOX_RENDER_SCALE;
  // make the canvas render at its intrinsic size in CSS pixels, then we scale via transform.
  lb.canvas.style.width = `${cw}px`;
  lb.canvas.style.height = `${ch}px`;
  const fit = Math.min(stageRect.width / cw, stageRect.height / ch) * 0.96;
  lb.baseScale = fit;
  lb.scale = fit;
  lb.tx = (stageRect.width - cw * fit) / 2;
  lb.ty = (stageRect.height - ch * fit) / 2;
  applyLightboxTransform();
  updateLightboxZoomLabel();
}

function updateLightboxZoomLabel() {
  const pct = Math.round((lb.scale / lb.baseScale) * 100);
  lbZoomReset.textContent = `${pct}%`;
}

function zoomLightbox(factor, originX, originY) {
  const stageRect = lightboxStage.getBoundingClientRect();
  const ox = originX ?? stageRect.width / 2;
  const oy = originY ?? stageRect.height / 2;
  const minScale = lb.baseScale * LIGHTBOX_ZOOM_MIN;
  const maxScale = lb.baseScale * LIGHTBOX_ZOOM_MAX;
  const prev = lb.scale;
  const next = Math.max(minScale, Math.min(maxScale, prev * factor));
  if (next === prev) return;
  // keep the pointed-at position stable
  lb.tx = ox - ((ox - lb.tx) / prev) * next;
  lb.ty = oy - ((oy - lb.ty) / prev) * next;
  lb.scale = next;
  applyLightboxTransform();
  updateLightboxZoomLabel();
}

async function openLightbox(pageNumber) {
  lb.pageNumber = pageNumber;
  lightbox.classList.add("is-open");
  lightbox.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";
  lightboxStage.innerHTML = "";
  lightboxCounter.textContent = `Seite ${String(pageNumber).padStart(2, "0")} / ${pdf.numPages}`;
  const natural = pageMeta[pageNumber - 1].viewportAtScale1;
  const canvas = await renderPageToCanvas(
    pageNumber,
    natural.width,
    natural.height,
    LIGHTBOX_RENDER_SCALE
  );
  lb.canvas = canvas;
  lightboxStage.appendChild(canvas);
  fitLightbox();
}

function closeLightbox() {
  lightbox.classList.remove("is-open");
  lightbox.setAttribute("aria-hidden", "true");
  document.body.style.overflow = "";
  lightboxStage.innerHTML = "";
  lb.canvas = null;
  lb.pointers.clear();
}

/* ---------- Input: keyboard, pointer/swipe, wheel ---------- */

window.addEventListener("keydown", (e) => {
  if (lightbox.classList.contains("is-open")) {
    if (e.key === "Escape") {
      e.preventDefault();
      closeLightbox();
      return;
    }
    if (e.key === "0") {
      fitLightbox();
      return;
    }
    if (e.key === "+" || e.key === "=") {
      zoomLightbox(1.2);
      return;
    }
    if (e.key === "-" || e.key === "_") {
      zoomLightbox(1 / 1.2);
      return;
    }
    if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
      e.preventDefault();
      const dir = e.key === "ArrowRight" ? 1 : -1;
      const nextPage = Math.max(1, Math.min(pdf.numPages, lb.pageNumber + dir));
      if (nextPage !== lb.pageNumber) openLightbox(nextPage);
      return;
    }
    return;
  }
  if (e.target instanceof HTMLButtonElement && (e.key === " " || e.key === "Enter")) return;
  if (e.key === "ArrowRight" || e.key === "PageDown" || e.key === " ") {
    e.preventDefault();
    go(1);
  } else if (e.key === "ArrowLeft" || e.key === "PageUp") {
    e.preventDefault();
    go(-1);
  } else if (e.key === "Home") {
    e.preventDefault();
    viewIndex = 0;
    renderCurrentView();
  } else if (e.key === "End") {
    e.preventDefault();
    viewIndex = views.length - 1;
    renderCurrentView();
  }
});

prevBtn.addEventListener("click", () => go(-1));
nextBtn.addEventListener("click", () => go(1));

// Touch/pointer swipe on the reader (not when lightbox is open).
(() => {
  let startX = 0;
  let startY = 0;
  let tracking = false;
  reader.addEventListener(
    "touchstart",
    (e) => {
      if (lightbox.classList.contains("is-open")) return;
      if (e.touches.length !== 1) return;
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
      tracking = true;
    },
    { passive: true }
  );
  reader.addEventListener(
    "touchend",
    (e) => {
      if (!tracking) return;
      tracking = false;
      const t = e.changedTouches[0];
      const dx = t.clientX - startX;
      const dy = t.clientY - startY;
      if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.3) {
        go(dx < 0 ? 1 : -1);
      }
    },
    { passive: true }
  );
})();

/* ---------- Lightbox pointer handlers ---------- */

lightboxStage.addEventListener("pointerdown", (e) => {
  lightboxStage.setPointerCapture(e.pointerId);
  lb.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (lb.pointers.size === 1) {
    lb.lastPanPointerId = e.pointerId;
    lb.lastPanX = e.clientX;
    lb.lastPanY = e.clientY;
    lightboxStage.classList.add("is-grabbing");
  } else if (lb.pointers.size === 2) {
    const pts = [...lb.pointers.values()];
    lb.lastPinchDist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
  }
});

lightboxStage.addEventListener("pointermove", (e) => {
  if (!lb.pointers.has(e.pointerId)) return;
  lb.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (lb.pointers.size === 1 && lb.lastPanPointerId === e.pointerId) {
    lb.tx += e.clientX - lb.lastPanX;
    lb.ty += e.clientY - lb.lastPanY;
    lb.lastPanX = e.clientX;
    lb.lastPanY = e.clientY;
    applyLightboxTransform();
  } else if (lb.pointers.size === 2) {
    const pts = [...lb.pointers.values()];
    const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
    const midX = (pts[0].x + pts[1].x) / 2;
    const midY = (pts[0].y + pts[1].y) / 2;
    if (lb.lastPinchDist > 0) {
      const stageRect = lightboxStage.getBoundingClientRect();
      zoomLightbox(dist / lb.lastPinchDist, midX - stageRect.left, midY - stageRect.top);
    }
    lb.lastPinchDist = dist;
  }
});

const endPointer = (e) => {
  lb.pointers.delete(e.pointerId);
  if (lb.pointers.size < 2) lb.lastPinchDist = 0;
  if (lb.pointers.size === 0) {
    lb.lastPanPointerId = null;
    lightboxStage.classList.remove("is-grabbing");
  }
};
lightboxStage.addEventListener("pointerup", endPointer);
lightboxStage.addEventListener("pointercancel", endPointer);
lightboxStage.addEventListener("pointerleave", endPointer);

lightboxStage.addEventListener(
  "wheel",
  (e) => {
    if (!lightbox.classList.contains("is-open")) return;
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
    const stageRect = lightboxStage.getBoundingClientRect();
    zoomLightbox(factor, e.clientX - stageRect.left, e.clientY - stageRect.top);
  },
  { passive: false }
);

lightboxStage.addEventListener("dblclick", (e) => {
  const stageRect = lightboxStage.getBoundingClientRect();
  const pct = lb.scale / lb.baseScale;
  if (pct > 1.05) fitLightbox();
  else zoomLightbox(2, e.clientX - stageRect.left, e.clientY - stageRect.top);
});

lightbox.addEventListener("click", (e) => {
  // clicking the faded background (outside the stage) closes
  if (e.target === lightbox) closeLightbox();
});

lbCloseBtn.addEventListener("click", closeLightbox);
lbZoomIn.addEventListener("click", () => zoomLightbox(1.2));
lbZoomOut.addEventListener("click", () => zoomLightbox(1 / 1.2));
lbZoomReset.addEventListener("click", fitLightbox);

/* ---------- Resize handling ---------- */

let resizeTimer = null;
let lastWidth = window.innerWidth;
window.addEventListener("resize", () => {
  if (Math.abs(window.innerWidth - lastWidth) < 24) return;
  lastWidth = window.innerWidth;
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    renderCurrentView();
    if (lightbox.classList.contains("is-open")) fitLightbox();
  }, 180);
});

/* ---------- Boot ---------- */

(async () => {
  try {
    pdf = await pdfjsLib.getDocument(PDF_URL).promise;
  } catch (err) {
    console.error("PDF konnte nicht geladen werden", err);
    showFallback("Das Portfolio konnte nicht geladen werden.");
    return;
  }

  pageMeta = await Promise.all(
    Array.from({ length: pdf.numPages }, async (_, i) => {
      const page = await pdf.getPage(i + 1);
      return { page, viewportAtScale1: page.getViewport({ scale: 1 }) };
    })
  );

  views = buildViews(pdf.numPages);
  viewIndex = 0;
  await renderCurrentView();
})();
