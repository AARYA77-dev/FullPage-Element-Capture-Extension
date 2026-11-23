let canvas = null;
let ctx = null;
let scale = 1;
let cssWidth = 0;
let cssHeight = 0;

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "FES_STITCH_INIT") {
    try {
      cssWidth = message.width;
      cssHeight = message.height;
      canvas = document.createElement("canvas");
      // captureVisibleTab images are device-pixel sized. Derive scale from the
      // first frame later; start with a conservative CSS pixel canvas.
      scale = message.devicePixelRatio || 1;
      window.__fesViewportWidth = message.viewportWidth;
      canvas.width = Math.ceil(cssWidth * scale);
      canvas.height = Math.ceil(cssHeight * scale);
      ctx = canvas.getContext("2d", { alpha: false });
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      sendResponse({ ok: true });
    } catch (error) {
      sendResponse({ ok: false, error: error.message });
    }
    return true;
  }

  if (message.type === "FES_STITCH_FRAME") {
    (async () => {
      try {
        const image = await createImageBitmap(await (await fetch(message.dataUrl)).blob());
        const actualScale = image.width / Math.max(1, window.__fesViewportWidth || image.width);
        // Determine scale using the screenshot's natural size and the CSS viewport
        // width recorded from the first frame. The first frame establishes it.
        if (!window.__fesScale) {
          window.__fesScale = actualScale;
          scale = actualScale;
          const newWidth = Math.ceil(cssWidth * scale);
          const newHeight = Math.ceil(cssHeight * scale);
          if (canvas.width !== newWidth || canvas.height !== newHeight) {
            const old = canvas;
            const replacement = document.createElement("canvas");
            replacement.width = newWidth;
            replacement.height = newHeight;
            const replacementCtx = replacement.getContext("2d", { alpha: false });
            replacementCtx.fillStyle = "#ffffff";
            replacementCtx.fillRect(0, 0, newWidth, newHeight);
            replacementCtx.drawImage(old, 0, 0, Math.min(old.width, newWidth), Math.min(old.height, newHeight));
            canvas = replacement;
            ctx = replacementCtx;
          }
        }

        const sourceY = 0;
        const destinationY = Math.round(message.y * scale);
        const remainingCss = Math.max(0, cssHeight - message.y);
        const visibleCssHeight = Math.min(
          remainingCss,
          image.height / scale
        );
        const drawHeight = Math.min(image.height, Math.ceil(visibleCssHeight * scale));
        ctx.drawImage(
          image,
          0, sourceY, image.width, drawHeight,
          0, destinationY, image.width, drawHeight
        );
        image.close();
        sendResponse({ ok: true });
      } catch (error) {
        sendResponse({ ok: false, error: error.message });
      }
    })();
    return true;
  }

  if (message.type === "FES_STITCH_FINISH") {
    try {
      const dataUrl = canvas.toDataURL("image/png");
      canvas = null;
      ctx = null;
      window.__fesScale = null;
      sendResponse({ ok: true, dataUrl });
    } catch (error) {
      sendResponse({ ok: false, error: error.message });
    }
    return true;
  }
});