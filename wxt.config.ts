import { defineConfig } from 'wxt';

export default defineConfig({
  srcDir: 'src',
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'WhaleRead Buddy',
    description: '读取当前页面内容，与 DeepSeek 对话深入学习，支持划词批注与主动搜索。',
    default_locale: 'zh_CN',
    permissions: ['sidePanel', 'storage', 'activeTab', 'scripting', 'tabs', 'offscreen'],
    host_permissions: ['<all_urls>'],
    action: {
      default_title: '打开 WhaleRead Buddy',
    },
    icons: {
      16: 'icons/icon-16.png',
      32: 'icons/icon-32.png',
      48: 'icons/icon-48.png',
      128: 'icons/icon-128.png',
    },
  },
});
