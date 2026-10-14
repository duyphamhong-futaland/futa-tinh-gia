/* FUTA Land — Xoá nhãn AI · service worker
   - Bấm biểu tượng tiện ích → mở trang công cụ
   - Chuột phải vào ảnh → “Xoá nhãn AI khỏi ảnh này” → đưa ảnh vào hàng đợi rồi mở/chuyển sang trang công cụ */
const TOOL = 'tool.html';
const MENU = 'futa-xna-image';

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({ id: MENU, title: 'Xoá nhãn AI khỏi ảnh này', contexts: ['image'] });
});

async function openTool() {
  const url = chrome.runtime.getURL(TOOL);
  const open = await chrome.runtime.getContexts({ contextTypes: ['TAB'], documentUrls: [url] });
  if (open.length) {
    await chrome.tabs.update(open[0].tabId, { active: true });
    await chrome.windows.update(open[0].windowId, { focused: true });
  } else {
    await chrome.tabs.create({ url });
  }
}

// Hàng đợi nằm trong chrome.storage.session — trang công cụ (js/ext.js) lấy ra và tải ảnh
async function handleImage(srcUrl, pageUrl) {
  const { queue = [] } = await chrome.storage.session.get('queue');
  queue.push({ url: srcUrl, page: pageUrl || '', t: Date.now() });
  await chrome.storage.session.set({ queue });
  await openTool();
}
self.handleImage = handleImage;

chrome.contextMenus.onClicked.addListener(info => {
  if (info.menuItemId === MENU && info.srcUrl) handleImage(info.srcUrl, info.pageUrl);
});
chrome.action.onClicked.addListener(() => { openTool(); });
