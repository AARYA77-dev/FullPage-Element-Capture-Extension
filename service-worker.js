let lastCaptureStartedAt = 0;
let captureQueue = Promise.resolve();

async function ensureOffscreen() {
  const contexts = await chrome.runtime.getContexts({
    contextTypes: ["OFFSCREEN_DOCUMENT"],
    documentUrls: [chrome.runtime.getURL("offscreen.html")]
  });
  if (!contexts.length) {
    await chrome.offscreen.createDocument({
      url: "offscreen.html",
      reasons: ["BLOBS"],
      justification: "Stitch viewport screenshots into one full-height PNG."
    });
  }
}

async function sendTabMessage(tabId, message) {
  return await chrome.tabs.sendMessage(tabId, message);
}

function reportProgress(progress) {
  chrome.runtime.sendMessage({
    type: "FES_CAPTURE_PROGRESS",
    ...progress
  }, () => {
    void chrome.runtime.lastError;
  });
}

function captureVisibleTabAtSafeRate(windowId) {
  const capture = captureQueue.then(async () => {
    const minimumInterval = 600;
    const wait = minimumInterval - (Date.now() - lastCaptureStartedAt);
    if (wait > 0) {
      await new Promise(resolve => setTimeout(resolve, wait));
    }

    lastCaptureStartedAt = Date.now();
    return chrome.tabs.captureVisibleTab(windowId, { format: "png" });
  });
  captureQueue = capture.catch(() => {});
  return capture;
}

async function capture(tabId, windowId) {
  let prepared = false;
  try {
    reportProgress({ phase: "preparing" });
    let info;
    try {
      info = await sendTabMessage(tabId, { type: "FES_PREPARE_CAPTURE" });
    } catch {
      await chrome.scripting.executeScript({ target: { tabId }, files: ["content.js"] });
      info = await sendTabMessage(tabId, { type: "FES_PREPARE_CAPTURE" });
    }
    if (info?.error) throw new Error(info.error);
    prepared = true;

    reportProgress({ phase: "initializing" });
    await ensureOffscreen();
    const init = await chrome.runtime.sendMessage({
      type: "FES_STITCH_INIT",
      width: info.width,
      height: info.height,
      viewportWidth: info.viewportWidth,
      viewportHeight: info.viewportHeight,
      devicePixelRatio: info.devicePixelRatio
    });
    if (!init?.ok) throw new Error(init?.error || "Could not initialize screenshot.");

    const step = info.viewportHeight;
    const total = Math.ceil(info.height / step);
    let completed = 0;
    reportProgress({ phase: "capturing", completed, total });
    for (let y = 0; y < info.height; y += step) {
      const scrollResult = await sendTabMessage(tabId, { type: "FES_SCROLL_CAPTURE", y });
      // Give the browser a moment to paint the requested scroll position.
      await new Promise(resolve => setTimeout(resolve, 120));
      const dataUrl = await captureVisibleTabAtSafeRate(windowId);
      const result = await chrome.runtime.sendMessage({
        type: "FES_STITCH_FRAME",
        dataUrl,
        y: scrollResult?.scrollY ?? y
      });
      if (!result?.ok) throw new Error(result?.error || "Could not stitch screenshot.");
      completed += 1;
      reportProgress({ phase: "capturing", completed, total });
    }

    reportProgress({ phase: "finishing" });
    const finished = await chrome.runtime.sendMessage({ type: "FES_STITCH_FINISH" });
    if (!finished?.ok || !finished.dataUrl) {
      throw new Error(finished?.error || "Could not create PNG.");
    }

    const filename = `element-screenshot-${new Date().toISOString().replace(/[:.]/g, "-")}.png`;
    reportProgress({ phase: "downloading" });
    await chrome.downloads.download({
      url: finished.dataUrl,
      filename,
      saveAs: true
    });
    return { ok: true };
  } finally {
    if (prepared) {
      try {
        await sendTabMessage(tabId, { type: "FES_RESTORE_CAPTURE" });
      } catch {}
    }
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "FES_CAPTURE") {
    capture(message.tabId, message.windowId)
      .then(sendResponse)
      .catch(error => sendResponse({ ok: false, error: error.message }));
    return true;
  }

});
