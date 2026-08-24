// Finds real, nearby places (donation centers, second-hand/resale shops,
// repair shops, recycling points) using OpenStreetMap data via the free,
// public Overpass API — no API key, no billing account, no setup required.
//
// This deliberately does NOT invent or guess organizations. Every result
// comes from OpenStreetMap's community-maintained map data. That data can
// be incomplete or occasionally outdated for a given area (OSM coverage
// varies a lot by region), which is an honest limitation of using free,
// open data rather than a paid commercial places database — but it's real
// data, not fabricated, which is the important thing.
//
// If you have a Google Places (or similar) API key and want more complete
// coverage, set NEARBY_PROVIDER=google and GOOGLE_PLACES_API_KEY in
// backend/.env — see googlePlacesProvider.js. Overpass remains the
// zero-setup default.

const OVERPASS_URL = process.env.NEARBY_OVERPASS_URL || "https://overpass-api.de/api/interpreter";
const REQUEST_TIMEOUT_MS = 12000;
const DEFAULT_RADIUS_METERS = 5000;
const MAX_RESULTS = 10;

// Maps a LifeLoop action to the real-world place types worth searching for.
// OSM tags are not a perfect match for every category (there's no single
// canonical "repair shop" tag covering every kind of item), so this is a
// reasonable, honestly-imperfect mapping rather than a claim of completeness.
const ACTION_QUERIES = {
  donate: ['shop=charity', 'amenity=social_facility'],
  resell: ['shop=second_hand', 'shop=charity', 'shop=pawnbroker'],
  repair: ['shop=electronics_repair', 'craft=electronics_repair', 'shop=shoe_repair', 'shop=car_repair', 'craft=clockmaker'],
  recycle: ['amenity=recycling'],
};

function buildOverpassQuery({ latitude, longitude, radiusMeters, tags }) {
  const around = `around:${radiusMeters},${latitude},${longitude}`;
  const clauses = tags
    .map((tag) => {
      const [key, value] = tag.split("=");
      return `node[${JSON.stringify(key)}=${JSON.stringify(value)}](${around});way[${JSON.stringify(key)}=${JSON.stringify(value)}](${around});`;
    })
    .join("\n  ");
  return `[out:json][timeout:10];\n(\n  ${clauses}\n);\nout center ${MAX_RESULTS * 3};`;
}

function distanceMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function elementToResult(element, latitude, longitude) {
  const lat = element.lat ?? element.center?.lat;
  const lon = element.lon ?? element.center?.lon;
  if (lat == null || lon == null) return null;

  const tags = element.tags || {};
  const name = tags.name || "Unnamed location";
  const addressParts = [tags["addr:housenumber"], tags["addr:street"], tags["addr:city"]].filter(Boolean);

  return {
    name,
    type: tags.shop || tags.amenity || tags.craft || "place",
    address: addressParts.length ? addressParts.join(" ") : null,
    latitude: lat,
    longitude: lon,
    distanceMeters: Math.round(distanceMeters(latitude, longitude, lat, lon)),
    mapUrl: `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=18/${lat}/${lon}`,
  };
}

// Returns a list of real nearby places for the given action, sorted by
// distance, or throws a descriptive error (missing/invalid coordinates,
// network failure, timeout, invalid response) for the caller to handle.
async function findNearbyPlaces({ latitude, longitude, action, radiusMeters }) {
  const tags = ACTION_QUERIES[action];
  if (!tags) throw new Error(`No place search is defined for action "${action}".`);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    throw new Error("Valid latitude/longitude are required to search nearby.");
  }

  const query = buildOverpassQuery({
    latitude,
    longitude,
    radiusMeters: radiusMeters || DEFAULT_RADIUS_METERS,
    tags,
  });

  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => {
    try {
      controller.abort();
    } catch {
      // Already settled — nothing to do.
    }
  }, REQUEST_TIMEOUT_MS);

  let response;
  try {
    response = await fetch(OVERPASS_URL, {
      method: "POST",
      headers: { "content-type": "text/plain" },
      body: query,
      signal: controller.signal,
    });
  } catch (err) {
    const wrapped = err.name === "AbortError" ? new Error("Nearby-places search timed out") : new Error(`Nearby-places network error: ${err.message}`);
    console.warn(`Nearby-places request failed: ${wrapped.message}`);
    throw wrapped;
  } finally {
    clearTimeout(timeoutHandle);
  }

  if (!response.ok) {
    const bodyText = await response.text().catch(() => "");
    const err = new Error(`Nearby-places service error: ${response.status} ${bodyText.slice(0, 200)}`);
    console.warn(err.message);
    throw err;
  }

  let data;
  try {
    data = await response.json();
  } catch {
    throw new Error("Nearby-places service returned an invalid response.");
  }

  const results = (data.elements || [])
    .map((el) => elementToResult(el, latitude, longitude))
    .filter(Boolean)
    .sort((a, b) => a.distanceMeters - b.distanceMeters)
    .slice(0, MAX_RESULTS);

  return results;
}

module.exports = { findNearbyPlaces };
