import { useCallback, useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import api from "../api";
import Navigation from "../components/Navigation";
import "../styles/Dashboard.css";

function formatRecurrenceLabel(frequency, interval) {
  if (!frequency || frequency === "none") {
    return "";
  }
  const unitMap = {
    daily: "day",
    weekly: "week",
    monthly: "month",
    yearly: "year",
  };
  const unit = unitMap[frequency] || "cycle";
  if (interval === 1) {
    return `Repeats every ${unit}`;
  }
  return `Repeats every ${interval} ${unit}${interval > 1 ? "s" : ""}`;
}

const RSVP_STATUS_LABELS = {
  needsAction: "Awaiting response",
  accepted: "Accepted",
  declined: "Declined",
  tentative: "Tentative",
};

const RSVP_ACTIONS = ["accepted", "tentative", "declined"];

const getRsvpLabel = (status) => RSVP_STATUS_LABELS[status] || status;

export default function Dashboard() {
  const location = useLocation();
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState("");
  const [googleStatus, setGoogleStatus] = useState({ connected: false });
  const [googleLoading, setGoogleLoading] = useState(true);
  const [googleWorking, setGoogleWorking] = useState(false);
  const [googleMessage, setGoogleMessage] = useState(null);
  const [brightspaceLinked, setBrightspaceLinked] = useState(false);
  const [brightspaceWorking, setBrightspaceWorking] = useState(false);
  const [brightspaceMessage, setBrightspaceMessage] = useState("");
  const [gmailWatchActive, setGmailWatchActive] = useState(false);
  const [gmailWatchWorking, setGmailWatchWorking] = useState(false);
  const [gmailWatchMessage, setGmailWatchMessage] = useState("");
  const [gmailWatchExpiry, setGmailWatchExpiry] = useState(null);
  const [rsvpWorking, setRsvpWorking] = useState(null);
  const [rsvpMessage, setRsvpMessage] = useState(null);

  const fetchOccurrences = useCallback(async () => {
    try {
      setLoading(true);
      setFetchError("");
      const { data } = await api.get("/api/events/occurrences/");
      setEvents(data);
    } catch {
      setFetchError("Failed to load events.");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadGoogleStatus = useCallback(async () => {
    try {
      setGoogleLoading(true);
      const { data } = await api.get("/api/google/status/");
      setGoogleStatus({
        connected: data.connected,
        email: data.email,
        last_synced_at: data.last_synced_at,
        scopes: data.scopes,
      });
    } catch {
      setGoogleStatus({ connected: false });
    } finally {
      setGoogleLoading(false);
    }
  }, []);

  const loadGmailWatchStatus = useCallback(async () => {
    if (!googleStatus.connected) {
      setGmailWatchActive(false);
      return;
    }
    try {
      const { data } = await api.get("/api/gmail/watch/");
      setGmailWatchActive(data.active);
      setGmailWatchExpiry(data.expires_at);
    } catch {
      setGmailWatchActive(false);
    }
  }, [googleStatus.connected]);

  useEffect(() => {
    fetchOccurrences();
  }, [fetchOccurrences]);

  useEffect(() => {
    loadGoogleStatus();
  }, [loadGoogleStatus]);

  useEffect(() => {
    loadGmailWatchStatus();
  }, [loadGmailWatchStatus]);

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
      if (imported > 0) {
        pieces.push(`imported ${imported} new event${imported === 1 ? "" : "s"}`);
      }
      if (linked > 0) {
        pieces.push(`linked ${linked} existing event${linked === 1 ? "" : "s"}`);
      }
      if (deduped > 0) {
        pieces.push(`removed ${deduped} duplicate${deduped === 1 ? "" : "s"}`);
      }
      const suffix = pieces.length ? ` - ${pieces.join(", ")}` : "";
      setGoogleMessage({
        type: "success",
        text: `Google Calendar connected${suffix}.`,
      });
      loadGoogleStatus();
      fetchOccurrences();
    } else {
      const message = params.get("message") || "unknown_error";
      setGoogleMessage({
        type: "error",
        text: `Google Calendar connection failed (${message}).`,
      });
    }
    window.history.replaceState({}, "", location.pathname);
  }, [location, loadGoogleStatus, fetchOccurrences]);

  const connectGoogle = useCallback(async () => {
    setGoogleWorking(true);
    setGoogleMessage(null);
    try {
      const { data } = await api.post("/api/google/oauth/start/");
      window.location.href = data.auth_url;
    } catch {
      setGoogleWorking(false);
      setGoogleMessage({
        type: "error",
        text: "Could not start Google authorization. Please try again.",
      });
    }
  }, []);

  const syncGoogle = useCallback(async () => {
    setGoogleWorking(true);
    setGoogleMessage(null);
    try {
      const { data } = await api.post("/api/google/sync/");
      const stats = data.stats || {};
      const summaries = [
        ["created", "created"],
        ["updated", "updated"],
        ["deleted", "deleted"],
        ["pushed", "pushed"],
        ["linked_existing", "linked existing"],
        ["deduped", "removed duplicates"],
        ["google_deleted", "deleted in Google"],
      ];
      const detailParts = summaries
        .filter(([key]) => stats[key])
        .map(([key, label]) => `${label} ${stats[key]}`);
      const detailText =
        detailParts.length > 0 ? detailParts.join(", ") : "no changes detected";
      setGoogleMessage({
        type: "success",
        text: `Google Calendar synced (${detailText}).`,
      });
      await fetchOccurrences();
      await loadGoogleStatus();
    } catch {
      setGoogleMessage({
        type: "error",
        text: "Google sync failed.",
      });
    } finally {
      setGoogleWorking(false);
    }
  }, [fetchOccurrences, loadGoogleStatus]);

  const loadBrightspaceStatus = useCallback(async () => {
    try {
      const { data } = await api.get("/api/calendar/brightspace/import/");
      if (data.connected) {
        setBrightspaceLinked(true);
        if (data.last_imported_at) {
          setBrightspaceMessage(
            `Last import: ${new Date(data.last_imported_at).toLocaleString()}`,
          );
        } else {
          setBrightspaceMessage("Feed linked.");
        }
      } else {
        setBrightspaceLinked(false);
        setBrightspaceMessage("");
      }
    } catch {
      setBrightspaceLinked(false);
    }
  }, []);

  useEffect(() => {
    loadBrightspaceStatus();
  }, [loadBrightspaceStatus]);

  const handleConnectBrightspace = useCallback(async () => {
    if (brightspaceWorking) return;
    const input = window.prompt("Enter your Brightspace iCal subscription URL:");
    if (!input) {
      return;
    }
    const trimmed = input.trim();
    if (!trimmed) {
      return;
    }
    setBrightspaceWorking(true);
    setBrightspaceMessage("");
    try {
      const { data } = await api.post("/api/calendar/brightspace/import/", { ics_url: trimmed });
      setBrightspaceLinked(true);
      setBrightspaceMessage(`Imported ${data.created} new, updated ${data.updated}.`);
      await fetchOccurrences();
    } catch (err) {
      const message = err.response?.data?.detail || "Failed to import Brightspace calendar.";
      setBrightspaceMessage(message);
      setBrightspaceLinked(false);
    } finally {
      setBrightspaceWorking(false);
    }
  }, [brightspaceWorking, fetchOccurrences]);

  const handleRefreshBrightspace = useCallback(async () => {
    if (brightspaceWorking) return;
    setBrightspaceWorking(true);
    setBrightspaceMessage("");
    try {
      const { data } = await api.post("/api/calendar/brightspace/import/", {});
      setBrightspaceLinked(true);
      setBrightspaceMessage(`Refreshed: imported ${data.created}, updated ${data.updated}.`);
      await fetchOccurrences();
    } catch (err) {
      const message = err.response?.data?.detail || "Failed to refresh Brightspace calendar.";
      setBrightspaceMessage(message);
      if (err.response?.status === 400) {
        setBrightspaceLinked(false);
      }
    } finally {
      setBrightspaceWorking(false);
    }
  }, [brightspaceWorking, fetchOccurrences]);

  const handleStartGmailWatch = useCallback(async () => {
    if (gmailWatchWorking) return;
    setGmailWatchWorking(true);
    setGmailWatchMessage("");
    try {
      const { data } = await api.post("/api/gmail/watch/");
      setGmailWatchActive(true);
      setGmailWatchExpiry(data.watch?.expires_at);
      setGmailWatchMessage("Gmail monitoring enabled! Events will be auto-created from calendar emails.");
    } catch (err) {
      const message = err.response?.data?.error || "Failed to enable Gmail monitoring.";
      setGmailWatchMessage(message);
      setGmailWatchActive(false);
    } finally {
      setGmailWatchWorking(false);
    }
  }, [gmailWatchWorking]);

  const handleStopGmailWatch = useCallback(async () => {
    if (gmailWatchWorking) return;
    setGmailWatchWorking(true);
    setGmailWatchMessage("");
    try {
      await api.delete("/api/gmail/watch/");
      setGmailWatchActive(false);
      setGmailWatchExpiry(null);
      setGmailWatchMessage("Gmail monitoring disabled.");
    } catch (err) {
      const message = err.response?.data?.error || "Failed to disable Gmail monitoring.";
      setGmailWatchMessage(message);
    } finally {
      setGmailWatchWorking(false);
    }
  }, [gmailWatchWorking]);

  const handleRsvp = useCallback(
    async (eventId, response) => {
      setRsvpWorking({ eventId, response });
      setRsvpMessage(null);
      try {
        await api.post(`/api/events/${eventId}/rsvp/`, { response });
        setRsvpMessage({
          type: "success",
          text:
            response === "declined"
              ? "Invitation declined."
              : `RSVP updated: ${getRsvpLabel(response)}.`,
        });
        await fetchOccurrences();
      } catch (err) {
        const detail = err.response?.data?.detail;
        setRsvpMessage({
          type: "error",
          text: detail || "Unable to update RSVP. Please try again.",
        });
      } finally {
        setRsvpWorking(null);
      }
    },
    [fetchOccurrences],
  );

  const disconnectGoogle = useCallback(async () => {
    setGoogleWorking(true);
    setGoogleMessage(null);
    try {
      await api.delete("/api/google/disconnect/");
      setGoogleMessage({
        type: "success",
        text: "Google Calendar disconnected.",
      });
      await loadGoogleStatus();
    } catch {
      setGoogleMessage({
        type: "error",
        text: "Failed to disconnect Google Calendar.",
      });
    } finally {
      setGoogleWorking(false);
    }
  }, [loadGoogleStatus]);

  const onDelete = async (eventId, isRecurring) => {
    const message = isRecurring
      ? "Delete this entire recurring mission?"
      : "Delete this mission?";
    if (!window.confirm(message)) return;
    try {
      await api.delete(`/api/events/${eventId}/`);
      await fetchOccurrences();
    } catch {
      window.alert("Delete failed.");
    }
  };

  const sortedEvents = [...events].sort(
    (a, b) => new Date(a.start) - new Date(b.start),
  );
  const groupedEvents = [];
  const groupedMap = new Map();

  sortedEvents.forEach((occurrence) => {
    const key = occurrence.event_id;
    const existing = groupedMap.get(key);
    if (!existing) {
      const groupEntry = {
        ...occurrence,
        occurrence_count: 1,
      };
      groupedMap.set(key, groupEntry);
      groupedEvents.push(groupEntry);
    } else {
      existing.occurrence_count += 1;
      if (new Date(occurrence.start) < new Date(existing.start)) {
        existing.start = occurrence.start;
        existing.end = occurrence.end;
      }
    }
  });

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
  const nextEventEnd = nextEvent
    ? new Date(nextEvent.end).toLocaleString()
    : "";
  const nextEventRecurrenceLabel =
    nextEvent && nextEvent.is_recurring
      ? formatRecurrenceLabel(nextEvent.recurrence_frequency, nextEvent.recurrence_interval)
      : "";

  return (
    <>
      <Navigation />
      <main className="dashboard">
        <div className="dashboard-shell">

        <section className="dashboard-hero">
          <div className="dashboard-hero-text">
            <h1>Coordinate sorties with precision.</h1>
            <p>Plan missions, sync calendars, and keep every crew member aligned.</p>
            {googleMessage && (
              <div className={`dashboard-toast dashboard-toast--${googleMessage.type}`}>
                {googleMessage.text}
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
          <article className="dashboard-stat">
            <span className="dashboard-stat-label">Google sync</span>
            {googleLoading ? (
              <span className="dashboard-stat-value">Checking…</span>
            ) : googleStatus.connected ? (
              <>
                <span className="dashboard-stat-value">Connected</span>
                <p>{`Connected as ${googleStatus.email}`}</p>
                <div className="dashboard-stat-actions">
                  <button
                    type="button"
                    className="dashboard-stat-button"
                    onClick={syncGoogle}
                    disabled={googleWorking}
                  >
                    {googleWorking ? "Working..." : "Sync now"}
                  </button>
                  <button
                    type="button"
                    className="dashboard-stat-button dashboard-stat-button--ghost"
                    onClick={disconnectGoogle}
                    disabled={googleWorking}
                  >
                    Disconnect
                  </button>
                </div>
              </>
            ) : (
              <button
                type="button"
                className="dashboard-stat-button dashboard-stat-button--full"
                onClick={connectGoogle}
                disabled={googleWorking}
              >
                {googleWorking ? "Working..." : "Not connected"}
              </button>
            )}
            <div className="dashboard-stat-divider" aria-hidden="true" />
            <span className="dashboard-stat-label">Brightspace sync</span>
            {brightspaceLinked ? (
              <>
                <div className="dashboard-stat-actions">
                  <button
                    type="button"
                    className="dashboard-stat-button"
                    onClick={handleRefreshBrightspace}
                    disabled={brightspaceWorking}
                  >
                    {brightspaceWorking ? "Working..." : "Refresh feed"}
                  </button>
                  <button
                    type="button"
                    className="dashboard-stat-button dashboard-stat-button--ghost"
                    onClick={handleConnectBrightspace}
                    disabled={brightspaceWorking}
                  >
                    Change URL
                  </button>
                </div>
                {brightspaceMessage && (
                  <p className="dashboard-stat-note">{brightspaceMessage}</p>
                )}
              </>
            ) : (
              <>
                <button
                  type="button"
                  className="dashboard-stat-button dashboard-stat-button--full"
                  onClick={handleConnectBrightspace}
                  disabled={brightspaceWorking}
                >
                  {brightspaceWorking ? "Working..." : "Not connected"}
                </button>
                {brightspaceMessage && (
                  <p className="dashboard-stat-note dashboard-stat-note--warn">
                    {brightspaceMessage}
                  </p>
                )}
              </>
            )}
            <div className="dashboard-stat-divider" aria-hidden="true" />
            <span className="dashboard-stat-label">Gmail auto-parse</span>
            {googleStatus.connected ? (
              gmailWatchActive ? (
                <>
                  <span className="dashboard-stat-value">Active</span>
                  <p>Automatically creating events from calendar emails</p>
                </>
              ) : (
                <>
                  <span className="dashboard-stat-value">Initializing...</span>
                  <p>Gmail monitoring will start automatically</p>
                </>
              )
            ) : (
              <>
                <span className="dashboard-stat-value">—</span>
                <p>Connect Google Calendar to enable</p>
              </>
            )}
          </article>
          <article className="dashboard-stat">
            <span className="dashboard-stat-label">Last sync</span>
            <span className="dashboard-stat-value">
              {googleStatus.connected && googleStatus.last_synced_at
                ? new Date(googleStatus.last_synced_at).toLocaleString()
                : "—"}
            </span>
            <p>Keep missions aligned across every device.</p>
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
            {rsvpMessage && (
              <p className={`dashboard-banner dashboard-banner--${rsvpMessage.type}`}>
                {rsvpMessage.text}
              </p>
            )}
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
                {groupedEvents.map((ev) => {
                  const isRsvpUpdating =
                    rsvpWorking && rsvpWorking.eventId === ev.event_id;
                  const attendeeSummary =
                    ev.attendees && ev.attendees.length > 0
                      ? ev.attendees
                          .map((attendee) => {
                            const label = attendee.display_name || attendee.email;
                            if (attendee.is_self) {
                              const statusLabel = attendee.response_status
                                ? getRsvpLabel(attendee.response_status).toLowerCase()
                                : "";
                              return statusLabel
                                ? `${label} (you, ${statusLabel})`
                                : `${label} (you)`;
                            }
                            if (
                              attendee.response_status &&
                              attendee.response_status !== "needsAction"
                            ) {
                              return `${label} (${getRsvpLabel(attendee.response_status).toLowerCase()})`;
                            }
                            return label;
                          })
                          .join(", ")
                      : "";

                  return (
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
                              {formatRecurrenceLabel(ev.recurrence_frequency, ev.recurrence_interval)}
                            </span>
                          )}
                          {ev.all_day && (
                            <span className="dashboard-tag dashboard-tag--muted">
                              All day
                            </span>
                          )}
                          {ev.can_rsvp && ev.self_response_status && (
                            <span
                              className={`dashboard-tag dashboard-tag--rsvp dashboard-tag--rsvp-${ev.self_response_status}`}
                            >
                              {getRsvpLabel(ev.self_response_status)}
                            </span>
                          )}
                        </div>
                        {ev.description && (
                          <p className="dashboard-event-desc">{ev.description}</p>
                        )}
                        {attendeeSummary && (
                          <p className="dashboard-event-attendees">{attendeeSummary}</p>
                        )}
                        <div className="dashboard-event-actions">
                          {ev.can_rsvp && (
                            <div className="dashboard-event-rsvp">
                              <span className="dashboard-event-rsvp-label">
                                {ev.self_response_status === "needsAction"
                                  ? "Awaiting your response"
                                  : `You responded: ${getRsvpLabel(ev.self_response_status)}`}
                              </span>
                              <div className="dashboard-event-rsvp-buttons">
                                {RSVP_ACTIONS.map((action) => {
                                  const isActive = ev.self_response_status === action;
                                  const buttonLabel =
                                    action === "accepted"
                                      ? "Accept"
                                      : action === "tentative"
                                      ? "Maybe"
                                      : "Decline";
                                  const isSaving =
                                    isRsvpUpdating && rsvpWorking?.response === action;
                                  return (
                                    <button
                                      key={action}
                                      type="button"
                                      className={`dashboard-event-rsvp-button${
                                        isActive ? " dashboard-event-rsvp-button--active" : ""
                                      }`}
                                      onClick={() => handleRsvp(ev.event_id, action)}
                                      disabled={isRsvpUpdating}
                                    >
                                      {isSaving ? "Saving..." : buttonLabel}
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          )}
                          <button
                            type="button"
                            className="dashboard-button dashboard-button--ghost"
                            onClick={() => onDelete(ev.event_id, ev.is_recurring)}
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>
        </div>
      </main>
    </>
  );
}
