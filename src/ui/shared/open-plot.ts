/** 把公式源码投递到查看器的 plot 模式（新标签页）。 */
export async function openPlotViewer(tex: string): Promise<void> {
  const key = `plot:${crypto.randomUUID()}`;
  await chrome.storage.session.set({ [key]: tex });
  await chrome.tabs.create({
    url: chrome.runtime.getURL(`viewer.html?mode=plot&key=${key}`),
  });
}
