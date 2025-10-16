import api from "../api";

export async function fetchGoogleStatus() {
  const { data } = await api.get("/api/google/status/");
  return data;
}

export async function startGoogleOAuth() {
  const { data } = await api.post("/api/google/oauth/start/");
  return data.auth_url;
}

export async function syncGoogleCalendar() {
  const { data } = await api.post("/api/google/sync/");
  return data.stats ?? {};
}

export async function disconnectGoogleCalendar() {
  await api.delete("/api/google/disconnect/");
}

export async function fetchBrightspaceStatus() {
  const { data } = await api.get("/api/brightspace/status/");
  return data;
}

export async function importBrightspaceFeed(icsUrl) {
  const body = icsUrl ? { ics_url: icsUrl } : {};
  const { data } = await api.post("/api/calendar/brightspace/import/", body);
  return data;
}

export async function refreshBrightspaceFeed() {
  const { data } = await api.post("/api/calendar/brightspace/import/", {});
  return data;
}

export async function disconnectBrightspaceFeed() {
  await api.delete("/api/brightspace/disconnect/");
}

