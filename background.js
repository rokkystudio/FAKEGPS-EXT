// Applies the selected GEO location to Google request metadata.
const DEFAULT_ACCURACY = 100;
const DEFAULT_SETTINGS = {
  enabled: false,
  latitude: 40.758,
  longitude: -73.9855,
  location: 'Times Square, New York, NY, USA',
  countryCode: 'US',
  accuracy: DEFAULT_ACCURACY
};

const GOOGLE_RULE_IDS = [1, 2, 3];

/**
 * Validates latitude and longitude values.
 *
 * @param {number} latitude Latitude in decimal degrees.
 * @param {number} longitude Longitude in decimal degrees.
 * @returns {boolean} true when both coordinates are finite and inside geographic bounds.
 */
function isValidCoordinates(latitude, longitude)
{
  return Number.isFinite(latitude)
    && Number.isFinite(longitude)
    && latitude >= -90
    && latitude <= 90
    && longitude >= -180
    && longitude <= 180;
}

/**
 * Normalizes persisted GEO settings and keeps one internal accuracy value.
 *
 * @param {Object|null|undefined} settings Stored GEO settings.
 * @returns {{enabled: boolean, latitude: number, longitude: number, location: string, countryCode: string, accuracy: number}} Normalized settings.
 */
function normalizeSettings(settings)
{
  const source = settings || DEFAULT_SETTINGS;
  const latitude = Number(source.latitude);
  const longitude = Number(source.longitude);

  return {
    enabled: Boolean(source.enabled),
    latitude: isValidCoordinates(latitude, longitude) ? latitude : DEFAULT_SETTINGS.latitude,
    longitude: isValidCoordinates(latitude, longitude) ? longitude : DEFAULT_SETTINGS.longitude,
    location: typeof source.location === 'string' && source.location.trim()
      ? source.location.trim()
      : DEFAULT_SETTINGS.location,
    countryCode: typeof source.countryCode === 'string' ? source.countryCode.trim().toUpperCase() : '',
    accuracy: DEFAULT_ACCURACY
  };
}

/**
 * Encodes Google x-geo metadata for the selected location.
 *
 * @param {number} latitude Latitude in decimal degrees.
 * @param {number} longitude Longitude in decimal degrees.
 * @param {number} accuracy Accuracy radius in meters.
 * @returns {string} Encoded x-geo header value.
 */
function createXgeoHeader(latitude, longitude, accuracy)
{
  const latitudeE7 = Math.floor(latitude * 1e7);
  const longitudeE7 = Math.floor(longitude * 1e7);
  const payload = `role: CURRENT_LOCATION\nproducer: DEVICE_LOCATION\nradius: ${accuracy}\nlatlng <\n  latitude_e7: ${latitudeE7}\n  longitude_e7: ${longitudeE7}\n>`;

  return 'a ' + btoa(payload);
}

/**
 * Creates session rules that attach x-geo to Google requests.
 *
 * @param {string} headerValue Encoded x-geo header value.
 * @returns {chrome.declarativeNetRequest.Rule[]} Session rules.
 */
function createGoogleRules(headerValue)
{
  const resourceTypes = ['main_frame', 'sub_frame', 'xmlhttprequest'];

  return [
    {
      id: 1,
      priority: 1,
      action: {
        type: 'modifyHeaders',
        requestHeaders: [{
          header: 'x-geo',
          operation: 'set',
          value: headerValue
        }]
      },
      condition: {
        urlFilter: '*://*.google.com/*',
        resourceTypes
      }
    },
    {
      id: 2,
      priority: 1,
      action: {
        type: 'modifyHeaders',
        requestHeaders: [{
          header: 'x-geo',
          operation: 'set',
          value: headerValue
        }]
      },
      condition: {
        urlFilter: '*://google.com/*',
        resourceTypes
      }
    },
    {
      id: 3,
      priority: 1,
      action: {
        type: 'modifyHeaders',
        requestHeaders: [{
          header: 'x-geo',
          operation: 'set',
          value: headerValue
        }]
      },
      condition: {
        urlFilter: '*://www.google.com/*',
        resourceTypes
      }
    }
  ];
}

/**
 * Applies or removes Google x-geo request rules for the current location.
 *
 * Browser Geolocation API spoofing for all sites is handled by the page content scripts.
 *
 * @param {Object} settings GEO settings.
 * @returns {Promise<void>} Resolves after session rules are updated.
 */
async function applyGoogleLocation(settings)
{
  const normalized = normalizeSettings(settings);
  const addRules = normalized.enabled
    ? createGoogleRules(createXgeoHeader(normalized.latitude, normalized.longitude, normalized.accuracy))
    : [];

  await chrome.declarativeNetRequest.updateSessionRules({
    removeRuleIds: GOOGLE_RULE_IDS,
    addRules
  });

  chrome.action.setIcon({
    path: normalized.enabled ? '/img/enabled.png' : '/img/disabled.png'
  });

  chrome.action.setTitle({
    title: normalized.enabled
      ? normalized.location
      : 'Location spoofing disabled'
  });
}

/**
 * Initializes persisted GEO state and applies Google request rules.
 *
 * @returns {Promise<void>} Resolves after initialization completes.
 */
async function initializeExtension()
{
  const result = await chrome.storage.sync.get(['geoSettings', 'savedLocations']);
  const settings = normalizeSettings(result.geoSettings);

  if (!result.geoSettings) {
    await chrome.storage.sync.set({
      geoSettings: settings
    });
  }

  if (!Array.isArray(result.savedLocations)) {
    await chrome.storage.sync.set({
      savedLocations: []
    });
  }

  await applyGoogleLocation(settings);
}

chrome.runtime.onInstalled.addListener(() => {
  initializeExtension().catch(() => {});
});

chrome.runtime.onStartup.addListener(() => {
  initializeExtension().catch(() => {});
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== 'sync' || !changes.geoSettings) {
    return;
  }

  applyGoogleLocation(changes.geoSettings.newValue).catch(() => {});
});

initializeExtension().catch(() => {});
