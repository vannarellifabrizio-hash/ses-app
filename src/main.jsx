import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";

/**
 * FOCUS SENTINEL (definitivo):
 * - Memorizza l'ultimo input/textarea attivo
 * - Se dopo un input/keydown il focus cade su BODY, lo ripristina
 * - Sta FUORI da React, quindi non può essere "battuto" da re-render
 */
(function installFocusSentinel() {
  if (typeof window === "undefined") return;
  if (window.__FOCUS_SENTINEL__) return;
  window.__FOCUS_SENTINEL__ = true;

  let lastEditable = null;

  const isEditable = (el) =>
    el &&
    (el.tagName === "INPUT" ||
      el.tagName === "TEXTAREA" ||
      el.isContentEditable);

  // Aggiorna sempre l'ultimo campo valido
  document.addEventListener(
    "focusin",
    (e) => {
      if (isEditable(e.target)) lastEditable = e.target;
    },
    true
  );

  const restoreIfLost = () => {
    // Se il focus è finito su BODY ma avevamo un input valido prima, ripristina.
    if (document.activeElement === document.body && isEditable(lastEditable)) {
      try {
        lastEditable.focus({ preventScroll: true });
      } catch {
        try { lastEditable.focus(); } catch {}
      }
      // ripristina caret alla fine (safe)
      try {
        if (typeof lastEditable.selectionStart === "number") {
          const pos = lastEditable.value?.length ?? lastEditable.selectionStart;
          lastEditable.setSelectionRange(pos, pos);
        }
      } catch {}
    }
  };

  // Dopo QUALSIASI digitazione o input, verifica se il focus è stato rubato
  document.addEventListener("input", () => setTimeout(restoreIfLost, 0), true);
  document.addEventListener("keydown", () => setTimeout(restoreIfLost, 0), true);
  document.addEventListener("keyup", () => setTimeout(restoreIfLost, 0), true);
})();

createRoot(document.getElementById("root")).render(<App />);
