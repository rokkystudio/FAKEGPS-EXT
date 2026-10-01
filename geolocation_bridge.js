// Bridges synchronized extension GEO settings into the page MAIN world.
(function()
{
  'use strict';

  const MESSAGE_SOURCE = 'fakegps-extension';
  const MESSAGE_TYPE = 'FAKEGPS_SETTINGS';
  const REQUEST_TYPE = 'FAKEGPS_REQUEST_SETTINGS';
  const DEFAULT_ACCURACY = 100;

  /**
   * Normalizes settings before exposing them to the page MAIN world.
   *
   * @param {Object|null|undefined} settings Stored GEO settings.
   * @returns {{enabled: boolean, latitude: number, longitude: number, accuracy: number}} Public GEO settings.
   */
  function normalizeSettings(settings)
  {
    const source = settings || {};

    return {
      enabled: Boolean(source.enabled),
      latitude: Number(source.latitude),
      longitude: Number(source.longitude),
      accuracy: DEFAULT_ACCURACY
    };
  }

  /**
   * Sends current GEO settings to the page MAIN world.
   *
   * @returns {Promise<void>} Resolves after the settings are loaded and posted.
   */
  async function publishSettings()
  {
    const result = await chrome.storage.sync.get(['geoSettings']);

    window.postMessage({
      source: MESSAGE_SOURCE,
      type: MESSAGE_TYPE,
      payload: normalizeSettings(result.geoSettings)
    }, '*');
  }

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'sync' || !changes.geoSettings) {
      return;
    }

    window.postMessage({
      source: MESSAGE_SOURCE,
      type: MESSAGE_TYPE,
      payload: normalizeSettings(changes.geoSettings.newValue)
    }, '*');
  });

  window.addEventListener('message', (event) => {
    if (event.source !== window || !event.data || event.data.source !== MESSAGE_SOURCE) {
      return;
    }

    if (event.data.type === REQUEST_TYPE) {
      publishSettings().catch(() => {});
    }
  });

  publishSettings().catch(() => {});
})();
