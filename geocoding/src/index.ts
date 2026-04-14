/**
 * @lns-skills/geocoding
 *
 * Multi-provider geocoding with automatic fallback:
 *   Google Maps → Mapbox → Nominatim (free) → Overpass (free)
 *
 * Forward geocoding: address → {lat, lng}
 * Reverse geocoding: {lat, lng} → address + county
 * Business name geocoding: company name + city → {lat, lng}
 *
 * Consumers: genome studio, ops-maturity, facility-map, landiq
 */

export interface GeoResult {
  lat: number;
  lng: number;
  formattedAddress?: string;
  county?: string;
  state?: string;
  country?: string;
  source: "google" | "mapbox" | "nominatim" | "overpass";
}

export interface GeoConfig {
  googleKey?: string;
  mapboxToken?: string;
  /** User-Agent for Nominatim (required by their TOS) */
  userAgent?: string;
}

const DEFAULT_UA = "LNS-Geocoding/1.0 (ryan.cahalane@lns-global.com)";

// ── State abbreviation expansion ──────────────────────────────────────────
const STATE_ABBR: Record<string, string> = {
  AL:"Alabama",AK:"Alaska",AZ:"Arizona",AR:"Arkansas",CA:"California",
  CO:"Colorado",CT:"Connecticut",DE:"Delaware",FL:"Florida",GA:"Georgia",
  HI:"Hawaii",ID:"Idaho",IL:"Illinois",IN:"Indiana",IA:"Iowa",
  KS:"Kansas",KY:"Kentucky",LA:"Louisiana",ME:"Maine",MD:"Maryland",
  MA:"Massachusetts",MI:"Michigan",MN:"Minnesota",MS:"Mississippi",MO:"Missouri",
  MT:"Montana",NE:"Nebraska",NV:"Nevada",NH:"New Hampshire",NJ:"New Jersey",
  NM:"New Mexico",NY:"New York",NC:"North Carolina",ND:"North Dakota",OH:"Ohio",
  OK:"Oklahoma",OR:"Oregon",PA:"Pennsylvania",RI:"Rhode Island",SC:"South Carolina",
  SD:"South Dakota",TN:"Tennessee",TX:"Texas",UT:"Utah",VT:"Vermont",
  VA:"Virginia",WA:"Washington",WV:"West Virginia",WI:"Wisconsin",WY:"Wyoming",
};

function expandState(addr: string): string {
  return addr.replace(/\b([A-Z]{2})\b/g, (_, abbr) => STATE_ABBR[abbr] || abbr);
}

/**
 * Forward geocode: address → coordinates.
 * Tries providers in order until one succeeds.
 */
export async function geocode(address: string, config: GeoConfig = {}): Promise<GeoResult | null> {
  const expanded = expandState(address);

  // 1. Google Maps
  if (config.googleKey) {
    const result = await googleGeocode(expanded, config.googleKey);
    if (result) return result;
  }

  // 2. Mapbox
  if (config.mapboxToken) {
    const result = await mapboxGeocode(expanded, config.mapboxToken);
    if (result) return result;
  }

  // 3. Nominatim (free, no key)
  const nom = await nominatimGeocode(expanded, config.userAgent || DEFAULT_UA);
  if (nom) return nom;

  // 4. Overpass (free, for business names)
  const ovp = await overpassGeocode(expanded);
  if (ovp) return ovp;

  return null;
}

/**
 * Reverse geocode: coordinates → address + county.
 */
export async function reverseGeocode(
  lat: number, lng: number, config: GeoConfig = {}
): Promise<GeoResult | null> {
  // Google
  if (config.googleKey) {
    try {
      const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${config.googleKey}`;
      const r = await fetch(url);
      if (r.ok) {
        const data = await r.json();
        const result = data.results?.[0];
        if (result) {
          const county = result.address_components?.find(
            (c: { types: string[] }) => c.types.includes("administrative_area_level_2")
          )?.long_name;
          const state = result.address_components?.find(
            (c: { types: string[] }) => c.types.includes("administrative_area_level_1")
          )?.long_name;
          return {
            lat, lng,
            formattedAddress: result.formatted_address,
            county, state,
            country: result.address_components?.find(
              (c: { types: string[] }) => c.types.includes("country")
            )?.long_name,
            source: "google",
          };
        }
      }
    } catch { /* fall through */ }
  }

  // Nominatim reverse
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&zoom=14`;
    const r = await fetch(url, {
      headers: { "User-Agent": config.userAgent || DEFAULT_UA },
    });
    if (r.ok) {
      const data = await r.json();
      if (data.display_name) {
        return {
          lat, lng,
          formattedAddress: data.display_name,
          county: data.address?.county,
          state: data.address?.state,
          country: data.address?.country,
          source: "nominatim",
        };
      }
    }
  } catch { /* fall through */ }

  return null;
}

// ── Provider implementations ──────────────────────────────────────────────

async function googleGeocode(address: string, key: string): Promise<GeoResult | null> {
  try {
    const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${key}`;
    const r = await fetch(url);
    if (!r.ok) return null;
    const data = await r.json();
    const result = data.results?.[0];
    if (!result?.geometry?.location) return null;
    return {
      lat: result.geometry.location.lat,
      lng: result.geometry.location.lng,
      formattedAddress: result.formatted_address,
      county: result.address_components?.find(
        (c: { types: string[] }) => c.types.includes("administrative_area_level_2")
      )?.long_name,
      state: result.address_components?.find(
        (c: { types: string[] }) => c.types.includes("administrative_area_level_1")
      )?.long_name,
      source: "google",
    };
  } catch { return null; }
}

async function mapboxGeocode(address: string, token: string): Promise<GeoResult | null> {
  try {
    const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(address)}.json?access_token=${token}&limit=1`;
    const r = await fetch(url);
    if (!r.ok) return null;
    const data = await r.json();
    const feature = data.features?.[0];
    if (!feature?.center) return null;
    return {
      lat: feature.center[1],
      lng: feature.center[0],
      formattedAddress: feature.place_name,
      source: "mapbox",
    };
  } catch { return null; }
}

async function nominatimGeocode(address: string, userAgent: string): Promise<GeoResult | null> {
  try {
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(address)}&format=json&limit=1&addressdetails=1`;
    const r = await fetch(url, { headers: { "User-Agent": userAgent } });
    if (!r.ok) return null;
    const data = await r.json();
    if (!data?.[0]) return null;
    return {
      lat: parseFloat(data[0].lat),
      lng: parseFloat(data[0].lon),
      formattedAddress: data[0].display_name,
      county: data[0].address?.county,
      state: data[0].address?.state,
      country: data[0].address?.country,
      source: "nominatim",
    };
  } catch { return null; }
}

async function overpassGeocode(query: string): Promise<GeoResult | null> {
  try {
    // Overpass is useful for business name geocoding
    const ovq = `[out:json][timeout:10];node["name"~"${query.replace(/"/g, "")}"](1);out 1;`;
    const r = await fetch("https://overpass-api.de/api/interpreter", {
      method: "POST",
      body: `data=${encodeURIComponent(ovq)}`,
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    });
    if (!r.ok) return null;
    const data = await r.json();
    const node = data.elements?.[0];
    if (!node?.lat) return null;
    return { lat: node.lat, lng: node.lon, source: "overpass" };
  } catch { return null; }
}
