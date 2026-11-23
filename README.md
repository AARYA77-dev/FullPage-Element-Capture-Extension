# Full Page Element Screenshot

A Chrome Manifest V3 extension that lets you select multiple independent DOM elements (for example, a navigation sidebar, main panel, and drawer), expands their scrollable content in a temporary capture stage, stitches viewport screenshots, and downloads one PNG.

## Install on Ubuntu (Chrome / Chromium)

1. Extract `full-page-element-screenshot.zip`.
2. Open `chrome://extensions` in Chrome.
3. Turn on **Developer mode** (top-right).
4. Click **Load unpacked**.
5. Select the extracted `full-page-element-screenshot` folder (the folder containing `manifest.json`).
6. Pin the extension from the Extensions puzzle-piece menu if desired.

## Use

1. Open the webpage you want to capture. Normal websites are supported; browser internal pages such as `chrome://extensions`, Chrome Web Store pages, and some PDF viewers are restricted by Chrome.
2. Click the extension icon.
3. Click **Select elements on page**. The popup closes and selection mode starts.
4. Hover to preview an element. Click to add it (green outline). Click it again to remove it.
5. Select as many independent areas as needed. Press `Esc` when finished.
6. Click the extension icon again and choose **Capture selected elements**. The popup shows preparation status and viewport-by-viewport capture progress.
7. Choose where to save the PNG.

The screenshot includes the selected elements only, laid out at their original page coordinates. Unselected page content is hidden in the capture. Scrollable descendants inside selected elements are expanded where their DOM exposes the full content.

## Notes / limitations

- This is a DOM-based capture, not a browser-native full-page screenshot. It copies computed styles and form values, preserves the selected elements' shared page backdrop, then captures the temporary composition in viewport-sized strips.
- Canvas, video, WebGL, cross-origin embedded frames, closed shadow roots, pseudo-elements, complex sticky/fixed descendants, and virtualized lists may not reproduce perfectly. A virtualized list only contains the rows currently rendered in the DOM.
- Very tall or very wide captures can exceed Chrome's canvas memory limits. For best results, capture a few elements at a time.
- The page is temporarily modified during capture and restored afterward. If capture is interrupted or the tab is closed, reload the page to restore it.
- The extension requests `activeTab`, `scripting`, `tabs`, `downloads`, and `offscreen`. It does not send page content to a server.

## Troubleshooting

- If selection does not start, refresh the page once after installing the extension, then try again.
- If a website blocks injection or uses a browser-restricted page, Chrome will not allow capture there.
- If the screenshot is blank or clipped, try selecting a higher-level element that contains the desired region, or capture fewer areas.
- If a site's sidebar uses virtual scrolling, scroll through it first to make the site render more rows; the extension cannot capture rows that are not present in the DOM.
