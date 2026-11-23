(() => {
  if (window.__FES_INSTALLED__) return;
  window.__FES_INSTALLED__ = true;

  let selecting = false;
  let selected = [];
  let hover = null;
  let overlay = null;
  let toolbar = null;

  const isInsideExtensionUi = node =>
    node && (node.id === "__fes_overlay" || node.closest?.("#__fes_overlay"));

  function ensureOverlay() {
    if (overlay) return;
    overlay = document.createElement("div");
    overlay.id = "__fes_overlay";
    overlay.style.cssText = "position:fixed;inset:0;z-index:2147483647;pointer-events:none;";
    toolbar = document.createElement("div");
    toolbar.style.cssText = [
      "position:fixed;top:12px;left:50%;transform:translateX(-50%);",
      "background:#15191f;color:#fff;padding:9px 14px;border-radius:10px;",
      "font:13px/1.4 system-ui,sans-serif;box-shadow:0 4px 18px #0004;",
      "pointer-events:none;white-space:nowrap"
    ].join("");
    toolbar.textContent = "Click elements to select · Esc to finish";
    overlay.appendChild(toolbar);
    document.documentElement.appendChild(overlay);
  }

  function getHighlight(el, color, dashed = false) {
    const r = el.getBoundingClientRect();
    const box = document.createElement("div");
    box.style.cssText = [
      "position:fixed;pointer-events:none;box-sizing:border-box;",
      `left:${r.left}px;top:${r.top}px;width:${r.width}px;height:${r.height}px;`,
      `border:2px ${dashed ? "dashed" : "solid"} ${color};`,
      "background:rgba(36,130,220,.08);"
    ].join("");
    return box;
  }

  function redraw() {
    if (!overlay) return;
    [...overlay.querySelectorAll(".fes-highlight")].forEach(n => n.remove());
    selected.forEach(el => {
      if (el.isConnected) {
        const h = getHighlight(el, "#16865d");
        h.className = "fes-highlight";
        overlay.appendChild(h);
      }
    });
    if (hover && hover.isConnected && !selected.includes(hover)) {
      const h = getHighlight(hover, "#2686e8", true);
      h.className = "fes-highlight";
      overlay.appendChild(h);
    }
    toolbar.textContent = `Selected: ${selected.length} · Click to add/remove · Esc to finish`;
  }

  function elementFromEvent(event) {
    const path = event.composedPath?.() || [];
    return path.find(n =>
      n instanceof Element &&
      n !== document.documentElement &&
      n !== document.body &&
      !isInsideExtensionUi(n)
    ) || null;
  }

  function onMove(event) {
    const el = elementFromEvent(event);
    if (!el || el === hover) return;
    hover = el;
    redraw();
  }

  function onClick(event) {
    const el = elementFromEvent(event);
    if (!el) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();

    const index = selected.indexOf(el);
    if (index >= 0) selected.splice(index, 1);
    else {
      // Avoid selecting a descendant when its ancestor is already selected,
      // and remove selected descendants when adding their ancestor.
      selected = selected.filter(existing => !el.contains(existing));
      if (!selected.some(existing => existing.contains(el))) selected.push(el);
    }
    redraw();
  }

  function stopSelection() {
    selecting = false;
    hover = null;
    document.removeEventListener("mousemove", onMove, true);
    document.removeEventListener("click", onClick, true);
    document.removeEventListener("keydown", onKey, true);
    overlay?.remove();
    overlay = toolbar = null;
  }

  function onKey(event) {
    if (event.key === "Escape") {
      event.preventDefault();
      stopSelection();
    }
  }

  function startSelection() {
    stopSelection();
    selecting = true;
    ensureOverlay();
    document.addEventListener("mousemove", onMove, true);
    document.addEventListener("click", onClick, true);
    document.addEventListener("keydown", onKey, true);
    redraw();
  }

  function clearSelection() {
    selected = [];
    stopSelection();
  }

  function copyComputedStyles(source, target) {
    const computed = getComputedStyle(source);
    for (const property of computed) {
      target.style.setProperty(property, computed.getPropertyValue(property), "important");
    }

    // Preserve current form control values where possible.
    if (source instanceof HTMLInputElement && target instanceof HTMLInputElement) {
      target.value = source.value;
      target.checked = source.checked;
    } else if (source instanceof HTMLTextAreaElement && target instanceof HTMLTextAreaElement) {
      target.value = source.value;
      target.textContent = source.value;
    } else if (source instanceof HTMLSelectElement && target instanceof HTMLSelectElement) {
      target.value = source.value;
      [...target.options].forEach((option, i) => {
        if (source.options[i]) option.selected = source.options[i].selected;
      });
    }

    const srcChildren = source.children;
    const dstChildren = target.children;
    for (let i = 0; i < srcChildren.length; i++) {
      if (dstChildren[i]) copyComputedStyles(srcChildren[i], dstChildren[i]);
    }

    for (const pseudo of ["::before", "::after"]) {
      const sourceStyle = getComputedStyle(source, pseudo);
      const content = sourceStyle.getPropertyValue("content");
      if (!content || content === "none" || content === "normal") continue;

      const targetStyle = getComputedStyle(target, pseudo);
      const targetContent = targetStyle.getPropertyValue("content");
      if (targetContent && targetContent !== "none" && targetContent !== "normal") continue;

      const materialized = document.createElement("span");
      materialized.setAttribute("aria-hidden", "true");
      for (const property of sourceStyle) {
        materialized.style.setProperty(property, sourceStyle.getPropertyValue(property), "important");
      }

      if (content.length >= 2 && (content[0] === '"' || content[0] === "'")) {
        materialized.textContent = content.slice(1, -1);
      }
      if (pseudo === "::before") target.prepend(materialized);
      else target.append(materialized);
    }
  }

  function expandCloneTree(root) {
    const all = [root, ...root.querySelectorAll("*")];
    // Bottom-up expansion lets nested scrollers report their full content height.
    all.reverse().forEach(el => {
      const fullHeight = el.scrollHeight;
      const wasScrollable = fullHeight > el.clientHeight + 2;
      const computedPosition = getComputedStyle(el).position;

      if (wasScrollable) {
        el.style.setProperty("height", `${fullHeight}px`, "important");
        el.style.setProperty("max-height", "none", "important");
        el.style.setProperty("min-height", "0", "important");
        el.style.setProperty("overflow", "visible", "important");
        el.style.setProperty("overflow-y", "visible", "important");
      }
      if (computedPosition === "sticky" || computedPosition === "fixed") {
        el.style.setProperty("position", "relative", "important");
      }
    });
  }

  function getCaptureBackground(elements) {
    let commonAncestor = elements[0];
    while (commonAncestor && elements.some(element => !commonAncestor.contains(element))) {
      commonAncestor = commonAncestor.parentElement;
    }

    for (let element = commonAncestor;
      element && element !== document.documentElement;
      element = element.parentElement) {
      const style = getComputedStyle(element);
      if (style.backgroundColor !== "rgba(0, 0, 0, 0)" || style.backgroundImage !== "none") {
        return style;
      }
    }

    const bodyStyle = getComputedStyle(document.body);
    if (bodyStyle.backgroundColor !== "rgba(0, 0, 0, 0)" || bodyStyle.backgroundImage !== "none") {
      return bodyStyle;
    }

    return getComputedStyle(document.documentElement);
  }

  async function prepareCapture() {
    stopSelection();
    if (!selected.length) throw new Error("Select at least one element first.");

    selected = selected.filter(el => el.isConnected);
    selected = selected.filter(el =>
      !selected.some(other => other !== el && other.contains(el))
    );
    if (!selected.length) throw new Error("The selected elements are no longer on this page.");

    const scrollX = window.scrollX;
    const scrollY = window.scrollY;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const captureBackground = getCaptureBackground(selected);

    const stage = document.createElement("div");
    stage.id = "__fes_capture_stage";
    stage.style.cssText = [
      "position:absolute!important;left:0!important;top:0!important;",
      `width:${Math.max(document.documentElement.clientWidth, viewportWidth)}px!important;`,
      "height:1px!important;overflow:visible!important;",
      `background-color:${captureBackground.backgroundColor}!important;`,
      `background-image:${captureBackground.backgroundImage}!important;`,
      `background-repeat:${captureBackground.backgroundRepeat}!important;`,
      `background-position:${captureBackground.backgroundPosition}!important;`,
      `background-size:${captureBackground.backgroundSize}!important;`,
      `background-attachment:${captureBackground.backgroundAttachment}!important;`,
      "z-index:2147483646!important;pointer-events:none!important;"
    ].join("");

    const clones = [];
    document.body.appendChild(stage);
    for (const original of selected) {
      const rect = original.getBoundingClientRect();
      const clone = original.cloneNode(true);
      stage.appendChild(clone);
      copyComputedStyles(original, clone);

      clone.style.setProperty("position", "absolute", "important");
      clone.style.setProperty("left", `${rect.left + scrollX}px`, "important");
      clone.style.setProperty("top", `${rect.top + scrollY}px`, "important");
      clone.style.setProperty("right", "auto", "important");
      clone.style.setProperty("bottom", "auto", "important");
      clone.style.setProperty("width", `${rect.width}px`, "important");
      clone.style.setProperty("height", "auto", "important");
      clone.style.setProperty("max-height", "none", "important");
      clone.style.setProperty("overflow", "visible", "important");
      clone.style.setProperty("transform", "none", "important");
      clone.style.setProperty("pointer-events", "none", "important");

      clones.push({ clone, left: rect.left + scrollX, top: rect.top + scrollY, width: rect.width });
    }

    const hidden = [...document.body.children].filter(el => el !== stage).map(el => ({
      el,
      value: el.style.getPropertyValue("visibility"),
      priority: el.style.getPropertyPriority("visibility")
    }));
    const oldBody = document.body.getAttribute("style");
    const oldHtml = document.documentElement.getAttribute("style");

    hidden.forEach(({ el }) => el.style.setProperty("visibility", "hidden", "important"));

    // Measure after attaching to the document: detached clones report unreliable scrollHeight.
    let maxBottom = 0;
    let maxRight = viewportWidth;
    clones.forEach(({ clone, left, top, width }) => {
      expandCloneTree(clone);
      const height = Math.max(clone.scrollHeight, clone.getBoundingClientRect().height);
      maxBottom = Math.max(maxBottom, top + height);
      maxRight = Math.max(maxRight, left + width);
    });

    const pageWidth = Math.max(viewportWidth, maxRight);
    const pageHeight = Math.max(viewportHeight, maxBottom + 8);

    stage.style.setProperty("width", `${pageWidth}px`, "important");
    stage.style.setProperty("height", `${pageHeight}px`, "important");

    const oldScrollBehavior = document.documentElement.style.scrollBehavior;
    document.body.style.setProperty("margin", "0", "important");
    document.body.style.setProperty("height", `${pageHeight}px`, "important");
    document.body.style.setProperty("min-height", `${pageHeight}px`, "important");
    document.body.style.setProperty("overflow", "visible", "important");
    document.documentElement.style.setProperty("height", `${pageHeight}px`, "important");
    document.documentElement.style.setProperty("min-height", `${pageHeight}px`, "important");
    document.documentElement.style.setProperty("overflow", "visible", "important");
    document.documentElement.style.setProperty("scroll-behavior", "auto", "important");
    stage.style.setProperty("visibility", "visible", "important");

    window.__FES_CAPTURE_STATE__ = {
      stage, hidden, oldBody, oldHtml, oldScrollBehavior,
      originalScrollX: scrollX, originalScrollY: scrollY
    };

    window.scrollTo(0, 0);
    await new Promise(resolve => requestAnimationFrame(() =>
      requestAnimationFrame(resolve)
    ));

    return {
      width: pageWidth,
      height: pageHeight,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      devicePixelRatio: window.devicePixelRatio
    };
  }

  function restoreCapture() {
    const state = window.__FES_CAPTURE_STATE__;
    if (!state) return;
    state.stage.remove();

    state.hidden.forEach(({ el, value, priority }) => {
      if (value) el.style.setProperty("visibility", value, priority);
      else el.style.removeProperty("visibility");
    });

    if (state.oldBody === null) document.body.removeAttribute("style");
    else document.body.setAttribute("style", state.oldBody);

    if (state.oldHtml === null) document.documentElement.removeAttribute("style");
    else document.documentElement.setAttribute("style", state.oldHtml);

    window.scrollTo(state.originalScrollX, state.originalScrollY);
    delete window.__FES_CAPTURE_STATE__;
  }

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === "FES_STATUS") {
      sendResponse({ count: selected.filter(el => el.isConnected).length, selecting });
      return;
    }
    if (message.type === "FES_START_SELECTION") {
      startSelection();
      sendResponse({ ok: true });
      return;
    }
    if (message.type === "FES_CLEAR") {
      clearSelection();
      sendResponse({ ok: true });
      return;
    }
    if (message.type === "FES_PREPARE_CAPTURE") {
      prepareCapture().then(sendResponse).catch(error => sendResponse({ error: error.message }));
      return true;
    }
    if (message.type === "FES_SCROLL_CAPTURE") {
      window.scrollTo(0, message.y);
      requestAnimationFrame(() => requestAnimationFrame(() => sendResponse({
        scrollY: window.scrollY,
        viewportHeight: window.innerHeight
      })));
      return true;
    }
    if (message.type === "FES_RESTORE_CAPTURE") {
      restoreCapture();
      sendResponse({ ok: true });
      return;
    }
  });
})();