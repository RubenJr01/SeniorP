import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";

import IntegrationCard from "../components/IntegrationCard";
import Navigation from "../components/Navigation";
import {
  fetchOccurrences,
  deleteEvent as deleteEventById,
} from "../services/events";
import {
  fetchGoogleStatus,
  startGoogleOAuth,
  syncGoogleCalendar,
  disconnectGoogleCalendar,
  fetchBrightspaceStatus,
  importBrightspaceFeed,
  refreshBrightspaceFeed,
  disconnectBrightspaceFeed,
} from "../services/integrations";
import { formatRecurrenceLabel } from "../utils/recurrence";

import "../styles/Dashboard.css";

const SYNC_STATUS_LABEL = {
  success: "Success",
  error: "Error",
  skipped: "Skipped",
};

function summarizeGoogleStats(stats = {}) {
  const summaries = [
    ["created", "created"],
    ["updated", "updated"],
    ["deleted", "deleted"],
    ["pushed", "pushed"],
    ["linked_existing", "linked existing"],
    ["deduped", "removed duplicates"],
    ["google_deleted", "deleted in Google"],
  ];

  const details = summaries
    .filter(([key]) => stats[key])
    .map(([key, label]) => `${label} ${stats[key]}`);

  return details.length ? details.join(", ") : "No changes detected.";
}

function summarizeBrightspaceStats(payload = {}) {
  const { created = 0, updated = 0, skipped = 0 } = payload;
  const parts = [];
  if (created) parts.push(`created ${created}`);
  if (updated) parts.push(`updated ${updated}`);
  if (skipped) parts.push(`skipped ${skipped}`);
  return parts.length ? parts.join(", ") : "No changes detected.";
}

export default function Dashboard() {
  const location = useLocation();

  // ----- Mission data -----
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState("");

  // ----- Integrations -----
  const [googleStatus, setGoogleStatus] = useState({ connected: false });
  const [googleLoading, setGoogleLoading] = useState(true);
  const [googleWorking, setGoogleWorking] = useState(false);

  const [brightspaceStatus, setBrightspaceStatus] = useState({ connected: false });
  const [brightspaceLoading, setBrightspaceLoading] = useState(true);
  const [brightspaceWorking, setBrightspaceWorking] = useState(false);

  const [syncWorking, setSyncWorking] = useState(false);
  const [syncResults, setSyncResults] = useState([]);

  // ----- UI feedback -----
  const [toastMessage, setToastMessage] = useState(null);

  const loadOccurrences = useCallback(async () => {
    try {
      setLoading(true);
      setFetchError("");
      const data = await fetchOccurrences({});
      setEvents(data);
    } catch {
      setFetchError("Failed to load events.");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadGoogle = useCallback(async () => {
    try {
      setGoogleLoading(true);
      const status = await fetchGoogleStatus();
      setGoogleStatus(status);
    } catch {
      setGoogleStatus({ connected: false });
    } finally {
      setGoogleLoading(false);
    }
  }, []);

  const loadBrightspace = useCallback(async () => {
    try {
      setBrightspaceLoading(true);
      const status = await fetchBrightspaceStatus();
      setBrightspaceStatus(status);
    } catch {
      setBrightspaceStatus({ connected: false });
    } finally {
      setBrightspaceLoading(false);
    }
  }, []);

  useEffect(() => {
    loadOccurrences();
  }, [loadOccurrences]);

  useEffect(() => {
    loadGoogle();
  }, [loadGoogle]);

  useEffect(() => {
    loadBrightspace();
  }, [loadBrightspace]);

  // Handle OAuth callback messages.
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const status = params.get("google_status");
    if (!status) {
      return;
    }

    if (status === "success") {
      const imported = Number(params.get("imported") || 0);
      const linked = Number(params.get("linked") || 0);
      const deduped = Number(params.get("deduped") || 0);
      const pieces = [];
      if (imported > 0) pieces.push(`imported ${imported} new event${imported === 1 ? "" : "s"}`);
      if (linked > 0) pieces.push(`linked ${linked} existing event${linked === 1 ? "" : "s"}`);
      if (deduped > 0) pieces.push(`removed ${deduped} duplicate${deduped === 1 ? "" : "s"}`);
      const detail = pieces.length ? ` - ${pieces.join(", ")}` : "";
      setToastMessage({ type: "success", text: `Google Calendar connected${detail}.` });
      loadGoogle();
      loadOccurrences();
    } else {
      const message = params.get("message") || "unknown_error";
      setToastMessage({
        type: "error",
        text: `Google Calendar connection failed (${message}).`,
      });
    }

    window.history.replaceState({}, "", location.pathname);
  }, [location, loadGoogle, loadOccurrences]);

  // ----- Handlers -----
  const connectGoogle = useCallback(async () => {
    setGoogleWorking(true);
    setToastMessage(null);
    try {
      const authUrl = await startGoogleOAuth();
      window.location.href = authUrl;
    } catch (error) {
      console.error(error);
      setGoogleWorking(false);
      setToastMessage({
        type: "error",
        text: "Could not start Google authorization. Please try again.",
      });
    }
  }, []);

  const disconnectGoogle = useCallback(async () => {
    setGoogleWorking(true);
    setToastMessage(null);
    try {
      await disconnectGoogleCalendar();
      setToastMessage({ type: "success", text: "Google Calendar disconnected." });
      await loadGoogle();
    } catch (error) {
      console.error(error);
      setToastMessage({
        type: "error",
        text: "Failed to disconnect Google Calendar.",
      });
    } finally {
      setGoogleWorking(false);
    }
  }, [loadGoogle]);

  const connectBrightspace = useCallback(async () => {
    const rawUrl = window.prompt("Paste your Brightspace iCal URL:");
    const icsUrl = rawUrl ? rawUrl.trim() : "";
    if (!icsUrl) {
      return;
    }

    setBrightspaceWorking(true);
    setToastMessage(null);
    try {
      await importBrightspaceFeed(icsUrl);
      setToastMessage({ type: "success", text: "Brightspace calendar imported." });
      await loadBrightspace();
      await loadOccurrences();
    } catch (error) {
      console.error(error);
      const message =
        error.response?.data?.detail || "Failed to import Brightspace calendar.";
      setToastMessage({ type: "error", text: message });
    } finally {
      setBrightspaceWorking(false);
    }
  }, [loadBrightspace, loadOccurrences]);

  const disconnectBrightspace = useCallback(async () => {
    setBrightspaceWorking(true);
    setToastMessage(null);
    try {
      await disconnectBrightspaceFeed();
      setToastMessage({ type: "success", text: "Brightspace feed disconnected." });
      await loadBrightspace();
    } catch (error) {
      console.error(error);
      setToastMessage({
        type: "error",
        text: "Failed to disconnect Brightspace feed.",
      });
    } finally {
      setBrightspaceWorking(false);
    }
  }, [loadBrightspace]);

  const syncAll = useCallback(async () => {
    if (!googleStatus.connected && !brightspaceStatus.connected) {
      setToastMessage({
        type: "error",
        text: "Connect Google or Brightspace before syncing.",
      });
      return;
    }

    setSyncWorking(true);
    setSyncResults([]);
    setToastMessage(null);

    const integrations = [
      {
        key: "google",
        label: "Google Calendar",
        connected: googleStatus.connected,
        run: async () => summarizeGoogleStats(await syncGoogleCalendar()),
        errorMessage: "Google sync failed.",
      },
      {
        key: "brightspace",
        label: "Brightspace",
        connected: brightspaceStatus.connected,
        run: async () => summarizeBrightspaceStats(await refreshBrightspaceFeed()),
        errorMessage: "Brightspace sync failed.",
      },
    ];

    const results = [];

    try {
      for (const integration of integrations) {
        if (!integration.connected) {
          results.push({
            label: integration.label,
            status: "skipped",
            message: "Not connected.",
          });
          continue;
        }

        try {
          const message = await integration.run();
          results.push({
            label: integration.label,
            status: "success",
            message,
          });
        } catch (error) {
          console.error(error);
          const message = error.response?.data?.detail || integration.errorMessage;
          results.push({
            label: integration.label,
            status: "error",
            message,
          });
        }
      }

      setSyncResults(results);

      const hasError = results.some((item) => item.status === "error");
      const hasSuccess = results.some((item) => item.status === "success");

      if (hasError) {
        setToastMessage({ type: "error", text: "Sync completed with issues." });
      } else if (hasSuccess) {
        setToastMessage({ type: "success", text: "Sync completed successfully." });
      }

      await loadOccurrences();
      await loadGoogle();
      await loadBrightspace();
    } finally {
      setSyncWorking(false);
    }
  }, [
    googleStatus.connected,
    brightspaceStatus.connected,
    loadOccurrences,
    loadGoogle,
    loadBrightspace,
  ]);

  const handleDelete = useCallback(
    async (eventId, isRecurring) => {
      const message = isRecurring
        ? "Delete this entire recurring mission?"
        : "Delete this mission?";
      if (!window.confirm(message)) return;

      try {
        await deleteEventById(eventId);
        await loadOccurrences();
      } catch (error) {
        console.error(error);
        window.alert("Delete failed.");
      }
    },
    [loadOccurrences],
  );

  // ----- Derived data -----
  const sortedEvents = useMemo(
    () => [...events].sort((a, b) => new Date(a.start) - new Date(b.start)),
    [events],
  );

  const groupedEvents = useMemo(() => {
    const grouped = [];
    const map = new Map();

    sortedEvents.forEach((occurrence) => {
      const existing = map.get(occurrence.event_id);
      if (!existing) {
        const entry = { ...occurrence, occurrence_count: 1 };
        map.set(occurrence.event_id, entry);
        grouped.push(entry);
        return;
      }

      existing.occurrence_count += 1;
      if (new Date(occurrence.start) < new Date(existing.start)) {
        existing.start = occurrence.start;
        existing.end = occurrence.end;
      }
    });

    return grouped;
  }, [sortedEvents]);

  const uniqueMissionCount = groupedEvents.length;
  const hasEvents = uniqueMissionCount > 0;
  const eventCountLabel = hasEvents
    ? `${uniqueMissionCount} ${uniqueMissionCount === 1 ? "mission" : "missions"}`
    : "Chronological view of your activity.";

  const now = new Date();
  const nextEvent = sortedEvents.find((event) => new Date(event.end) > now);
  const nextEventTitle = nextEvent ? nextEvent.title : "No missions scheduled";
  const nextEventSummary = nextEvent
    ? nextEvent.description ||
      (nextEvent.is_recurring
        ? formatRecurrenceLabel(nextEvent.recurrence_frequency, nextEvent.recurrence_interval)
        : "Keep crew briefed and ready.")
    : "Create an event to populate your mission timeline.";
  const nextEventStart = nextEvent
    ? new Date(nextEvent.start).toLocaleString()
    : "Awaiting scheduling";
  const nextEventEnd = nextEvent ? new Date(nextEvent.end).toLocaleString() : "";
  const nextEventRecurrenceLabel =
    nextEvent && nextEvent.is_recurring
      ? formatRecurrenceLabel(nextEvent.recurrence_frequency, nextEvent.recurrence_interval)
      : "";

  const googleStatusLabel = googleLoading
    ? "Checking..."
    : googleStatus.connected
    ? "Connected"
    : "Not connected";
  const googleStatusTone = googleLoading
    ? "pending"
    : googleStatus.connected
    ? "positive"
    : "warn";

  const brightspaceStatusLabel = brightspaceLoading
    ? "Checking..."
    : brightspaceStatus.connected
    ? "Connected"
    : "Not connected";
  const brightspaceStatusTone = brightspaceLoading
    ? "pending"
    : brightspaceStatus.connected
    ? "positive"
    : "warn";

  const syncTimestamps = [];
  if (googleStatus.connected && googleStatus.last_synced_at) {
    syncTimestamps.push(new Date(googleStatus.last_synced_at).getTime());
  }
  if (brightspaceStatus.connected && brightspaceStatus.last_imported_at) {
    syncTimestamps.push(new Date(brightspaceStatus.last_imported_at).getTime());
  }

  const latestSyncTimestamp = syncTimestamps.length ? Math.max(...syncTimestamps) : null;
  const lastSyncValue = latestSyncTimestamp
    ? new Date(latestSyncTimestamp).toLocaleString()
    : "-";

  const anyIntegrationConnected = googleStatus.connected || brightspaceStatus.connected;

  const integrationCards = useMemo(
    () => [
      {
        key: "google",
        title: "Google sync",
        statusLabel: googleStatusLabel,
        statusTone: googleStatusTone,
        loading: googleLoading,
        loadingMessage: "Checking Google connection...",
        connected: googleStatus.connected,
        connectedDescription: (
          <>
            Connected as <strong>{googleStatus.email || "Unknown account"}</strong>
          </>
        ),
        disconnectedDescription: "Connect your Google Calendar to broadcast updates automatically.",
        onConnect: connectGoogle,
        onDisconnect: disconnectGoogle,
        working: googleWorking || syncWorking,
        connectLabel: (googleWorking || syncWorking) ? "Working..." : "Connect Google Calendar",
        disconnectLabel: "Disconnect",
      },
      {
        key: "brightspace",
        title: "Brightspace import",
        statusLabel: brightspaceStatusLabel,
        statusTone: brightspaceStatusTone,
        loading: brightspaceLoading,
        loadingMessage: "Checking Brightspace feed...",
        connected: brightspaceStatus.connected,
        connectedDescription: "Feed saved for rapid class imports.",
        disconnectedDescription: "Connect your Brightspace iCal feed to mirror class schedules.",
        onConnect: connectBrightspace,
        onDisconnect: disconnectBrightspace,
        working: brightspaceWorking || syncWorking,
        connectLabel:
          brightspaceWorking || syncWorking ? "Working..." : "Add Brightspace Feed",
        disconnectLabel: "Disconnect",
      },
    ],
    [
      googleStatusLabel,
      googleStatusTone,
      googleLoading,
      googleStatus.connected,
      googleStatus.email,
      connectGoogle,
      disconnectGoogle,
      googleWorking,
      syncWorking,
      brightspaceStatusLabel,
      brightspaceStatusTone,
      brightspaceLoading,
      brightspaceStatus.connected,
      connectBrightspace,
      disconnectBrightspace,
      brightspaceWorking,
    ],
  );

  const syncResultsWithLabels = useMemo(
    () =>
      syncResults.map((item) => ({
        ...item,
        statusLabel: SYNC_STATUS_LABEL[item.status] || "",
      })),
    [syncResults],
  );

  return (
    <>
      <Navigation />
      <main className="dashboard">
        <div className="dashboard-shell">
          <section className="dashboard-hero">
            <div className="dashboard-hero-text">
              <h1>Coordinate sorties with precision.</h1>
              <p>Plan missions, sync calendars, and keep every crew member aligned.</p>
              {toastMessage && (
                <div className={`dashboard-toast dashboard-toast--${toastMessage.type}`}>
                  {toastMessage.text}
                </div>
              )}
            </div>
            <div className="dashboard-hero-card">
              <span className="dashboard-hero-label">Next mission</span>
              <h3>{nextEventTitle}</h3>
              <p>{nextEventSummary}</p>
              <div className="dashboard-hero-meta">
                <span>{nextEventStart}</span>
                {nextEventEnd && <span>{nextEventEnd}</span>}
                {nextEventRecurrenceLabel && <span>{nextEventRecurrenceLabel}</span>}
              </div>
            </div>
          </section>

          <section className="dashboard-stats">
            <article className="dashboard-stat">
              <span className="dashboard-stat-label">Scheduled missions</span>
              <span className="dashboard-stat-value">{uniqueMissionCount}</span>
              <p>{hasEvents ? "Active sorties on the board." : "No missions yet."}</p>
            </article>

            {integrationCards.map((card) => (
              <IntegrationCard key={card.key} {...card} />
            ))}

            <article className="dashboard-stat">
              <span className="dashboard-stat-label">Last sync</span>
              <span className="dashboard-stat-value">{lastSyncValue}</span>
              {googleLoading || brightspaceLoading ? (
                <p className="dashboard-muted">Verifying sync status...</p>
              ) : anyIntegrationConnected ? (
                <p className="dashboard-paragraph">
                  {latestSyncTimestamp
                    ? "Latest activity across Google and Brightspace."
                    : "No sync activity recorded yet."}
                </p>
              ) : (
                <p className="dashboard-paragraph">
                  Connect Google or Brightspace to enable one-click sync.
                </p>
              )}
              <div className="dashboard-button-row dashboard-button-row--start">
                <button
                  type="button"
                  className="dashboard-button"
                  onClick={syncAll}
                  disabled={syncWorking || !anyIntegrationConnected}
                >
                  {syncWorking ? "Syncing..." : "Sync all"}
                </button>
              </div>
              {syncResultsWithLabels.length > 0 && (
                <ul className="dashboard-sync-results">
                  {syncResultsWithLabels.map((result) => (
                    <li
                      key={result.label}
                      className={`dashboard-sync-result dashboard-sync-result--${result.status}`}
                    >
                      <span className="dashboard-sync-result-label">{result.label}</span>
                      <span className="dashboard-sync-result-message">
                        {result.statusLabel && (
                          <span className="dashboard-sync-result-status">
                            {result.statusLabel}
                          </span>
                        )}
                        <span>{result.message}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </article>
          </section>

          <div className="dashboard-body">
            <section className="dashboard-panel dashboard-panel--list">
              <div className="dashboard-panel-heading">
                <div>
                  <h2>Mission log</h2>
                  <p>{!loading && hasEvents ? eventCountLabel : "Chronological view of your activity."}</p>
                </div>
              </div>
              {fetchError && <p className="dashboard-error">{fetchError}</p>}
              {loading ? (
                <p className="dashboard-muted">Loading...</p>
              ) : !hasEvents ? (
                <div className="dashboard-empty">
                  <h3>No missions yet</h3>
                  <p>Create your first event to populate the mission log.</p>
                </div>
              ) : (
                <ul className="dashboard-event-list">
                  {groupedEvents.map((ev) => (
                    <li className="dashboard-event" key={ev.event_id}>
                      <div className="dashboard-event-timeline">
                        <span className="dashboard-event-date">
                          {new Date(ev.start).toLocaleDateString()}
                        </span>
                        <span className="dashboard-event-time">
                          {new Date(ev.start).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}{" "}
                          -{" "}
                          {new Date(ev.end).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                      </div>
                      <div className="dashboard-event-content">
                        <div className="dashboard-event-header">
                          <strong>{ev.title}</strong>
                          {ev.source !== "local" && (
                            <span
                              className={`dashboard-tag ${
                                ev.source === "google"
                                  ? "dashboard-tag--google"
                                  : ev.source === "brightspace"
                                  ? "dashboard-tag--brightspace"
                                  : "dashboard-tag--sync"
                              }`}
                            >
                              {ev.source === "google"
                                ? "Google"
                                : ev.source === "brightspace"
                                ? "Brightspace"
                                : "Synced"}
                            </span>
                          )}
                          {ev.is_recurring && (
                            <span className="dashboard-tag dashboard-tag--recurring">
                              {formatRecurrenceLabel(
                                ev.recurrence_frequency,
                                ev.recurrence_interval,
                              )}
                            </span>
                          )}
                          {ev.all_day && (
                            <span className="dashboard-tag dashboard-tag--muted">All day</span>
                          )}
                        </div>
                        {ev.description && (
                          <p className="dashboard-event-desc">{ev.description}</p>
                        )}
                      </div>
                      <button
                        type="button"
                        className="dashboard-button dashboard-button--ghost"
                        onClick={() => handleDelete(ev.event_id, ev.is_recurring)}
                      >
                        Delete
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </div>
      </main>
    </>
  );
}

