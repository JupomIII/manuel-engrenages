/*
 * Rendu des formules LaTeX avec KaTeX.
 *
 * Les éléments portent data-tex="..." et contiennent un texte de repli lisible :
 * si KaTeX n'est pas disponible (hors ligne), la formule reste compréhensible.
 */
(function (global) {
  "use strict";

  function renderMath(root) {
    if (!global.katex) return;
    (root || document).querySelectorAll("[data-tex]").forEach(function (el) {
      if (el.getAttribute("data-tex-done") === "1") return;
      try {
        global.katex.render(el.getAttribute("data-tex"), el, {
          throwOnError: false,
          displayMode: el.hasAttribute("data-display"),
          output: "html"
        });
        el.setAttribute("data-tex-done", "1");
      } catch (error) {
        // On garde le texte de repli.
      }
    });
  }

  // À appeler quand KaTeX vient d'arriver : remplace les replis déjà affichés.
  function renderAllMath() {
    document.querySelectorAll("[data-tex]").forEach(function (el) {
      el.removeAttribute("data-tex-done");
    });
    renderMath(document);
  }

  global.renderMath = renderMath;
  global.renderAllMath = renderAllMath;
})(window);
