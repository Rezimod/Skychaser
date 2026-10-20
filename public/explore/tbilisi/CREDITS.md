# Tbilisi — Explore Mode ground data

Baked 2026-09-16 by `node scripts/bake-tbilisi.mjs`.

| File | What | Source | Licence |
|------|------|--------|---------|
| `terrain.bin` | Elevation grids: walk area (4 km, 6.4 m), city (12 km), valley (60 km), Caucasus (480 km) | AWS Terrain Tiles (Mapzen/Tilezen terrarium): SRTM and GMTED2010 courtesy of the U.S. Geological Survey; ETOPO1, U.S. National Oceanic and Atmospheric Administration | Public domain, credit given |
| `terrain.bin` (land cover), `city.bin`, `manifest.json` | Buildings, heights and levels, streets, the Mtkvari, parks, trees, street lamps, landmark outlines, the cable car | © OpenStreetMap contributors | ODbL 1.0 — https://www.openstreetmap.org/copyright. These files are a derived database and are published under the same licence. |

Buildings with no height or level count in OpenStreetMap (26122 of 34375) are given a plain storey count by building type; see `scripts/bake-tbilisi.mjs`.
The surface model is lowered to bare earth under built-up areas, and the river bed is cut below a water level taken from the model itself.

At runtime the scene also uses astronomy-engine (MIT) for the Sun, Moon and planets, and cloud cover from Open-Meteo (CC BY 4.0) through `/api/sky/forecast`.
