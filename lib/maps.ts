export type GeoPoint = { latitude: number; longitude: number };

export type AddressSuggestion = {
  placeId: string;
  primaryText: string;
  secondaryText: string;
  fullText: string;
};

export type ResolvedAddress = GeoPoint & {
  placeId: string;
  formattedAddress: string;
  city: string;
  area: string;
};

export function validGeoPoint(point: GeoPoint) {
  return Number.isFinite(point.latitude) && Number.isFinite(point.longitude)
    && point.latitude >= -90 && point.latitude <= 90
    && point.longitude >= -180 && point.longitude <= 180;
}

export function distanceKm(origin: GeoPoint, destination: GeoPoint) {
  if (!validGeoPoint(origin) || !validGeoPoint(destination)) throw new Error("Coordonnées invalides");
  const radians = (value: number) => value * Math.PI / 180;
  const latitudeDelta = radians(destination.latitude - origin.latitude);
  const longitudeDelta = radians(destination.longitude - origin.longitude);
  const value = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(radians(origin.latitude)) * Math.cos(radians(destination.latitude))
    * Math.sin(longitudeDelta / 2) ** 2;
  return 6371.0088 * 2 * Math.asin(Math.min(1, Math.sqrt(value)));
}

export function distanceTravelFee(distance: number, freeRadius: number, feePerKm: number) {
  if (![distance, freeRadius, feePerKm].every(Number.isFinite) || distance < 0 || freeRadius < 0 || feePerKm < 0) return 0;
  return Math.ceil(Math.max(0, distance - freeRadius)) * feePerKm;
}

export function googleDirectionsUrl(destination: GeoPoint, origin?: GeoPoint) {
  const parameters = new URLSearchParams({ api: "1", destination: `${destination.latitude},${destination.longitude}`, travelmode: "driving" });
  if (origin && validGeoPoint(origin)) parameters.set("origin", `${origin.latitude},${origin.longitude}`);
  return `https://www.google.com/maps/dir/?${parameters.toString()}`;
}

