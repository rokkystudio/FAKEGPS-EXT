# Fake GPS simplification

## Versioning

Current version: `1.0.27`.

Every code or UI change increments only the third version component: `1.0.7`, `1.0.8`, `1.0.9`, and so on.


## Goal

Keep the extension focused on one job: select a geographic location, save several locations, switch between them quickly, and enable or disable location spoofing.

The popup UI follows the compact interaction model from `C:\FILES\PROJECTS\HIDEME`: a status/toggle block followed by a simple selectable list.

## Completed

- [x] Remove Google SERP result numbering from the extension runtime.
- [x] Remove Google Maps result numbering from the extension runtime.
- [x] Remove Business Information Panel and Google place-data tracking from the extension runtime.
- [x] Remove Browser Assistant and cookie-consent automation from the extension runtime.
- [x] Remove highlighted websites and related context-menu behavior from the extension runtime.
- [x] Remove keyboard-shortcut configuration and command handling.
- [x] Remove configurable GEO radius from the UI and use one internal accuracy value.
- [x] Remove Search Console helper functionality from the extension runtime.
- [x] Reduce extension permissions to the permissions required for GEO spoofing and storage.
- [x] Add Geolocation API spoofing for regular web pages.
- [x] Keep Google x-geo support as an additional Google-specific location signal.
- [x] Keep saved locations and one-click switching.
- [x] Keep enable/disable state.
- [x] Replace the Google Maps context-menu picker with an embedded OpenStreetMap tile picker.
- [x] Remove Google Maps runtime integration from the location picker.
- [x] Support map panning, zoom and point selection directly in the popup.
- [x] Add stable saved-location IDs and edit existing locations in place.
- [x] Copy the complete HIDEME flag set into img/flags and store countryCode per location.
- [x] Rebuild the popup around HIDEME-style active-location and available-location rows.
- [x] Show edit and delete actions only while hovering a saved-location row.
- [x] Add a compact Android-style top bar with a 32x32 active/inactive status icon and a localized subtitle with the manifest version.
- [x] Add English and Russian popup localization with a persistent language switch.
- [x] Add persistent light/dark theme switch using the Android app palette and sun/moon icons.
- [x] Ensure the popup root background follows the selected theme and keep the compact header title at 20px.
- [x] Show the manifest version next to the main header title in a small font.
- [x] Remove the plus button from Available Locations.
- [x] Add a full-width Add location button at the bottom of the popup.
- [x] Pin the Add location footer to the bottom of the popup with a full-height flex layout.
- [x] Open map selection in a standalone extension window for both creating and editing saved locations.
- [x] Use corrected standalone map controls and action buttons.
- [x] Remove the selected-point information block from the standalone map picker.
- [x] Use the Android app OpenStreetMap MAPNIK provider in the standalone picker.
- [x] Zoom the map with the mouse wheel around the cursor position.
- [x] Move the map selection hint into the bottom action row and remove separate zoom buttons.
- [x] Remove the standalone map picker header.
- [x] Add location-name search and manual latitude/longitude input to the standalone map picker.
- [x] Animate mouse-wheel zoom around the cursor before rendering the next tile level.
- [x] Use accumulated requestAnimationFrame wheel zoom so rapid wheel input remains continuous instead of dropping events.
- [x] Normalize mouse-wheel detents to integer map zoom levels while preserving fractional high-resolution input.
- [x] Use a single 128x128 extension icon file (`img/icon.png`) instead of separate size-specific files.
- [x] Use dedicated large RU/US language flags for the language switcher while keeping small country flags for location rows.
- [x] Require an explicit map click before Apply can create or modify a location in the standalone picker.
- [x] Add delete confirmation dialog.
- [x] Resolve location name and countryCode from map coordinates with reverse geocoding.
- [x] Migrate legacy locations without countryCode so bundled country flags can render.
- [x] Validate getCurrentPosition(), watchPosition(), live location updates and native fallback in an isolated runtime harness.

## Next

- [ ] Add drag-and-drop ordering for saved locations if it becomes useful.
- [ ] Add import/export for saved locations if needed.
- [ ] Test Geolocation API spoofing on sites using getCurrentPosition().
- [ ] Test Geolocation API spoofing on sites using watchPosition().
- [ ] Test location changes while a page stays open.
- [ ] Test iframe behavior on pages that request geolocation from embedded frames.
- [ ] Verify Chromium and Edge behavior with MAIN-world content scripts.
- [ ] Verify OpenStreetMap tile loading inside the extension popup under Chromium extension CSP.
- [ ] Review whether Google x-geo should remain enabled after browser-level Geolocation API spoofing is fully validated.

## Deleted files

- [x] browser_assistant.js
- [x] serp_counter.js
- [x] place_tracker.js
- [x] search_console_context.js
- [x] maps_counter.js
- [x] maps_picker.js
- [x] extension-styles.css
