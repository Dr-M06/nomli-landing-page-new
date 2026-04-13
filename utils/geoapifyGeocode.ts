import Constants from 'expo-constants';

function getApiKey(): string | undefined {
  return Constants.expoConfig?.extra?.GEOAPIFY_API_KEY as string | undefined;
}

export type GeoapifyAddressFields = {
  name: string | null;
  street: string | null;
  city: string | null;
  region: string | null;
  country: string | null;
  postalCode: string | null;
  isoCountryCode: string | null;
};

function mapPropertiesToAddress(props: Record<string, unknown>): GeoapifyAddressFields {
  const countryCode =
    (props.country_code as string)?.toUpperCase() ||
    (props.iso3166_2_alpha2 as string)?.toUpperCase() ||
    null;
  return {
    name: (props.name as string) || (props.address_line1 as string) || null,
    street: (props.street as string) || (props.address_line2 as string) || null,
    city: (props.city as string) || (props.town as string) || (props.village as string) || null,
    region: (props.state as string) || (props.county as string) || (props.region as string) || null,
    country: (props.country as string) || null,
    postalCode: (props.postcode as string) || null,
    isoCountryCode: countryCode,
  };
}

/** Forward geocode (address text → coordinates). No device GPS. */
export async function geoapifyForwardGeocode(address: string): Promise<{ latitude: number; longitude: number }[]> {
  const apiKey = getApiKey();
  if (!apiKey || !address.trim()) {
    return [];
  }
  const url = `https://api.geoapify.com/v1/geocode/search?text=${encodeURIComponent(address.trim())}&limit=8&apiKey=${encodeURIComponent(apiKey)}`;
  const res = await fetch(url);
  if (!res.ok) {
    return [];
  }
  const json = await res.json();
  const features = json?.features as Array<{ geometry?: { coordinates?: [number, number] } }> | undefined;
  if (!Array.isArray(features)) {
    return [];
  }
  const out: { latitude: number; longitude: number }[] = [];
  for (const f of features) {
    const c = f?.geometry?.coordinates;
    if (c && typeof c[0] === 'number' && typeof c[1] === 'number') {
      out.push({ longitude: c[0], latitude: c[1] });
    }
  }
  return out;
}

/** Reverse geocode (coordinates → address fields). No device GPS permission. */
export async function geoapifyReverseGeocode(
  latitude: number,
  longitude: number
): Promise<GeoapifyAddressFields[]> {
  const apiKey = getApiKey();
  if (!apiKey) {
    return [];
  }
  const url = `https://api.geoapify.com/v1/geocode/reverse?lat=${encodeURIComponent(String(latitude))}&lon=${encodeURIComponent(String(longitude))}&apiKey=${encodeURIComponent(apiKey)}`;
  const res = await fetch(url);
  if (!res.ok) {
    return [];
  }
  const json = await res.json();
  const features = json?.features as Array<{ properties?: Record<string, unknown> }> | undefined;
  if (!Array.isArray(features) || features.length === 0) {
    return [];
  }
  const props = features[0]?.properties;
  if (!props || typeof props !== 'object') {
    return [];
  }
  return [mapPropertiesToAddress(props)];
}
