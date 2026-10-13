// Inicializace podkladové mapy OSM a výchozího pohledu na Jičín.
const map = new maplibregl.Map({
  container: 'map',
  center: [15.35, 50.437],
  zoom: 15,
  minZoom: 7,
  maxZoom: 19,
  style: {
    version: 8,
    sources: {
      osm: {
        type: 'raster',
        tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
        tileSize: 256,
        attribution: '&copy; OpenStreetMap contributors',
      },
    },
    layers: [{ id: 'osm', type: 'raster', source: 'osm' }],
  },
});

// Definice českého národního souřadnicového systému, ve kterém ČÚZK filtruje parcely.
proj4.defs(
  'EPSG:5514',
  '+proj=krovak +lat_0=49.5 +lon_0=24.8333333333333 +alpha=30.2881397527778 +k=0.9999 +x_0=0 +y_0=0 +ellps=bessel +towgs84=589,76,480,0,0,0,0 +units=m +no_defs +type=crs',
);

const statusIndicator = document.querySelector('#status-indicator');
const statusMessage = document.querySelector('#status-message');
const parcelDetails = document.querySelector('#parcel-details');
// Stav požadavku a výběru umožňuje rušit stará načítání při rychlém pohybu mapou.
let activeRequest;
let refreshTimer;
let selectedParcelId;

// Tlačítka v panelu rychle přesunou mapu na vybraná města okresu.
document.querySelectorAll('.location-button').forEach((button) => {
  button.addEventListener('click', () => {
    map.flyTo({
      center: [Number(button.dataset.longitude), Number(button.dataset.latitude)],
      zoom: 15,
    });
  });
});

// Synchronizuje textový stav načítání s barevným indikátorem v záhlaví.
function setStatus(message, state = 'idle') {
  statusMessage.textContent = message;
  statusIndicator.className = `h-2 w-2 rounded-full ${
    state === 'loading' ? 'animate-pulse bg-amber-500' :
    state === 'error' ? 'bg-red-500' :
    state === 'ready' ? 'bg-emerald-500' : 'bg-slate-400'
  }`;
}

// Výměru odvozujeme z polygonu v EPSG:5514, jehož jednotkou jsou metry.
// Jde o plochu vykreslené geometrie, nikoli o úřední údaj z katastru.
function calculateRingArea(ring) {
  let twiceArea = 0;
  for (let index = 0; index < ring.length - 1; index += 1) {
    const [x1, y1] = ring[index];
    const [x2, y2] = ring[index + 1];
    twiceArea += x1 * y2 - x2 * y1;
  }
  return Math.abs(twiceArea) / 2;
}

function calculateGeometryArea(geometry) {
  if (!geometry?.coordinates) return null;
  const polygons = geometry.type === 'Polygon'
    ? [geometry.coordinates]
    : geometry.type === 'MultiPolygon'
      ? geometry.coordinates
      : [];

  if (polygons.length === 0) return null;

  return polygons.reduce((total, rings) => {
    const outerArea = calculateRingArea(rings[0] ?? []);
    const holesArea = rings.slice(1).reduce((sum, ring) => sum + calculateRingArea(ring), 0);
    return total + Math.max(0, outerArea - holesArea);
  }, 0);
}

// Zobrazí plochu v běžných jednotkách pro rychlou orientaci.
function formatArea(squareMeters) {
  if (!Number.isFinite(squareMeters)) return 'Nedostupná';
  return `${squareMeters.toLocaleString('cs-CZ', { maximumFractionDigits: 0 })} m² (${(squareMeters / 10000).toLocaleString('cs-CZ', { maximumFractionDigits: 2 })} ha)`;
}

// Převede dostupné atributy parcely do bezpečně vykreslených řádků informačního panelu.
function showParcelDetails(feature, location) {
  const properties = feature.properties ?? {};
  const id = properties.id ?? 'Nedostupný';
  const layer = properties.layer ?? 'Katastrální mapa';
  const parcelReference = properties.nationalCadastralReference ?? properties.label;
  const officialArea = parseAreaValue(properties.areaValue);
  const area = Number.isFinite(officialArea) && officialArea > 0
    ? `${formatArea(officialArea)} · údaj ČÚZK`
    : `${formatArea(properties._geometryArea)} · výpočet z geometrie`;
  const coordinates = location
    ? `${location.lng.toFixed(6)}, ${location.lat.toFixed(6)} (WGS84)`
    : 'Nedostupné';

  parcelDetails.replaceChildren();
  const rows = [
    ['Číslo / reference parcely', parcelReference ?? 'Zdroj ji neposkytuje'],
    ['Identifikátor prvku ČÚZK', id],
    ['Výměra', area],
    ['Typ geometrie', feature.geometry?.type ?? 'Nedostupný'],
    ['Místo výběru', coordinates],
    ['Zdrojová vrstva', layer],
  ];

  for (const [label, value] of rows) {
    const row = document.createElement('div');
    const term = document.createElement('dt');
    const description = document.createElement('dd');
    term.className = 'text-slate-500';
    term.textContent = label;
    description.className = 'mt-1 break-all font-medium text-slate-900';
    description.textContent = String(value);
    row.append(term, description);
    parcelDetails.append(row);
  }
}

// Převádí rozměr vrácený WFS na číslo, pokud zdroj použil číslo, text nebo objekt s hodnotou.
function parseAreaValue(value) {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') return Number(value);
  if (value && typeof value === 'object') return Number(value.value ?? value.Value);
  return Number.NaN;
}

// Hustším vzorkováním okrajů výřezu omezíme chybu při převodu zeměpisných souřadnic.
function getProjectedBounds(bounds) {
  const west = bounds.getWest();
  const east = bounds.getEast();
  const south = bounds.getSouth();
  const north = bounds.getNorth();
  const projectedPoints = [];
  const edgeSteps = 12;

  for (let step = 0; step <= edgeSteps; step += 1) {
    const ratio = step / edgeSteps;
    const longitude = west + (east - west) * ratio;
    const latitude = south + (north - south) * ratio;
    projectedPoints.push(
      proj4('EPSG:4326', 'EPSG:5514', [longitude, south]),
      proj4('EPSG:4326', 'EPSG:5514', [longitude, north]),
      proj4('EPSG:4326', 'EPSG:5514', [west, latitude]),
      proj4('EPSG:4326', 'EPSG:5514', [east, latitude]),
    );
  }

  const eastings = projectedPoints.map(([easting]) => easting);
  const northings = projectedPoints.map(([, northing]) => northing);

  return [
    Math.min(...eastings),
    Math.min(...northings),
    Math.max(...eastings),
    Math.max(...northings),
  ];
}

// Převádí jednu GeoJSON souřadnici i vnořené seznamy souřadnic pro polygonové geometrie.
function transformCoordinatesToWgs84(coordinates) {
  if (
    Array.isArray(coordinates)
    && typeof coordinates[0] === 'number'
    && typeof coordinates[1] === 'number'
  ) {
    return [
      ...proj4('EPSG:5514', 'EPSG:4326', coordinates.slice(0, 2)),
      ...coordinates.slice(2),
    ];
  }

  return coordinates.map(transformCoordinatesToWgs84);
}

// Zachová původní atributy a změní pouze souřadnice geometrie do CRS mapového podkladu.
function transformParcelsToWgs84(collection) {
  for (const feature of collection.features) {
    if (feature.geometry?.coordinates) {
      feature.geometry.coordinates = transformCoordinatesToWgs84(feature.geometry.coordinates);
    }
  }

  return collection;
}

// Načítá parcely pro aktuální výřez; při malém přiblížení nebo změně výřezu udržuje mapu svižnou.
async function loadParcels() {
  if (map.getZoom() < 13) {
    if (activeRequest) activeRequest.abort();
    map.getSource('parcels')?.setData({ type: 'FeatureCollection', features: [] });
    setStatus('Přibližte mapu pro zobrazení parcel.');
    return;
  }

  const bounds = map.getBounds();
  const bbox = getProjectedBounds(bounds).join(',');

  if (activeRequest) activeRequest.abort();
  activeRequest = new AbortController();
  setStatus('Načítám parcely…', 'loading');

  try {
    const response = await fetch(`/api/parcels?bbox=${encodeURIComponent(bbox)}`, {
      signal: activeRequest.signal,
      headers: { Accept: 'application/geo+json, application/json' },
    });

    if (!(response.headers.get('content-type') ?? '').includes('json')) {
      throw new Error('Server vrátil neplatnou odpověď.');
    }

    const payload = await response.json();

    if (!response.ok) {
      throw new Error(payload.error ?? 'Parcely se nepodařilo načíst.');
    }

    // Plochu spočítáme dřív, než se geometrie převede z metrů do zeměpisných stupňů.
    for (const feature of payload.features) {
      feature.properties ??= {};
      feature.properties._geometryArea = calculateGeometryArea(feature.geometry);
    }
    map.getSource('parcels')?.setData(transformParcelsToWgs84(payload));
    const count = payload.features.length;
    const wasTruncated = payload.meta?.truncated === true;
    setStatus(
      wasTruncated
        ? `Načteno nejvýše ${payload.meta.limit.toLocaleString('cs-CZ')} parcel. Přibližte mapu pro úplné zobrazení.`
        : `Načteno parcel: ${count.toLocaleString('cs-CZ')}`,
      'ready',
    );
  } catch (error) {
    if (error.name === 'AbortError') return;
    setStatus(error.message || 'Při načítání parcel došlo k chybě.', 'error');
  }
}

// Po načtení stylu přidá zdroj parcel, jejich výplň, hranice a interakce s výběrem.
map.on('style.load', () => {
  if (map.getSource('parcels')) return;

  // GeoJSON zdroj obsahuje pouze data pro právě načtený výřez.
  map.addSource('parcels', {
    type: 'geojson',
    data: { type: 'FeatureCollection', features: [] },
    promoteId: 'id',
  });

  // Jemná výplň zvýrazní právě zvolenou parcelu, ale nezakryje podkladovou mapu.
  map.addLayer({
    id: 'parcel-fills',
    type: 'fill',
    source: 'parcels',
    paint: {
      'fill-color': ['case', ['boolean', ['feature-state', 'selected'], false], '#10b981', '#047857'],
      'fill-opacity': ['case', ['boolean', ['feature-state', 'selected'], false], 0.2, 0.015],
    },
  });

  // Obrys parcel zůstává čitelný i při různých úrovních přiblížení.
  map.addLayer({
    id: 'parcel-lines',
    type: 'line',
    source: 'parcels',
    paint: {
      'line-color': '#047857',
      'line-width': ['interpolate', ['linear'], ['zoom'], 13, 0.4, 15, 0.7, 18, 1.2],
      'line-opacity': 0.72,
    },
  });

  // Kliknutí aktualizuje zvýraznění, detailní panel i stručné mapové okno.
  map.on('click', 'parcel-fills', (event) => {
    const feature = event.features?.[0];
    if (!feature) return;
    const parcelId = feature.properties?.id;

    if (selectedParcelId !== undefined) {
      map.setFeatureState(
        { source: 'parcels', id: selectedParcelId },
        { selected: false },
      );
    }

    if (parcelId !== undefined) {
      selectedParcelId = parcelId;
      map.setFeatureState(
        { source: 'parcels', id: parcelId },
        { selected: true },
      );
    }

    showParcelDetails(feature, event.lngLat);
    new maplibregl.Popup({ closeButton: true, closeOnClick: true })
      .setLngLat(event.lngLat)
      .setText(`ČÚZK ID: ${feature.properties?.id ?? 'Nedostupné'}`)
      .addTo(map);
  });

  // Kurzorem označíme plochy, na které lze kliknout.
  map.on('mouseenter', 'parcel-fills', () => {
    map.getCanvas().style.cursor = 'pointer';
  });
  map.on('mouseleave', 'parcel-fills', () => {
    map.getCanvas().style.cursor = '';
  });

  loadParcels();
});

// Po dokončení posunu nebo přiblížení počkáme krátce, aby se rychlé pohyby sloučily do jednoho dotazu.
map.on('moveend', () => {
  window.clearTimeout(refreshTimer);
  refreshTimer = window.setTimeout(loadParcels, 180);
});
