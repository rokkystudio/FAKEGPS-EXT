// Controls the Fake GPS popup, saved locations, localization and appearance.
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

  const topBarStatusIcon = document.getElementById('top-bar-status-icon');
  const topBarVersion = document.getElementById('top-bar-version');
  const topBarSubtitle = document.getElementById('top-bar-subtitle');
  const themeButton = document.getElementById('theme-button');
  const themeIcon = document.getElementById('theme-icon');
  const languageButton = document.getElementById('language-button');
  const languageFlag = document.getElementById('language-flag');
  const statusBadge = document.getElementById('status-badge');
  const activeLocationFlag = document.getElementById('active-location-flag');
  const activeLocationName = document.getElementById('active-location-name');
  const activeLocationAddress = document.getElementById('active-location-address');
  const enableToggle = document.getElementById('enable-toggle');
  const addLocationButton = document.getElementById('add-location-button');
  const locationsContainer = document.getElementById('all-locations');
  const deleteModal = document.getElementById('delete-modal');
  const deleteCloseButton = document.getElementById('delete-close-button');
  const deleteCancelButton = document.getElementById('delete-cancel-button');
  const deleteConfirmButton = document.getElementById('delete-confirm-button');
  const deleteLocationName = document.getElementById('delete-location-name');

  let uiLanguage = navigator.language.toLowerCase().startsWith('ru') ? 'ru' : 'en';
  let uiTheme = 'light';
  let messages = {};
  let currentSettings = { ...DEFAULT_SETTINGS };
  let savedLocations = [];
  let pendingDeleteLocationId = null;

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
   * Applies the selected light or dark theme to the popup.
   *
   * @returns {void}
   */
  function applyTheme()
  {
    document.documentElement.dataset.theme = uiTheme;
    themeIcon.src = uiTheme === 'dark'
      ? 'img/theme_sun.png'
      : 'img/theme_moon.png';
    themeButton.title = `${t('changeTheme')}: ${uiTheme === 'dark' ? t('darkTheme') : t('lightTheme')}`;
  }

  /**
   * Persists and applies the selected popup theme.
   *
   * @param {'light'|'dark'} theme UI theme.
   * @returns {Promise<void>} Resolves after the theme is saved.
   */
  async function setTheme(theme)
  {
    uiTheme = theme === 'dark' ? 'dark' : 'light';

    await chrome.storage.sync.set({
      uiTheme
    });

    applyTheme();
  }

  /**
   * Applies localization to static popup elements and header controls.
   *
   * @returns {void}
   */
  function applyLocalization()
  {
    document.documentElement.lang = uiLanguage;

    document.querySelectorAll('[data-i18n]').forEach((element) => {
      element.textContent = t(element.dataset.i18n);
    });

    document.querySelectorAll('[data-i18n-title]').forEach((element) => {
      element.title = t(element.dataset.i18nTitle);
    });

    languageFlag.src = uiLanguage === 'ru'
      ? 'img/language_ru.png'
      : 'img/language_us.png';
    languageButton.title = `${t('changeLanguage')}: ${uiLanguage === 'ru' ? t('russian') : t('english')}`;
    topBarVersion.textContent = `v${chrome.runtime.getManifest().version}`;
    topBarSubtitle.textContent = t('browserExtension');
    applyTheme();
  }

  /**
   * Persists and applies the selected popup language.
   *
   * @param {'en'|'ru'} language UI language.
   * @returns {Promise<void>} Resolves after localization is loaded and saved.
   */
  async function setLanguage(language)
  {
    uiLanguage = language === 'ru' ? 'ru' : 'en';
    messages = await loadMessages(uiLanguage);

    await chrome.storage.sync.set({
      uiLanguage
    });

    applyLocalization();
    render();
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
   * Returns the bundled flag URL for a country code.
   *
   * @param {string|null|undefined} countryCode Country code.
   * @returns {string} Extension-relative flag URL.
   */
  function getFlagUrl(countryCode)
  {
    const normalized = normalizeCountryCode(countryCode);
    return normalized ? `img/flags/${normalized}.png` : 'img/flags/unknown.png';
  }

  /**
   * Assigns a bundled flag image with unknown-country fallback.
   *
   * @param {HTMLImageElement} image Flag image element.
   * @param {string|null|undefined} countryCode Country code.
   * @returns {void}
   */
  function setFlagImage(image, countryCode)
  {
    const fallback = 'img/flags/unknown.png';
    image.onerror = () => {
      image.onerror = null;
      image.src = fallback;
    };
    image.src = getFlagUrl(countryCode);
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
   * Normalizes saved locations and assigns stable IDs to legacy entries.
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
   * Checks whether a saved location is the currently enabled spoofing location.
   *
   * @param {Object} location Saved location.
   * @returns {boolean} true when spoofing is enabled and coordinates match.
   */
  function isActiveLocation(location)
  {
    return currentSettings.enabled
      && Math.abs(Number(location.latitude) - currentSettings.latitude) < 0.0000001
      && Math.abs(Number(location.longitude) - currentSettings.longitude) < 0.0000001;
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
   * Renders active location and the saved-location list.
   *
   * @returns {void}
   */
  function render()
  {
    enableToggle.checked = currentSettings.enabled;
    topBarStatusIcon.src = currentSettings.enabled
      ? 'img/enabled.png'
      : 'img/disabled.png';
    statusBadge.textContent = currentSettings.enabled
      ? t('locationSpoofingEnabled')
      : t('locationSpoofingDisabled');
    statusBadge.classList.toggle('badge-panel-state-success', currentSettings.enabled);

    setFlagImage(activeLocationFlag, currentSettings.countryCode);
    activeLocationName.textContent = currentSettings.location || t('noActiveLocation');
    activeLocationAddress.textContent = `${formatCoordinate(currentSettings.latitude)}, ${formatCoordinate(currentSettings.longitude)}`;

    renderLocations();
  }

  /**
   * Renders saved locations using the HIDEME list layout.
   *
   * @returns {void}
   */
  function renderLocations()
  {
    locationsContainer.innerHTML = '';

    if (savedLocations.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'empty-state';
      empty.textContent = t('noSavedLocations');
      locationsContainer.appendChild(empty);
      return;
    }

    savedLocations.forEach((location) => {
      const item = document.createElement('div');
      item.className = 'menu-item';

      if (isActiveLocation(location)) {
        item.classList.add('active');
      }

      const row = document.createElement('span');
      row.className = 'menu-item-subitem';

      const arrow = document.createElement('i');
      arrow.className = 'toggle-button';
      arrow.textContent = '→';

      const flag = document.createElement('img');
      flag.className = 'menu-flag';
      flag.alt = '';
      setFlagImage(flag, location.countryCode);

      const textElement = document.createElement('span');
      textElement.className = 'menu-item-text';

      const name = document.createElement('span');
      name.className = 'menu-item-location';
      name.textContent = location.name;

      const address = document.createElement('span');
      address.className = 'menu-item-address';
      address.textContent = `${formatCoordinate(location.latitude)}, ${formatCoordinate(location.longitude)}`;

      const actions = document.createElement('span');
      actions.className = 'location-actions';

      const editButton = document.createElement('button');
      editButton.type = 'button';
      editButton.className = 'location-action';
      editButton.title = t('editLocation');
      editButton.textContent = '✎';

      const deleteButton = document.createElement('button');
      deleteButton.type = 'button';
      deleteButton.className = 'location-action delete';
      deleteButton.title = t('deleteLocation');
      deleteButton.textContent = '×';

      textElement.appendChild(name);
      textElement.appendChild(address);
      actions.appendChild(editButton);
      actions.appendChild(deleteButton);
      row.appendChild(arrow);
      row.appendChild(flag);
      row.appendChild(textElement);
      row.appendChild(actions);
      item.appendChild(row);

      item.addEventListener('click', () => {
        if (isActiveLocation(location) && currentSettings.enabled) {
          saveSettings({
            ...currentSettings,
            enabled: false
          }).catch(() => {});
          return;
        }

        selectLocation(location).catch(() => {});
      });

      editButton.addEventListener('click', (event) => {
        event.stopPropagation();
        openMapWindow(location).catch(() => {});
      });

      deleteButton.addEventListener('click', (event) => {
        event.stopPropagation();
        openDeleteDialog(location);
      });

      locationsContainer.appendChild(item);
    });
  }

  /**
   * Persists the active GEO settings.
   *
   * @param {Object} settings New GEO settings.
   * @returns {Promise<void>} Resolves after synchronized storage is updated.
   */
  async function saveSettings(settings)
  {
    currentSettings = normalizeSettings(settings);

    await chrome.storage.sync.set({
      geoSettings: currentSettings
    });

    render();
  }

  /**
   * Activates a saved location and enables spoofing.
   *
   * @param {Object} location Saved location.
   * @returns {Promise<void>} Resolves after the active location is persisted.
   */
  async function selectLocation(location)
  {
    await saveSettings({
      ...currentSettings,
      enabled: true,
      latitude: Number(location.latitude),
      longitude: Number(location.longitude),
      location: location.name,
      countryCode: location.countryCode,
      accuracy: 100
    });
  }

  /**
   * Opens the standalone map picker window for a new or existing location.
   *
   * @param {Object|null} location Existing saved location or null for a new location.
   * @returns {Promise<void>} Resolves after Chromium creates the picker window.
   */
  async function openMapWindow(location)
  {
    const url = new URL(chrome.runtime.getURL('map_picker.html'));

    if (location) {
      url.searchParams.set('id', location.id);
    }

    await chrome.windows.create({
      url: url.toString(),
      type: 'popup',
      width: 560,
      height: 700,
      focused: true
    });
  }

  /**
   * Opens the delete confirmation dialog for a saved location.
   *
   * @param {Object} location Saved location.
   * @returns {void}
   */
  function openDeleteDialog(location)
  {
    pendingDeleteLocationId = location.id;
    deleteLocationName.textContent = location.name;
    deleteModal.classList.add('visible');
  }

  /**
   * Closes the delete confirmation dialog.
   *
   * @returns {void}
   */
  function closeDeleteDialog()
  {
    pendingDeleteLocationId = null;
    deleteModal.classList.remove('visible');
  }

  /**
   * Deletes the location selected in the confirmation dialog.
   *
   * @returns {Promise<void>} Resolves after synchronized storage is updated.
   */
  async function confirmDeleteLocation()
  {
    if (!pendingDeleteLocationId) {
      return;
    }

    const locationId = pendingDeleteLocationId;
    savedLocations = savedLocations.filter((location) => location.id !== locationId);

    await chrome.storage.sync.set({
      savedLocations
    });

    closeDeleteDialog();
    renderLocations();
  }

  /**
   * Adds missing country metadata to active and saved legacy locations by reverse geocoding.
   *
   * @returns {Promise<void>} Resolves after available missing metadata has been persisted.
   */
  async function migrateMissingCountryCodes()
  {
    let settingsChanged = false;
    let locationsChanged = false;

    if (!currentSettings.countryCode) {
      try {
        const metadata = await reverseGeocode(currentSettings.latitude, currentSettings.longitude);
        currentSettings.countryCode = metadata.countryCode;

        if (!currentSettings.location || currentSettings.location === DEFAULT_SETTINGS.location) {
          currentSettings.location = metadata.name;
        }

        settingsChanged = Boolean(currentSettings.countryCode);
      } catch (_) {
      }
    }

    for (const location of savedLocations) {
      if (location.countryCode) {
        continue;
      }

      try {
        const metadata = await reverseGeocode(location.latitude, location.longitude);
        location.countryCode = metadata.countryCode;

        if (metadata.name) {
          location.name = metadata.name;
        }

        locationsChanged = Boolean(location.countryCode) || locationsChanged;
      } catch (_) {
      }
    }

    const updates = {};

    if (settingsChanged) {
      updates.geoSettings = currentSettings;
    }

    if (locationsChanged) {
      updates.savedLocations = savedLocations;
    }

    if (Object.keys(updates).length > 0) {
      await chrome.storage.sync.set(updates);
    }
  }

  /**
   * Loads persisted UI and GEO state and renders the popup.
   *
   * @returns {Promise<void>} Resolves after popup state is ready.
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
    applyLocalization();

    currentSettings = normalizeSettings(result.geoSettings);
    savedLocations = normalizeSavedLocations(result.savedLocations);

    const storedLocations = Array.isArray(result.savedLocations) ? result.savedLocations : [];
    const requiresStructuralMigration = storedLocations.length !== savedLocations.length
      || savedLocations.some((location, index) => storedLocations[index]?.id !== location.id);

    if (requiresStructuralMigration) {
      await chrome.storage.sync.set({
        savedLocations
      });
    }

    render();
    await migrateMissingCountryCodes();
    render();
  }

  themeButton.addEventListener('click', () => {
    setTheme(uiTheme === 'dark' ? 'light' : 'dark').catch(() => {});
  });

  languageButton.addEventListener('click', () => {
    setLanguage(uiLanguage === 'ru' ? 'en' : 'ru').catch(() => {});
  });

  enableToggle.addEventListener('change', () => {
    saveSettings({
      ...currentSettings,
      enabled: enableToggle.checked
    }).catch(() => {});
  });

  addLocationButton.addEventListener('click', () => {
    openMapWindow(null).catch(() => {});
  });

  deleteCloseButton.addEventListener('click', closeDeleteDialog);
  deleteCancelButton.addEventListener('click', closeDeleteDialog);
  deleteConfirmButton.addEventListener('click', () => {
    confirmDeleteLocation().catch(() => {});
  });

  deleteModal.addEventListener('click', (event) => {
    if (event.target === deleteModal) {
      closeDeleteDialog();
    }
  });

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'sync') {
      return;
    }

    if (changes.geoSettings) {
      currentSettings = normalizeSettings(changes.geoSettings.newValue);
    }

    if (changes.savedLocations) {
      savedLocations = normalizeSavedLocations(changes.savedLocations.newValue);
    }

    if (changes.uiLanguage) {
      const nextLanguage = changes.uiLanguage.newValue === 'ru' ? 'ru' : 'en';

      if (nextLanguage !== uiLanguage) {
        uiLanguage = nextLanguage;
        loadMessages(uiLanguage)
          .then((localizedMessages) => {
            messages = localizedMessages;
            applyLocalization();
            render();
          })
          .catch(() => {});
        return;
      }
    }

    if (changes.uiTheme) {
      uiTheme = changes.uiTheme.newValue === 'dark' ? 'dark' : 'light';
      applyTheme();
    }

    render();
  });

  initialize().catch(() => {});
});
