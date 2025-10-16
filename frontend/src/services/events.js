import api from "../api";

export async function fetchOccurrences({ start, end }) {
  const params = new URLSearchParams();
  if (start) params.set("start", start);
  if (end) params.set("end", end);
  const query = params.toString();
  const url = query ? `/api/events/occurrences/?${query}` : "/api/events/occurrences/";
  const { data } = await api.get(url);
  return data;
}

export async function createEvent(payload) {
  const { data } = await api.post("/api/events/", payload);
  return data;
}

export async function deleteEvent(eventId) {
  await api.delete(`/api/events/${eventId}/`);
}

