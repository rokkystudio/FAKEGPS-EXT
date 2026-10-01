# Fake GPS

<p align="right">🌐 Language: <a href="README.md">Русский</a> | <strong>English</strong></p>

A browser extension for Chromium-based browsers such as Google Chrome and Microsoft Edge. It overrides the Browser Geolocation API and lets you quickly switch between saved locations.

Keywords: Google Chrome, Microsoft Edge, Chrome Extension, Edge Extension, Browser Extension, Extention.

![Fake GPS](files/screen.png)

## Features

- enable or disable geolocation spoofing;
- save multiple locations and switch between them quickly;
- select a location on the map;
- search for places by name;
- enter latitude and longitude manually;
- edit and delete saved locations;
- light and dark themes;
- Russian and English interface.

## Installation

1. Open `chrome://extensions/` or `edge://extensions/`.
2. Enable **Developer mode**.
3. Click **Load unpacked**.
4. Select the extension folder.

To add a new location, click **Add location**, choose a place on the map, and click **Apply**. Clicking a saved location activates it, while clicking the currently active location disables geolocation spoofing.

## How it works

Fake GPS overrides `navigator.geolocation.getCurrentPosition()` and `navigator.geolocation.watchPosition()`. For Google requests, it also uses a GEO header with the selected coordinates.

The map is powered by OpenStreetMap, while place search and reverse geocoding use Nominatim.

> Geolocation spoofing does not change your IP address. Websites that determine location using your IP address, account data, or other signals may still show a different location.

© OpenStreetMap contributors
