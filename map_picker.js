// Provides the standalone Fake GPS map picker window.
document.addEventListener('DOMContentLoaded', function()
{
  const DEFAULT_SETTINGS = {
    enabled: false,
    latitude: 40.758,
    longitude: -73.9855,
    location: 'Times Square, New York, NY, USA',
    countryCode: 'US',
    accuracy: 100
  };
  const TILE_SIZE = 256;
  const MIN_ZOOM = 2;
  const MAX_ZOOM = 18;

  const searchInput = document.getElementById('search-input');
  const searchButton = document.getElementById('search-button');
  const latitudeInput = document.getElementById('latitude-input');
  const longitudeInput = document.getElementById('longitude-input');
  const coordinatesButton = document.getElementById('coordinates-button');
  const mapElement = document.getElementById('map');
  const mapContent = document.getElementById('map-content');
  const mapTiles = document.getElementById('map-tiles');
  const mapMarker = document.getElementById('map-marker');
  const attribution = document.getElementById('attribution');
  const actionsHint = document.getElementById('actions-hint');
  const cancelButton = document.getElementById('cancel-button');
  const applyButton = document.getElementById('apply-button');

  let uiLanguage = navigator.language.toLowerCase().startsWith('ru') ? 'ru' : 'en';
  let uiTheme = 'light';
  let messages = {};
  let currentSettings = { ...DEFAULT_SETTINGS };
  let savedLocations = [];
  let editingLocationId = null;
  let mapSelection = null;
  let mapCenter = {
    latitude: DEFAULT_SETTINGS.latitude,
    longitude: DEFAULT_SETTINGS.longitude
  };
  let mapZoom = 12;
  let visualZoom = 12;
  let targetZoom = 12;
  let dragState = null;
  let reverseGeocodeRevision = 0;
  let zoomAnimationFrame = null;
  let zoomSettleTimer = null;
  let zoomLastFrameTime = 0;
  let zoomAnchor = null;

  /**
   * Loads one extension locale file.
   *
   * @param {'en'|'ru'} language UI language.
   * @returns {Promise<Object<string,string>>} Localized message map.
   */
  async function loadMessages(language)
  {
    const response = await fetch(chrome.runtime.getURL(`_locales/${language}/messages.json`));
    const json = await response.json();

    return Object.fromEntries(
      Object.entries(json).map(([key, value]) => [key, value.message])
    );
  }

  /**
   * Returns one localized UI string.
   *
   * @param {string} key Locale key.
   * @returns {string} Localized string or the key when missing.
   */
  function t(key)
  {
    return messages[key] || key;
  }

  /**
   * Validates decimal geographic coordinates.
   *
   * @param {number} latitude Latitude in decimal degrees.
   * @param {number} longitude Longitude in decimal degrees.
   * @returns {boolean} true when coordinates are finite and inside geographic bounds.
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
   * Normalizes a two-letter ISO country code.
   *
   * @param {string|null|undefined} countryCode Country code.
   * @returns {string} Upper-case country code or an empty string.
   */
  function normalizeCountryCode(countryCode)
  {
    const normalized = String(countryCode || '').trim().toUpperCase();
    return /^[A-Z]{2}$/.test(normalized) ? normalized : '';
  }

  /**
   * Formats one coordinate for display.
   *
   * @param {number} value Coordinate value.
   * @returns {string} Formatted coordinate.
   */
  function formatCoordinate(value)
  {
    return Number(value).toFixed(7).replace(/0+$/, '').replace(/\.$/, '');
  }

  /**
   * Normalizes persisted GEO settings.
   *
   * @param {Object|null|undefined} settings Stored settings.
   * @returns {Object} Valid GEO settings.
   */
  function normalizeSettings(settings)
  {
    const source = settings && typeof settings === 'object' ? settings : {};
    const latitude = Number(source.latitude);
    const longitude = Number(source.longitude);
    const valid = isValidCoordinates(latitude, longitude);

    return {
      enabled: Boolean(source.enabled),
      latitude: valid ? latitude : DEFAULT_SETTINGS.latitude,
      longitude: valid ? longitude : DEFAULT_SETTINGS.longitude,
      location: typeof source.location === 'string' && source.location.trim()
        ? source.location.trim()
        : DEFAULT_SETTINGS.location,
      countryCode: normalizeCountryCode(source.countryCode),
      accuracy: 100
    };
  }

  /**
   * Normalizes saved locations.
   *
   * @param {Array<Object>|null|undefined} locations Stored locations.
   * @returns {Array<Object>} Valid saved locations.
   */
  function normalizeSavedLocations(locations)
  {
    if (!Array.isArray(locations)) {
      return [];
    }

    return locations
      .map((location) => {
        const latitude = Number(location.latitude);
        const longitude = Number(location.longitude);

        if (!isValidCoordinates(latitude, longitude)) {
          return null;
        }

        return {
          id: typeof location.id === 'string' && location.id ? location.id : crypto.randomUUID(),
          name: typeof location.name === 'string' && location.name.trim()
            ? location.name.trim()
            : `${formatCoordinate(latitude)}, ${formatCoordinate(longitude)}`,
          countryCode: normalizeCountryCode(location.countryCode),
          latitude,
          longitude
        };
      })
      .filter(Boolean);
  }

  /**
   * Builds a compact display name from a reverse-geocoding response.
   *
   * @param {Object} result Nominatim reverse-geocoding result.
   * @param {number} latitude Latitude in decimal degrees.
   * @param {number} longitude Longitude in decimal degrees.
   * @returns {string} Compact display name.
   */
  function buildLocationName(result, latitude, longitude)
  {
    const address = result && result.address ? result.address : {};
    const locality = address.city
      || address.town
      || address.village
      || address.municipality
      || address.hamlet
      || address.county
      || '';
    const region = address.state || address.region || '';
    const country = address.country || '';
    const parts = [];

    if (locality) {
      parts.push(locality);
    }
    if (region && region !== locality) {
      parts.push(region);
    }
    if (country && country !== region) {
      parts.push(country);
    }

    if (parts.length > 0) {
      return parts.join(', ');
    }

    if (result && typeof result.display_name === 'string' && result.display_name.trim()) {
      return result.display_name.trim();
    }

    return `${formatCoordinate(latitude)}, ${formatCoordinate(longitude)}`;
  }

  /**
   * Resolves a coordinate pair to a display name and ISO country code.
   *
   * @param {number} latitude Latitude in decimal degrees.
   * @param {number} longitude Longitude in decimal degrees.
   * @returns {Promise<{name: string, countryCode: string}>} Reverse-geocoded location metadata.
   */
  async function reverseGeocode(latitude, longitude)
  {
    const url = new URL('https://nominatim.openstreetmap.org/reverse');
    url.searchParams.set('format', 'jsonv2');
    url.searchParams.set('lat', String(latitude));
    url.searchParams.set('lon', String(longitude));
    url.searchParams.set('zoom', '10');
    url.searchParams.set('addressdetails', '1');
    url.searchParams.set('accept-language', uiLanguage);

    const response = await fetch(url.toString(), {
      headers: {
        'Accept': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`Reverse geocoding failed: ${response.status}`);
    }

    const result = await response.json();

    return {
      name: buildLocationName(result, latitude, longitude),
      countryCode: normalizeCountryCode(result?.address?.country_code)
    };
  }

  /**
   * Searches for a location by name using Nominatim.
   *
   * @param {string} query Search text.
   * @returns {Promise<{name: string, countryCode: string, latitude: number, longitude: number}|null>} First matching location.
   */
  async function searchLocation(query)
  {
    const url = new URL('https://nominatim.openstreetmap.org/search');
    url.searchParams.set('format', 'jsonv2');
    url.searchParams.set('q', query);
    url.searchParams.set('limit', '1');
    url.searchParams.set('addressdetails', '1');
    url.searchParams.set('accept-language', uiLanguage);

    const response = await fetch(url.toString(), {
      headers: {
        'Accept': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`Location search failed: ${response.status}`);
    }

    const results = await response.json();

    if (!Array.isArray(results) || results.length === 0) {
      return null;
    }

    const result = results[0];
    const latitude = Number(result.lat);
    const longitude = Number(result.lon);

    if (!isValidCoordinates(latitude, longitude)) {
      return null;
    }

    return {
      name: buildLocationName(result, latitude, longitude),
      countryCode: normalizeCountryCode(result?.address?.country_code),
      latitude,
      longitude
    };
  }

  /**
   * Updates manual coordinate fields from one selected or viewed point.
   *
   * @param {number} latitude Latitude in decimal degrees.
   * @param {number} longitude Longitude in decimal degrees.
   * @returns {void}
   */
  function renderCoordinates(latitude, longitude)
  {
    latitudeInput.value = formatCoordinate(latitude);
    longitudeInput.value = formatCoordinate(longitude);
  }

  /**
   * Selects the first search result and centers the map on it.
   *
   * @returns {Promise<void>} Resolves after the search completes.
   */
  async function runSearch()
  {
    const query = searchInput.value.trim();

    if (!query) {
      return;
    }

    searchButton.disabled = true;

    try {
      const result = await searchLocation(query);

      if (!result) {
        return;
      }

      mapCenter = {
        latitude: result.latitude,
        longitude: result.longitude
      };
      mapZoom = 14;
      visualZoom = mapZoom;
      targetZoom = mapZoom;
      resetZoomAnimation();
      mapSelection = {
        latitude: result.latitude,
        longitude: result.longitude,
        name: result.name,
        countryCode: result.countryCode
      };
      reverseGeocodeRevision += 1;
      renderCoordinates(result.latitude, result.longitude);
      applyButton.disabled = false;
      renderMap();
    } finally {
      searchButton.disabled = false;
    }
  }

  /**
   * Selects coordinates entered manually and centers the map on them.
   *
   * @returns {Promise<void>} Resolves after reverse geocoding completes.
   */
  async function useManualCoordinates()
  {
    const latitude = Number(latitudeInput.value);
    const longitude = Number(longitudeInput.value);

    if (!isValidCoordinates(latitude, longitude)) {
      return;
    }

    mapCenter = {
      latitude,
      longitude
    };
    mapZoom = Math.max(mapZoom, 14);
    visualZoom = mapZoom;
    targetZoom = mapZoom;
    resetZoomAnimation();
    await selectMapPoint(latitude, longitude);
  }

  /**
   * Applies the saved theme and localized labels to the picker.
   *
   * @returns {void}
   */
  function renderChrome()
  {
    document.documentElement.lang = uiLanguage;
    document.documentElement.dataset.theme = uiTheme;
    document.title = editingLocationId ? t('editLocationTitle') : t('addLocationTitle');
    searchInput.placeholder = t('searchLocationPlaceholder');
    searchButton.textContent = t('search');
    latitudeInput.placeholder = t('latitude');
    longitudeInput.placeholder = t('longitude');
    coordinatesButton.textContent = t('goToCoordinates');
    actionsHint.textContent = t('clickMapToSelect');
    attribution.textContent = t('osmContributors');
    cancelButton.textContent = t('cancel');
    applyButton.textContent = t('apply');
  }

  /**
   * Converts geographic coordinates to world-pixel coordinates.
   *
   * @param {number} latitude Latitude in decimal degrees.
   * @param {number} longitude Longitude in decimal degrees.
   * @param {number} zoom Slippy-map zoom.
   * @returns {{x: number, y: number}} World-pixel coordinates.
   */
  function locationToWorld(latitude, longitude, zoom)
  {
    const scale = TILE_SIZE * Math.pow(2, zoom);
    const clampedLatitude = Math.max(-85.05112878, Math.min(85.05112878, latitude));
    const sinLatitude = Math.sin(clampedLatitude * Math.PI / 180);

    return {
      x: (longitude + 180) / 360 * scale,
      y: (0.5 - Math.log((1 + sinLatitude) / (1 - sinLatitude)) / (4 * Math.PI)) * scale
    };
  }

  /**
   * Converts world-pixel coordinates to geographic coordinates.
   *
   * @param {number} x World-pixel X.
   * @param {number} y World-pixel Y.
   * @param {number} zoom Slippy-map zoom.
   * @returns {{latitude: number, longitude: number}} Geographic coordinates.
   */
  function worldToLocation(x, y, zoom)
  {
    const scale = TILE_SIZE * Math.pow(2, zoom);
    const longitude = x / scale * 360 - 180;
    const n = Math.PI - 2 * Math.PI * y / scale;
    const latitude = 180 / Math.PI * Math.atan(Math.sinh(n));

    return {
      latitude,
      longitude
    };
  }

  /**
   * Draws OpenStreetMap tiles and the selected marker.
   *
   * @returns {void}
   */
  function renderMap()
  {
    if (!mapElement.clientWidth || !mapElement.clientHeight) {
      return;
    }

    const width = mapElement.clientWidth;
    const height = mapElement.clientHeight;
    const centerWorld = locationToWorld(mapCenter.latitude, mapCenter.longitude, mapZoom);
    const leftWorld = centerWorld.x - width / 2;
    const topWorld = centerWorld.y - height / 2;
    const firstTileX = Math.floor(leftWorld / TILE_SIZE);
    const firstTileY = Math.floor(topWorld / TILE_SIZE);
    const lastTileX = Math.floor((leftWorld + width) / TILE_SIZE);
    const lastTileY = Math.floor((topWorld + height) / TILE_SIZE);
    const tileCount = Math.pow(2, mapZoom);

    mapTiles.innerHTML = '';

    for (let tileY = firstTileY; tileY <= lastTileY; tileY++) {
      if (tileY < 0 || tileY >= tileCount) {
        continue;
      }

      for (let tileX = firstTileX; tileX <= lastTileX; tileX++) {
        const wrappedTileX = ((tileX % tileCount) + tileCount) % tileCount;
        const tile = document.createElement('img');
        tile.className = 'map-tile';
        tile.alt = '';
        tile.draggable = false;
        const subdomain = ['a', 'b', 'c'][Math.abs(tileX + tileY) % 3];
        tile.src = `https://${subdomain}.tile.openstreetmap.org/${mapZoom}/${wrappedTileX}/${tileY}.png`;
        tile.style.left = `${tileX * TILE_SIZE - leftWorld}px`;
        tile.style.top = `${tileY * TILE_SIZE - topWorld}px`;
        mapTiles.appendChild(tile);
      }
    }

    if (!mapSelection) {
      mapMarker.classList.remove('visible');
      return;
    }

    const selectedWorld = locationToWorld(mapSelection.latitude, mapSelection.longitude, mapZoom);
    mapMarker.style.left = `${selectedWorld.x - leftWorld}px`;
    mapMarker.style.top = `${selectedWorld.y - topWorld}px`;
    mapMarker.classList.add('visible');
  }

  /**
   * Converts a wheel event to floating map-zoom units.
   *
   * Mouse-wheel detents are normalized to roughly one map level while high-resolution
   * touchpad deltas remain fractional and accumulate naturally across events.
   *
   * @param {WheelEvent} event Wheel input event.
   * @param {DOMRect} rect Current map bounds.
   * @returns {number} Signed zoom delta where positive values zoom in.
   */
  function wheelEventToZoomDelta(event, rect)
  {
    if (event.deltaY === 0) {
      return 0;
    }

    if (event.deltaMode === WheelEvent.DOM_DELTA_PAGE) {
      return -Math.sign(event.deltaY);
    }

    if (event.deltaMode === WheelEvent.DOM_DELTA_LINE) {
      return -event.deltaY / 3;
    }

    const absoluteDelta = Math.abs(event.deltaY);

    if (absoluteDelta >= 40) {
      return -event.deltaY / 100;
    }

    return -event.deltaY / 120;
  }

  /**
   * Returns the map center that keeps one geographic point under one screen coordinate.
   *
   * @param {{latitude: number, longitude: number}} anchorLocation Geographic point under the cursor.
   * @param {number} anchorX Cursor X inside the map.
   * @param {number} anchorY Cursor Y inside the map.
   * @param {number} zoom Integer tile zoom.
   * @returns {{latitude: number, longitude: number}} Map center.
   */
  function centerForAnchor(anchorLocation, anchorX, anchorY, zoom)
  {
    const anchorWorld = locationToWorld(anchorLocation.latitude, anchorLocation.longitude, zoom);
    const centerWorld = {
      x: anchorWorld.x - (anchorX - mapElement.clientWidth / 2),
      y: anchorWorld.y - (anchorY - mapElement.clientHeight / 2)
    };

    return worldToLocation(centerWorld.x, centerWorld.y, zoom);
  }

  /**
   * Applies the current fractional zoom as a transform over the current integer tile level.
   *
   * @returns {void}
   */
  function applyZoomTransform()
  {
    const scale = Math.pow(2, visualZoom - mapZoom);

    if (!zoomAnchor || Math.abs(scale - 1) < 0.0005) {
      mapContent.style.transformOrigin = 'center center';
      mapContent.style.transform = 'scale(1)';
      return;
    }

    mapContent.style.transformOrigin = `${zoomAnchor.x}px ${zoomAnchor.y}px`;
    mapContent.style.transform = `scale(${scale})`;
  }

  /**
   * Rebases the raster tile layer when fractional zoom crosses half of the next integer level.
   *
   * @returns {void}
   */
  function rebaseZoomTiles()
  {
    if (!zoomAnchor) {
      return;
    }

    let nextMapZoom = mapZoom;

    while (visualZoom - nextMapZoom >= 0.5 && nextMapZoom < MAX_ZOOM) {
      nextMapZoom += 1;
    }

    while (visualZoom - nextMapZoom <= -0.5 && nextMapZoom > MIN_ZOOM) {
      nextMapZoom -= 1;
    }

    if (nextMapZoom === mapZoom) {
      return;
    }

    mapZoom = nextMapZoom;
    mapCenter = centerForAnchor(
      zoomAnchor.location,
      zoomAnchor.x,
      zoomAnchor.y,
      mapZoom
    );
    renderMap();
  }

  /**
   * Advances continuous wheel zoom toward its accumulated target.
   *
   * @param {number} timestamp requestAnimationFrame timestamp.
   * @returns {void}
   */
  function animateZoom(timestamp)
  {
    if (!zoomAnchor) {
      zoomAnimationFrame = null;
      zoomLastFrameTime = 0;
      return;
    }

    const elapsed = zoomLastFrameTime ? Math.min(50, timestamp - zoomLastFrameTime) : 16;
    zoomLastFrameTime = timestamp;
    const easing = 1 - Math.exp(-elapsed / 65);
    const difference = targetZoom - visualZoom;

    visualZoom += difference * easing;

    if (Math.abs(difference) < 0.001) {
      visualZoom = targetZoom;
    }

    rebaseZoomTiles();
    applyZoomTransform();

    if (Math.abs(targetZoom - visualZoom) >= 0.001) {
      zoomAnimationFrame = requestAnimationFrame(animateZoom);
      return;
    }

    zoomAnimationFrame = null;
    zoomLastFrameTime = 0;

    if (Math.abs(visualZoom - mapZoom) < 0.001) {
      visualZoom = mapZoom;
      targetZoom = mapZoom;
      zoomAnchor = null;
      applyZoomTransform();
    }
  }

  /**
   * Starts continuous wheel zoom animation when it is not already running.
   *
   * @returns {void}
   */
  function startZoomAnimation()
  {
    if (zoomAnimationFrame === null) {
      zoomAnimationFrame = requestAnimationFrame(animateZoom);
    }
  }

  /**
   * Finishes any fractional zoom immediately at the current integer tile level.
   *
   * @returns {void}
   */
  function resetZoomAnimation()
  {
    if (zoomAnimationFrame !== null) {
      cancelAnimationFrame(zoomAnimationFrame);
      zoomAnimationFrame = null;
    }

    clearTimeout(zoomSettleTimer);
    zoomSettleTimer = null;
    zoomLastFrameTime = 0;
    visualZoom = mapZoom;
    targetZoom = mapZoom;
    zoomAnchor = null;
    mapContent.style.transformOrigin = 'center center';
    mapContent.style.transform = 'scale(1)';
  }

  /**
   * Selects a map point and resolves its display metadata.
   *
   * @param {number} latitude Latitude in decimal degrees.
   * @param {number} longitude Longitude in decimal degrees.
   * @returns {Promise<void>} Resolves after reverse geocoding completes or falls back to coordinates.
   */
  async function selectMapPoint(latitude, longitude)
  {
    const revision = ++reverseGeocodeRevision;

    mapSelection = {
      latitude,
      longitude,
      name: `${formatCoordinate(latitude)}, ${formatCoordinate(longitude)}`,
      countryCode: ''
    };

    applyButton.disabled = true;
    renderCoordinates(latitude, longitude);
    renderMap();

    try {
      const metadata = await reverseGeocode(latitude, longitude);

      if (revision !== reverseGeocodeRevision || !mapSelection) {
        return;
      }

      mapSelection.name = metadata.name;
      mapSelection.countryCode = metadata.countryCode;
    } catch (_) {
      if (revision !== reverseGeocodeRevision || !mapSelection) {
        return;
      }
    }

    applyButton.disabled = false;
  }

  /**
   * Stores the selected point as a new or edited location, activates it and closes the picker.
   *
   * @returns {Promise<void>} Resolves after synchronized storage is updated.
   */
  async function applySelection()
  {
    if (!mapSelection) {
      return;
    }

    const location = {
      id: editingLocationId || crypto.randomUUID(),
      name: mapSelection.name,
      countryCode: mapSelection.countryCode,
      latitude: mapSelection.latitude,
      longitude: mapSelection.longitude
    };

    if (editingLocationId) {
      const index = savedLocations.findIndex((item) => item.id === editingLocationId);

      if (index < 0) {
        throw new Error(`Saved location not found: ${editingLocationId}`);
      }

      savedLocations[index] = location;
    } else {
      savedLocations.push(location);
    }

    currentSettings = {
      ...currentSettings,
      enabled: true,
      latitude: location.latitude,
      longitude: location.longitude,
      location: location.name,
      countryCode: location.countryCode,
      accuracy: 100
    };

    await chrome.storage.sync.set({
      savedLocations,
      geoSettings: currentSettings
    });

    window.close();
  }

  /**
   * Loads persisted state and initializes the standalone map picker.
   *
   * @returns {Promise<void>} Resolves after the picker is ready.
   */
  async function initialize()
  {
    const result = await chrome.storage.sync.get(['geoSettings', 'savedLocations', 'uiLanguage', 'uiTheme']);
    uiLanguage = result.uiLanguage === 'ru'
      ? 'ru'
      : result.uiLanguage === 'en'
        ? 'en'
        : (navigator.language.toLowerCase().startsWith('ru') ? 'ru' : 'en');
    uiTheme = result.uiTheme === 'dark' ? 'dark' : 'light';
    messages = await loadMessages(uiLanguage);
    currentSettings = normalizeSettings(result.geoSettings);
    savedLocations = normalizeSavedLocations(result.savedLocations);

    const params = new URLSearchParams(window.location.search);
    editingLocationId = params.get('id');

    const editingLocation = editingLocationId
      ? savedLocations.find((location) => location.id === editingLocationId)
      : null;

    if (editingLocationId && !editingLocation) {
      throw new Error(`Saved location not found: ${editingLocationId}`);
    }

    mapCenter = {
      latitude: editingLocation ? editingLocation.latitude : currentSettings.latitude,
      longitude: editingLocation ? editingLocation.longitude : currentSettings.longitude
    };

    if (editingLocation) {
      mapSelection = {
        latitude: editingLocation.latitude,
        longitude: editingLocation.longitude,
        name: editingLocation.name,
        countryCode: editingLocation.countryCode
      };
      applyButton.disabled = false;
    }

    visualZoom = mapZoom;
    targetZoom = mapZoom;
    renderChrome();
    renderCoordinates(mapCenter.latitude, mapCenter.longitude);
    requestAnimationFrame(renderMap);
  }

  searchButton.addEventListener('click', () => {
    runSearch().catch(() => {});
  });

  searchInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      runSearch().catch(() => {});
    }
  });

  coordinatesButton.addEventListener('click', () => {
    useManualCoordinates().catch(() => {});
  });

  latitudeInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      useManualCoordinates().catch(() => {});
    }
  });

  longitudeInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      useManualCoordinates().catch(() => {});
    }
  });

  cancelButton.addEventListener('click', () => window.close());
  applyButton.addEventListener('click', () => {
    applySelection().catch(() => {});
  });

  mapElement.addEventListener('pointerdown', (event) => {
    resetZoomAnimation();
    mapElement.setPointerCapture(event.pointerId);
    dragState = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      centerWorld: locationToWorld(mapCenter.latitude, mapCenter.longitude, mapZoom),
      moved: false
    };
    mapElement.classList.add('dragging');
  });

  mapElement.addEventListener('pointermove', (event) => {
    if (!dragState || dragState.pointerId !== event.pointerId) {
      return;
    }

    const deltaX = event.clientX - dragState.startX;
    const deltaY = event.clientY - dragState.startY;

    if (Math.abs(deltaX) > 3 || Math.abs(deltaY) > 3) {
      dragState.moved = true;
    }

    mapCenter = worldToLocation(
      dragState.centerWorld.x - deltaX,
      dragState.centerWorld.y - deltaY,
      mapZoom
    );

    renderMap();
  });

  mapElement.addEventListener('pointerup', (event) => {
    if (!dragState || dragState.pointerId !== event.pointerId) {
      return;
    }

    const finishedDrag = dragState;
    dragState = null;
    mapElement.classList.remove('dragging');

    if (finishedDrag.moved) {
      return;
    }

    const rect = mapElement.getBoundingClientRect();
    const centerWorld = locationToWorld(mapCenter.latitude, mapCenter.longitude, mapZoom);
    const pointWorldX = centerWorld.x + (event.clientX - rect.left - rect.width / 2);
    const pointWorldY = centerWorld.y + (event.clientY - rect.top - rect.height / 2);
    const selected = worldToLocation(pointWorldX, pointWorldY, mapZoom);

    selectMapPoint(selected.latitude, selected.longitude).catch(() => {});
  });

  mapElement.addEventListener('pointercancel', () => {
    dragState = null;
    mapElement.classList.remove('dragging');
  });

  mapElement.addEventListener('wheel', (event) => {
    event.preventDefault();

    const rect = mapElement.getBoundingClientRect();
    const cursorX = event.clientX - rect.left;
    const cursorY = event.clientY - rect.top;

    if (!zoomAnchor) {
      const centerWorld = locationToWorld(mapCenter.latitude, mapCenter.longitude, mapZoom);
      const cursorWorld = {
        x: centerWorld.x + (cursorX - rect.width / 2),
        y: centerWorld.y + (cursorY - rect.height / 2)
      };

      zoomAnchor = {
        x: cursorX,
        y: cursorY,
        location: worldToLocation(cursorWorld.x, cursorWorld.y, mapZoom)
      };
      visualZoom = mapZoom;
      targetZoom = mapZoom;
    }

    const zoomDelta = wheelEventToZoomDelta(event, rect);

    targetZoom = Math.max(
      MIN_ZOOM,
      Math.min(MAX_ZOOM, targetZoom + zoomDelta)
    );

    clearTimeout(zoomSettleTimer);
    zoomSettleTimer = setTimeout(() => {
      targetZoom = Math.max(
        MIN_ZOOM,
        Math.min(MAX_ZOOM, Math.round(targetZoom))
      );
      startZoomAnimation();
    }, 110);

    startZoomAnimation();
  }, { passive: false });

  window.addEventListener('resize', renderMap);

  initialize().catch(() => {});
});
