import { afterEach, describe, expect, it, vi } from "vitest";
import { GET as autocomplete } from "@/app/api/maps/autocomplete/route";
import { GET as placeDetails } from "@/app/api/maps/place/route";

describe("international Google Places endpoints", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("does not pin autocomplete to Senegal unless the caller selects a country", async () => {
    vi.stubEnv("GOOGLE_MAPS_SERVER_KEY", "server-key-for-test");
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      expect(body).not.toHaveProperty("includedRegionCodes");
      expect(body).not.toHaveProperty("regionCode");
      return Response.json({ suggestions: [] });
    });
    vi.stubGlobal("fetch", fetchMock);

    const response = await autocomplete(new Request("https://mata.test/api/maps/autocomplete?input=Paris&languageCode=fr"));

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("returns the resolved ISO country and never invents Dakar for another address", async () => {
    vi.stubEnv("GOOGLE_MAPS_SERVER_KEY", "server-key-for-test");
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({
      id: "place-fr-1",
      formattedAddress: "10 rue de Rivoli, Paris, France",
      location: { latitude: 48.8566, longitude: 2.3522 },
      addressComponents: [
        { longText: "Paris", shortText: "Paris", types: ["locality"] },
        { longText: "Île-de-France", shortText: "IDF", types: ["administrative_area_level_1"] },
        { longText: "France", shortText: "FR", types: ["country"] },
      ],
    })));

    const response = await placeDetails(new Request("https://mata.test/api/maps/place?placeId=place-fr-1"));
    const payload = await response.json() as { city: string; countryCode: string; region: string };

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({ city: "Paris", countryCode: "FR", region: "Île-de-France" });
    expect(payload.city).not.toBe("Dakar");
  });
});
