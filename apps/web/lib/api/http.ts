/**
 * Kleiner Fetch-Helper für GET-Endpoints: wirft bei HTTP-Fehlern, parst JSON.
 * `cache: "no-store"` umgeht den HTTP-Cache des Browsers — das Caching
 * übernimmt TanStack Query (inkl. IndexedDB-Persistenz für Offline).
 */
export async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`GET ${url} failed with status ${res.status}`);
  }
  return res.json() as Promise<T>;
}
