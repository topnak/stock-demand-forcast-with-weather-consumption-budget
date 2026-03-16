/* ==============================================
   WesOnline-Demo — Runtime Configuration
   ==============================================
   All secrets are served via the Azure Function at /api/config.
   No keys appear in frontend source code.
   ============================================== */
(function () {
  'use strict';
  window.__APP_CONFIG = {
    CHAT_API_URL:   'https://func-wesonline-api.azurewebsites.net/api/chat',
    CONFIG_API_URL: 'https://func-wesonline-api.azurewebsites.net/api/config'
  };
})();
