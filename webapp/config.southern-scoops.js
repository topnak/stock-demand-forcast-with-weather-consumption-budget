/* ==============================================
   Southern Scoops — Runtime Configuration (BACKUP)
   ==============================================
   Original environment: rg-southern-scoops-demo
   To activate: Copy-Item webapp\config.southern-scoops.js webapp\config.js -Force
   ============================================== */
(function () {
  'use strict';
  window.__APP_CONFIG = {
    CHAT_API_URL:   'https://func-wesonline-api.azurewebsites.net/api/chat',
    CONFIG_API_URL: 'https://func-wesonline-api.azurewebsites.net/api/config'
  };
})();
