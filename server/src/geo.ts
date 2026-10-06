export type LatLng = [lat: number, lng: number];

export const MAX_FENCE_POINTS = 64; // matches GeofenceMonitor::kMaxPoints in the firmware

// Same ray-casting test as firmware/lib/geofence/geofence.cpp.
export function pointInPolygon([lat, lng]: LatLng, poly: LatLng[]): boolean {
  if (poly.length < 3) return false;
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [aLat, aLng] = poly[i];
    const [bLat, bLng] = poly[j];
    if (aLat > lat !== bLat > lat && lng < ((bLng - aLng) * (lat - aLat)) / (bLat - aLat) + aLng) {
      inside = !inside;
    }
  }
  return inside;
}

// Accepts either our own [[lat, lng], ...] format or GeoJSON (a Polygon, or a
// Feature / FeatureCollection containing one) as drawn on geojson.io. GeoJSON
// uses [lng, lat] order, so those are swapped. Throws with a readable message.
export function parsePolygon(input: unknown): LatLng[] {
  let points: unknown;
  let geojson = false;

  const obj = input as any;
  if (Array.isArray(obj)) {
    points = obj;
  } else if (obj?.type === 'FeatureCollection') {
    return parsePolygon(obj.features?.[0]);
  } else if (obj?.type === 'Feature') {
    return parsePolygon(obj.geometry);
  } else if (obj?.type === 'Polygon') {
    points = obj.coordinates?.[0];
    geojson = true;
  } else {
    throw new Error('Expected [[lat, lng], ...] or a GeoJSON Polygon');
  }

  if (!Array.isArray(points)) throw new Error('Polygon has no points');
  let poly: LatLng[] = points.map((p, i) => {
    if (!Array.isArray(p) || p.length < 2 || !p.slice(0, 2).every(Number.isFinite)) {
      throw new Error(`Point ${i + 1} is not a [number, number] pair`);
    }
    const [lat, lng] = geojson ? [p[1], p[0]] : [p[0], p[1]];
    if (Math.abs(lat) > 90 || Math.abs(lng) > 180) {
      throw new Error(`Point ${i + 1} is out of range (lat ${lat}, lng ${lng})`);
    }
    return [lat, lng];
  });

  // GeoJSON rings repeat the first point at the end; the firmware doesn't need it.
  const first = poly[0];
  const last = poly[poly.length - 1];
  if (poly.length > 1 && first[0] === last[0] && first[1] === last[1]) poly = poly.slice(0, -1);

  if (poly.length < 3) throw new Error('A geofence needs at least 3 points');
  if (poly.length > MAX_FENCE_POINTS) {
    throw new Error(`A geofence can have at most ${MAX_FENCE_POINTS} points`);
  }
  return poly;
}
