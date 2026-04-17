// PDF.js continuous-scroll renderer.
// Loads pdf.js from the jsDelivr CDN, renders each page on demand into a
// canvas, keeping scroll position stable via aspect-ratio placeholders.

import * as pdfjsLib from "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.min.mjs";

pdfjsLib.GlobalWorkerOptions.workerSrc =
  "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.worker.min.mjs";

const viewer = document.getElementById("pdf-viewer");
const PDF_URL = "portfolio.pdf";

const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);

function showFallback(message) {
  const el = document.createElement("p");
  el.className = "fallback";
  el.innerHTML = `${message} <a href="${PDF_URL}" download>Portfolio als PDF herunterladen</a>.`;
  viewer.appendChild(el);
}

async function render() {
  let pdf;
  try {
    pdf = await pdfjsLib.getDocument(PDF_URL).promise;
  } catch (err) {
    console.error("PDF konnte nicht geladen werden", err);
    showFallback("Das Portfolio konnte nicht geladen werden.");
    return;
  }

  const pages = new Array(pdf.numPages);
  const rendered = new Set();

  // Create placeholders with correct aspect ratio before any render, so
  // scroll position never jumps when a page later paints in.
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale: 1 });
    const wrapper = document.createElement("div");
    wrapper.className = "pdf-page";
    wrapper.dataset.pageNumber = String(i);
    wrapper.style.aspectRatio = `${viewport.width} / ${viewport.height}`;
    const placeholder = document.createElement("div");
    placeholder.className = "pdf-placeholder";
    placeholder.textContent = `Seite ${i}`;
    wrapper.appendChild(placeholder);
    viewer.appendChild(wrapper);
    pages[i - 1] = { page, wrapper };
  }

  const paint = async (index) => {
    if (rendered.has(index)) return;
    rendered.add(index);
    const { page, wrapper } = pages[index];
    const cssWidth = wrapper.clientWidth;
    if (cssWidth === 0) {
      rendered.delete(index);
      return;
    }
    const unscaledViewport = page.getViewport({ scale: 1 });
    const scale = cssWidth / unscaledViewport.width;
    const viewport = page.getViewport({ scale: scale * pixelRatio });
    const canvas = document.createElement("canvas");
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    canvas.style.width = "100%";
    canvas.style.height = "auto";
    const ctx = canvas.getContext("2d", { alpha: false });
    try {
      await page.render({ canvasContext: ctx, viewport }).promise;
      wrapper.innerHTML = "";
      wrapper.appendChild(canvas);
    } catch (err) {
      console.error(`Seite ${index + 1} konnte nicht gerendert werden`, err);
      rendered.delete(index);
    }
  };

  if ("IntersectionObserver" in window) {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const i = Number(entry.target.dataset.pageNumber) - 1;
          paint(i);
        }
      },
      { rootMargin: "1200px 0px", threshold: 0 }
    );
    for (const { wrapper } of pages) observer.observe(wrapper);
  } else {
    // Fallback: render everything sequentially.
    for (let i = 0; i < pages.length; i++) await paint(i);
  }

  // Re-render on width changes (orientation / resize) at a throttled rate.
  let resizeTimer = null;
  let lastWidth = window.innerWidth;
  window.addEventListener("resize", () => {
    if (Math.abs(window.innerWidth - lastWidth) < 40) return;
    lastWidth = window.innerWidth;
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      rendered.clear();
      for (const { wrapper } of pages) {
        wrapper.innerHTML = `<div class="pdf-placeholder">Seite ${wrapper.dataset.pageNumber}</div>`;
      }
      for (const { wrapper } of pages) {
        const rect = wrapper.getBoundingClientRect();
        if (rect.top < window.innerHeight + 1200 && rect.bottom > -1200) {
          paint(Number(wrapper.dataset.pageNumber) - 1);
        }
      }
    }, 200);
  });
}

render();
