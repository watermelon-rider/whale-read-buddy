import { defineConfig } from 'wxt';

// WXT 主配置：manifest、权限、入口都在此声明。
export default defineConfig({
  srcDir: 'src',
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: '__MSG_appName__',
    description: '__MSG_appDesc__',
    default_locale: 'zh_CN',
    permissions: ['sidePanel', 'storage', 'activeTab', 'scripting', 'tabs', 'offscreen'],
    host_permissions: ['<all_urls>'],
    action: {
      default_title: '__MSG_openTitle__',
    },
    icons: {
      16: 'icons/icon-16.png',
      32: 'icons/icon-32.png',
      48: 'icons/icon-48.png',
      128: 'icons/icon-128.png',
    },
  },
});
