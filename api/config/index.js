/**
 * Azure Function: GET /api/config
 * Returns client-safe runtime configuration.
 * Keys are stored in App Settings, not in frontend code.
 */
module.exports = async function (context) {
  context.res = {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=300'
    },
    body: {
      AZURE_MAPS_KEY: process.env.AZURE_MAPS_KEY || '',
      INPUT_BASE:     process.env.INPUT_BASE     || '',
      OUTPUT_BASE:    process.env.OUTPUT_BASE     || ''
    }
  };
};
