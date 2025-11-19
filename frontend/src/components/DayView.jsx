import { useMemo, useState } from "react";
import EmojiPicker from "emoji-picker-react";
import api from "../api";
import "../styles/DayView.css";

const HOURS = Array.from({ length: 24 }, (_, i) => i); // 0-23

function formatHour(hour) {
  if (hour === 0) return "12 AM";
  if (hour === 12) return "12 PM";
  if (hour < 12) return `${hour} AM`;
  return `${hour - 12} PM`;
}

function getMinutesFromMidnight(date) {
  const d = new Date(date);
  return d.getHours() * 60 + d.getMinutes();
}

function getDurationMinutes(start, end) {
  return (new Date(end) - new Date(start)) / (1000 * 60);
}

function DayView({ date, events, onClose, onCreateEvent, onEventUpdated }) {
  const [editingEvent, setEditingEvent] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const dateString = useMemo(() => {
    const d = new Date(date);
    return d.toLocaleDateString(undefined, {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  }, [date]);

  const eventBars = useMemo(() => {
    return events.map((event) => {
      const startMinutes = getMinutesFromMidnight(event.start);
      const duration = getDurationMinutes(event.start, event.end);

      // Position: percentage from top (0% = midnight, 100% = end of day)
      const topPercent = (startMinutes / (24 * 60)) * 100;
      // Height: percentage of day
      const heightPercent = (duration / (24 * 60)) * 100;

      // Format time display
      const startTime = new Date(event.start).toLocaleTimeString([], {
        hour: "numeric",
        minute: "2-digit",
      });
      const endTime = new Date(event.end).toLocaleTimeString([], {
        hour: "numeric",
        minute: "2-digit",
      });

      // Color based on urgency, then event source
      let colorClass;
      if (event.urgency_color === "red") {
        colorClass = "day-view-event--urgent";
      } else if (event.urgency_color === "yellow") {
        colorClass = "day-view-event--soon";
      } else if (event.source === "google") {
        colorClass = "day-view-event--google";
      } else if (event.source === "brightspace") {
        colorClass = "day-view-event--brightspace";
      } else if (event.recurrence_frequency && event.recurrence_frequency !== "none") {
        colorClass = "day-view-event--recurring";
      } else {
        colorClass = "day-view-event--default";
      }

      return {
        ...event,
        topPercent,
        heightPercent: Math.max(heightPercent, 2), // Minimum 2% height for visibility
        startTime,
        endTime,
        duration,
        colorClass,
      };
    });
  }, [events]);

  const hasEvents = events.length > 0;

  const handleEventClick = (event) => {
    setEditingEvent(event);
    setEditForm({
      title: event.title || "",
      description: event.description || "",
      start: new Date(event.start).toISOString().slice(0, 16),
      end: new Date(event.end).toISOString().slice(0, 16),
      all_day: event.all_day || false,
      emoji: event.emoji || "",
    });
    setError("");
    setShowEmojiPicker(false);
  };

  const handleCloseEdit = () => {
    setEditingEvent(null);
    setEditForm({});
    setError("");
    setShowEmojiPicker(false);
  };

  const handleEditChange = (e) => {
    const { name, value, type, checked } = e.target;
    setEditForm((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value,
    }));
  };

  const handleSaveEdit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError("");

    try {
      const payload = {
        title: editForm.title.trim(),
        description: editForm.description.trim(),
        start: new Date(editForm.start).toISOString(),
        end: new Date(editForm.end).toISOString(),
        all_day: editForm.all_day,
        emoji: editForm.emoji || "",
      };

      const eventId = editingEvent.event_id || editingEvent.id;
      await api.patch(`/api/events/${eventId}/`, payload);

      handleCloseEdit();
      if (onEventUpdated) {
        onEventUpdated();
      }
    } catch (err) {
      console.error("Failed to update event:", err);
      setError(err.response?.data?.detail || "Failed to update event");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteEvent = async () => {
    if (!confirm("Are you sure you want to delete this event?")) {
      return;
    }

    setSaving(true);
    setError("");

    try {
      const eventId = editingEvent.event_id || editingEvent.id;
      await api.delete(`/api/events/${eventId}/`);
      handleCloseEdit();
      if (onEventUpdated) {
        onEventUpdated();
      }
    } catch (err) {
      console.error("Failed to delete event:", err);
      setError(err.response?.data?.detail || "Failed to delete event");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="day-view-overlay" onClick={onClose}>
      <div className="day-view-modal" onClick={(e) => e.stopPropagation()}>
        <div className="day-view-header">
          <div>
            <h2>{dateString}</h2>
            <p className="day-view-subtitle">
              {hasEvents ? `${events.length} event${events.length > 1 ? "s" : ""}` : "No events"}
            </p>
          </div>
          <div className="day-view-header-actions">
            {onCreateEvent && (
              <button
                type="button"
                className="day-view-btn day-view-btn--primary"
                onClick={onCreateEvent}
              >
                + Create Event
              </button>
            )}
            <button
              type="button"
              className="day-view-btn day-view-btn--close"
              onClick={onClose}
              aria-label="Close"
            >
              ×
            </button>
          </div>
        </div>

        <div className="day-view-content">
          <div className="day-view-timeline">
            {/* Hour labels */}
            <div className="day-view-hours">
              {HOURS.map((hour) => (
                <div key={hour} className="day-view-hour">
                  <span className="day-view-hour-label">{formatHour(hour)}</span>
                  <div className="day-view-hour-line" />
                </div>
              ))}
            </div>

            {/* Event bars */}
            <div className="day-view-events">
              {!hasEvents && (
                <div className="day-view-empty">
                  <p>No events scheduled for this day</p>
                </div>
              )}
              {eventBars.map((bar) => (
                <div
                  key={bar.occurrence_id || bar.id}
                  className={`day-view-event ${bar.colorClass}`}
                  style={{
                    top: `${bar.topPercent}%`,
                    height: `${bar.heightPercent}%`,
                  }}
                  title={`${bar.title}\n${bar.startTime} - ${bar.endTime}`}
                  onClick={() => handleEventClick(bar)}
                >
                  <div className="day-view-event-content">
                    <strong className="day-view-event-title">
                      {bar.emoji ? `${bar.emoji} ` : (
                        bar.urgency_color === "red" ? "😡 " :
                        bar.urgency_color === "yellow" ? "😢 " :
                        bar.urgency_color === "green" ? "😊 " : ""
                      )}
                      {bar.title}
                    </strong>
                    <span className="day-view-event-time">
                      {bar.startTime} - {bar.endTime}
                    </span>
                    {bar.description && (
                      <p className="day-view-event-description">{bar.description}</p>
                    )}
                    {bar.recurrence_frequency && bar.recurrence_frequency !== "none" && (
                      <span className="day-view-event-badge">Recurring</span>
                    )}
                    {bar.source === "google" && (
                      <span className="day-view-event-badge">Google</span>
                    )}
                    {bar.source === "brightspace" && (
                      <span className="day-view-event-badge">Brightspace</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Edit Event Modal */}
      {editingEvent && (
        <div className="day-view-edit-overlay" onClick={handleCloseEdit}>
          <div className="day-view-edit-modal" onClick={(e) => e.stopPropagation()}>
            <div className="day-view-edit-header">
              <h3>Edit Event</h3>
              <button
                type="button"
                className="day-view-btn--close"
                onClick={handleCloseEdit}
                aria-label="Close"
              >
                ×
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="day-view-edit-form">
              <label>
                <span>Title</span>
                <input
                  type="text"
                  name="title"
                  value={editForm.title}
                  onChange={handleEditChange}
                  required
                  disabled={saving}
                />
              </label>

              <label>
                <span>Description</span>
                <textarea
                  name="description"
                  value={editForm.description}
                  onChange={handleEditChange}
                  rows={3}
                  disabled={saving}
                />
              </label>

              <div>
                <span style={{ display: "block", marginBottom: "0.5rem", fontWeight: 600, color: "var(--text-primary)", fontSize: "0.9rem" }}>Emoji (optional)</span>
                <div className="emoji-selector">
                  <button
                    type="button"
                    className="emoji-selector-btn"
                    onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                    disabled={saving}
                  >
                    {editForm.emoji || "😊"} Choose Emoji
                  </button>
                  {showEmojiPicker && (
                    <div className="emoji-picker-wrapper">
                      <EmojiPicker
                        onEmojiClick={(emojiData) => {
                          setEditForm({ ...editForm, emoji: emojiData.emoji });
                          setShowEmojiPicker(false);
                        }}
                        autoFocusSearch={false}
                        theme="light"
                        height={350}
                        width="100%"
                        emojiStyle="twitter"
                        previewConfig={{ showPreview: false }}
                      />
                    </div>
                  )}
                  {editForm.emoji && (
                    <button
                      type="button"
                      className="emoji-clear-btn"
                      onClick={() => setEditForm({ ...editForm, emoji: "" })}
                      disabled={saving}
                    >
                      Clear
                    </button>
                  )}
                </div>
              </div>

              {!editForm.all_day && (
                <>
                  <label>
                    <span>Start</span>
                    <input
                      type="datetime-local"
                      name="start"
                      value={editForm.start}
                      onChange={handleEditChange}
                      required
                      disabled={saving}
                    />
                  </label>

                  <label>
                    <span>End</span>
                    <input
                      type="datetime-local"
                      name="end"
                      value={editForm.end}
                      onChange={handleEditChange}
                      required
                      disabled={saving}
                    />
                  </label>
                </>
              )}

              <label className="day-view-edit-checkbox">
                <input
                  type="checkbox"
                  name="all_day"
                  checked={editForm.all_day}
                  onChange={handleEditChange}
                  disabled={saving}
                />
                <span>All day</span>
              </label>

              {editingEvent.source === "google" && (
                <p className="day-view-edit-note">
                  ℹ️ Changes will sync to Google Calendar
                </p>
              )}

              {error && <p className="day-view-edit-error">{error}</p>}

              <div className="day-view-edit-actions">
                <button
                  type="button"
                  className="day-view-btn day-view-btn--danger"
                  onClick={handleDeleteEvent}
                  disabled={saving}
                >
                  Delete
                </button>
                <div style={{ flex: 1 }} />
                <button
                  type="button"
                  className="day-view-btn day-view-btn--secondary"
                  onClick={handleCloseEdit}
                  disabled={saving}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="day-view-btn day-view-btn--primary"
                  disabled={saving}
                >
                  {saving ? "Saving..." : "Save Changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default DayView;
