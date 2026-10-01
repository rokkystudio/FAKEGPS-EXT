// Overrides the page Geolocation API with the location selected in the extension.
(function()
{
  'use strict';

  const MESSAGE_SOURCE = 'fakegps-extension';
  const MESSAGE_TYPE = 'FAKEGPS_SETTINGS';
  const REQUEST_TYPE = 'FAKEGPS_REQUEST_SETTINGS';

  let currentSettings = {
    enabled: false,
    latitude: 0,
    longitude: 0,
    accuracy: 100
  };
  let nextWatchId = 1;
  const activeWatches = new Map();

  const nativeGeolocation = navigator.geolocation;
  const nativeGetCurrentPosition = nativeGeolocation && nativeGeolocation.getCurrentPosition
    ? nativeGeolocation.getCurrentPosition.bind(nativeGeolocation)
    : null;
  const nativeWatchPosition = nativeGeolocation && nativeGeolocation.watchPosition
    ? nativeGeolocation.watchPosition.bind(nativeGeolocation)
    : null;
  const nativeClearWatch = nativeGeolocation && nativeGeolocation.clearWatch
    ? nativeGeolocation.clearWatch.bind(nativeGeolocation)
    : null;

  /**
   * Validates coordinates received from the extension bridge.
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
   * Creates a GeolocationPosition-compatible object from the active spoofed settings.
   *
   * @returns {Object} Position object compatible with browser geolocation callbacks.
   */
  function createPosition()
  {
    return {
      coords: {
        latitude: currentSettings.latitude,
        longitude: currentSettings.longitude,
        accuracy: currentSettings.accuracy,
        altitude: null,
        altitudeAccuracy: null,
        heading: null,
        speed: null
      },
      timestamp: Date.now()
    };
  }

  /**
   * Delivers the selected location asynchronously to a geolocation success callback.
   *
   * @param {Function} success Success callback supplied by the page.
   * @returns {void}
   */
  function deliverPosition(success)
  {
    if (typeof success !== 'function') {
      return;
    }

    queueMicrotask(() => {
      success(createPosition());
    });
  }

  /**
   * Applies settings received from the isolated extension bridge.
   *
   * @param {Object} settings GEO settings.
   * @returns {void}
   */
  function applySettings(settings)
  {
    if (!settings) {
      return;
    }

    const latitude = Number(settings.latitude);
    const longitude = Number(settings.longitude);

    currentSettings = {
      enabled: Boolean(settings.enabled) && isValidCoordinates(latitude, longitude),
      latitude,
      longitude,
      accuracy: Number.isFinite(Number(settings.accuracy))
        ? Math.max(1, Number(settings.accuracy))
        : 100
    };

    if (!currentSettings.enabled) {
      return;
    }

    activeWatches.forEach((watch) => {
      deliverPosition(watch.success);
    });
  }

  /**
   * Routes getCurrentPosition to the selected spoofed location or to the native implementation.
   *
   * @param {Function} success Success callback.
   * @param {Function} error Error callback.
   * @param {Object} options Geolocation options.
   * @returns {void}
   */
  function getCurrentPosition(success, error, options)
  {
    if (currentSettings.enabled) {
      deliverPosition(success);
      return;
    }

    if (nativeGetCurrentPosition) {
      nativeGetCurrentPosition(success, error, options);
    }
  }

  /**
   * Registers a location watcher that follows extension location changes.
   *
   * @param {Function} success Success callback.
   * @param {Function} error Error callback.
   * @param {Object} options Geolocation options.
   * @returns {number} Watch identifier.
   */
  function watchPosition(success, error, options)
  {
    if (!currentSettings.enabled && nativeWatchPosition) {
      return nativeWatchPosition(success, error, options);
    }

    const watchId = nextWatchId++;
    activeWatches.set(watchId, {
      success,
      error,
      options
    });

    if (currentSettings.enabled) {
      deliverPosition(success);
    }

    return watchId;
  }

  /**
   * Clears a spoofed or native geolocation watcher.
   *
   * @param {number} watchId Watch identifier.
   * @returns {void}
   */
  function clearWatch(watchId)
  {
    if (activeWatches.delete(watchId)) {
      return;
    }

    if (nativeClearWatch) {
      nativeClearWatch(watchId);
    }
  }

  if (nativeGeolocation) {
    try {
      Object.defineProperty(nativeGeolocation, 'getCurrentPosition', {
        configurable: true,
        value: getCurrentPosition
      });

      Object.defineProperty(nativeGeolocation, 'watchPosition', {
        configurable: true,
        value: watchPosition
      });

      Object.defineProperty(nativeGeolocation, 'clearWatch', {
        configurable: true,
        value: clearWatch
      });
    } catch (_) {
      nativeGeolocation.getCurrentPosition = getCurrentPosition;
      nativeGeolocation.watchPosition = watchPosition;
      nativeGeolocation.clearWatch = clearWatch;
    }
  }

  window.addEventListener('message', (event) => {
    if (event.source !== window || !event.data || event.data.source !== MESSAGE_SOURCE) {
      return;
    }

    if (event.data.type === MESSAGE_TYPE) {
      applySettings(event.data.payload);
    }
  });

  window.postMessage({
    source: MESSAGE_SOURCE,
    type: REQUEST_TYPE
  }, '*');
})();
