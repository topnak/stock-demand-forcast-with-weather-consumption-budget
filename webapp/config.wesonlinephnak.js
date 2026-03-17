/* ==============================================
   WesOnline PHNAK — Runtime Configuration
   ==============================================
   Resource Group: wesonlinephnak
   To activate: Copy-Item webapp\config.wesonlinephnak.js webapp\config.js -Force
   ============================================== */
(function () {
  'use strict';
  window.__APP_CONFIG = {
    CHAT_API_URL:   'https://func-wesonlinephnak.azurewebsites.net/api/chat',
    CONFIG_API_URL: 'https://func-wesonlinephnak.azurewebsites.net/api/config'
  };
})();
