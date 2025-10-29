import { useCallback, useEffect, useMemo, useState } from "react";
import Navigation from "../components/Navigation";
import DayView from "../components/DayView";
import api from "../api";
import "../styles/Calendar.css";

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function isoLocal(date) {
  const d = new Date(date);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const h = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${y}-${m}-${day}T${h}:${min}`;
}

function isoDate(date) {
  const d = new Date(date);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function createInitialForm(baseDate = new Date()) {
  const start = new Date(baseDate);
  start.setHours(9, 0, 0, 0);
  const end = new Date(start.getTime() + 60 * 60 * 1000);
  return {
    title: "",
    description: "",
    startDateTime: isoLocal(start),
    endDateTime: isoLocal(end),
    startDate: isoDate(start),
    all_day: false,
    recurrence_enabled: false,
    recurrence_frequency: "weekly",
    recurrence_interval: 1,
    invitees: "",
  };
}

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

function getMonthKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function startOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function endOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999);
}

function addMonths(date, amount) {
  const copy = new Date(date);
  copy.setMonth(copy.getMonth() + amount);
  return copy;
}

function formatMonthTitle(date) {
  return date.toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

function groupEventsByDay(events) {
  const map = new Map();
  events.forEach((event) => {
    const key = new Date(event.start).toISOString().slice(0, 10);
    if (!map.has(key)) {
      map.set(key, []);
    }
    map.get(key).push(event);
  });
  return map;
}

function Calendar() {
  const [referenceDate, setReferenceDate] = useState(startOfMonth(new Date()));
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [form, setForm] = useState(() => createInitialForm());
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");
  const [isDayViewOpen, setIsDayViewOpen] = useState(false);
  const [selectedDayCell, setSelectedDayCell] = useState(null);

  const currentMonthKey = useMemo(() => getMonthKey(referenceDate), [referenceDate]);

  const refreshOccurrences = useCallback(
    async (targetDate) => {
      const month = targetDate ?? referenceDate;
      setLoading(true);
      setError("");
      try {
        const monthStart = startOfMonth(month);
        const monthEnd = endOfMonth(month);
        const params = new URLSearchParams({
          start: monthStart.toISOString(),
          end: monthEnd.toISOString(),
        });
        const { data } = await api.get(`/api/events/occurrences/?${params.toString()}`);
        setEvents(data);
      } catch (err) {
        console.error(err);
        setError("Failed to load calendar events.");
      } finally {
        setLoading(false);
      }
    },
    [referenceDate],
  );

  useEffect(() => {
    refreshOccurrences(referenceDate);
  }, [referenceDate, refreshOccurrences]);

  const eventsByDay = useMemo(() => groupEventsByDay(events), [events]);

  const calendarCells = useMemo(() => {
    const firstDay = startOfMonth(referenceDate);
    const lastDay = endOfMonth(referenceDate);
    const firstWeekday = firstDay.getDay();
    const daysInMonth = lastDay.getDate();

    const cells = [];
    const totalCells = Math.ceil((firstWeekday + daysInMonth) / 7) * 7;
    for (let cellIndex = 0; cellIndex < totalCells; cellIndex += 1) {
      const dayOffset = cellIndex - firstWeekday;
      const cellDate = new Date(referenceDate);
      cellDate.setDate(1 + dayOffset);

      const inCurrentMonth = cellDate.getMonth() === referenceDate.getMonth();
      const displayDate = inCurrentMonth ? cellDate.getDate() : cellDate.getDate();
      const dayKey = cellDate.toISOString().slice(0, 10);
      const dayEvents = eventsByDay.get(dayKey) ?? [];

      cells.push({
        id: `${cellDate.toISOString()}-${cellIndex}`,
        date: cellDate,
        label: displayDate,
        inCurrentMonth,
        events: dayEvents,
      });
    }
    return cells;
  }, [referenceDate, eventsByDay]);

  const handlePrevMonth = () => setReferenceDate((date) => startOfMonth(addMonths(date, -1)));
  const handleNextMonth = () => setReferenceDate((date) => startOfMonth(addMonths(date, 1)));
  const handleToday = () => setReferenceDate(startOfMonth(new Date()));
  const handleCloseModal = () => {
    setIsModalOpen(false);
    setFormError("");
  };

  const handleDayClick = (cell) => {
    if (!cell.inCurrentMonth) {
      return;
    }

    // Always show day view for any clicked day
    setSelectedDayCell(cell);
    setIsDayViewOpen(true);
  };

  const handleCloseDayView = () => {
    setIsDayViewOpen(false);
    setSelectedDayCell(null);
  };

  const handleCreateFromDayView = () => {
    if (selectedDayCell) {
      const initialForm = createInitialForm(selectedDayCell.date);
      setForm(initialForm);
      setFormError("");
      setIsDayViewOpen(false);
      setIsModalOpen(true);
    }
  };

  const onFormChange = (e) => {
    const { name, value, type, checked } = e.target;
    setForm((f) => {
      if (name === "all_day") {
        if (checked) {
          const start = new Date(f.startDateTime);
          return {
            ...f,
            all_day: true,
            startDate: isoDate(start),
          };
        }
        return {
          ...f,
          all_day: false,
        };
      }
      if (name === "startDate") {
        if (!value) {
          return { ...f, startDate: value };
        }
        const base = new Date(value);
        if (Number.isNaN(base.getTime())) {
          return { ...f, startDate: value };
        }
        const startDateTime = new Date(f.startDateTime);
        startDateTime.setFullYear(
          base.getFullYear(),
          base.getMonth(),
          base.getDate(),
        );
        const endDateTime = new Date(f.endDateTime);
        endDateTime.setFullYear(
          base.getFullYear(),
          base.getMonth(),
          base.getDate(),
        );
        return {
          ...f,
          startDate: value,
          startDateTime: isoLocal(startDateTime),
          endDateTime: isoLocal(endDateTime),
        };
      }
      if (name === "startDateTime") {
        let nextEnd = f.endDateTime;
        const newStart = new Date(value);
        if (!Number.isNaN(newStart.getTime())) {
          const currentEnd = new Date(f.endDateTime);
          if (Number.isNaN(currentEnd.getTime()) || currentEnd <= newStart) {
            const bumped = new Date(newStart.getTime() + 60 * 60 * 1000);
            nextEnd = isoLocal(bumped);
          }
        }
        return {
          ...f,
          startDateTime: value,
          endDateTime: nextEnd,
          startDate: value ? isoDate(value) : f.startDate,
        };
      }
      if (name === "recurrence_enabled") {
        const enabled = !!checked;
        return {
          ...f,
          recurrence_enabled: enabled,
          recurrence_frequency: enabled ? f.recurrence_frequency || "weekly" : "weekly",
          recurrence_interval: enabled ? f.recurrence_interval || 1 : 1,
        };
      }
      if (name === "recurrence_frequency") {
        return {
          ...f,
          recurrence_frequency: value,
        };
      }
      if (name === "recurrence_interval") {
        const parsed = Math.max(1, Number(value) || 1);
        return {
          ...f,
          recurrence_interval: parsed,
        };
      }
      return {
        ...f,
        [name]: type === "checkbox" ? checked : value,
      };
    });
  };


  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setFormError("");

    let startDateValue;
    let endDateValue;

    if (form.all_day) {
      if (!form.startDate) {
        setFormError("Please choose a date.");
        setSubmitting(false);
        return;
      }
      const day = new Date(form.startDate);
      if (Number.isNaN(day.getTime())) {
        setFormError("Invalid date selected.");
        setSubmitting(false);
        return;
      }
      day.setHours(0, 0, 0, 0);
      startDateValue = day;
      const endOfDay = new Date(day);
      endOfDay.setHours(23, 59, 59, 999);
      endDateValue = endOfDay;
    } else {
      startDateValue = new Date(form.startDateTime);
      endDateValue = new Date(form.endDateTime);
      if (Number.isNaN(startDateValue.getTime()) || Number.isNaN(endDateValue.getTime())) {
        setFormError("Please provide valid start and end times.");
        setSubmitting(false);
        return;
      }
      if (endDateValue < startDateValue) {
        setFormError("End must be after start.");
        setSubmitting(false);
        return;
      }
    }

    const isRecurring = !!form.recurrence_enabled;
    const payload = {
      title: form.title.trim(),
      description: form.description.trim(),
      all_day: !!form.all_day,
      start: startDateValue.toISOString(),
      end: endDateValue.toISOString(),
      recurrence_frequency: isRecurring ? form.recurrence_frequency : "none",
      recurrence_interval: isRecurring ? Number(form.recurrence_interval || 1) : 1,
      recurrence_count: null,
      recurrence_end_date: null,
    };

    const invitees = (form.invitees || "")
      .split(/[\n,]/)
      .map((item) => item.trim().toLowerCase())
      .filter((item) => item.length > 0);
    if (invitees.length > 0) {
      const unique = Array.from(new Set(invitees));
      payload.attendees = unique.map((email) => ({ email }));
    }

    try {
      await api.post("/api/events/", payload);
      setIsModalOpen(false);
      setForm(createInitialForm(startDateValue));
      await refreshOccurrences(referenceDate);
    } catch (err) {
      console.error(err);
      setFormError("Could not create event.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <Navigation />
      <main className="calendar">
        <div className="calendar-shell">
          <header className="calendar-header">
            <div className="calendar-title">
              <h1>{formatMonthTitle(referenceDate)}</h1>
              <span>{events.length} scheduled occurrences this month</span>
            </div>
            <div className="calendar-controls">
              <button type="button" className="calendar-btn" onClick={handlePrevMonth}>
                Prev
              </button>
              <button type="button" className="calendar-btn" onClick={handleToday}>
                Today
              </button>
              <button type="button" className="calendar-btn" onClick={handleNextMonth}>
                Next
              </button>
            </div>
          </header>

          <section className="calendar-grid">
            {WEEKDAY_LABELS.map((label) => (
              <div key={label} className="calendar-weekday">
                {label}
              </div>
            ))}
            {calendarCells.map((cell) => (
              <div
                key={cell.id}
                className={`calendar-day${cell.inCurrentMonth ? "" : " calendar-day--faded"}`}
                role={cell.inCurrentMonth ? "button" : undefined}
                tabIndex={cell.inCurrentMonth ? 0 : -1}
                onClick={() => handleDayClick(cell)}
                onKeyDown={(event) => {
                  if (!cell.inCurrentMonth) {
                    return;
                  }
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    handleDayClick(cell);
                  }
                }}
              >
                <span className="calendar-day__date">{cell.label}</span>
                <div className="calendar-day__events">
                  {cell.events.length > 0 &&
                    cell.events.slice(0, 3).map((event) => (
                      <div className="calendar-event" key={event.occurrence_id}>
                        <span>{event.title}</span>
                        <span className="calendar-event__time">
                          {new Date(event.start).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                          {" - "}
                          {new Date(event.end).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                      </div>
                    ))}
                  {cell.events.length > 3 && (
                    <span className="calendar-day__more">
                      +{cell.events.length - 3} more
                    </span>
                  )}
                </div>
              </div>
            ))}
          </section>

          {loading && <p className="calendar-empty">Loading calendar…</p>}
          {!loading && error && <p className="calendar-empty">{error}</p>}
          {!loading && !error && events.length === 0 && (
            <p className="calendar-empty">No events scheduled this month.</p>
          )}
        </div>
      </main>
      {isModalOpen && (
        <div className="calendar-modal-overlay" onClick={handleCloseModal}>
          <div className="calendar-modal" onClick={(event) => event.stopPropagation()}>
            <div className="calendar-modal-header">
              <h2>Create mission</h2>
              <button
                type="button"
                className="calendar-modal-close"
                onClick={handleCloseModal}
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <p className="calendar-modal-subtitle">
              Capture sortie details directly from the monthly calendar.
            </p>
            <form className="calendar-modal-form" onSubmit={handleSubmit}>
              <label className="calendar-modal-label">
                <span>Title</span>
                <input
                  className="calendar-modal-input"
                  name="title"
                  value={form.title}
                  onChange={onFormChange}
                  placeholder="Mission title"
                  required
                />
              </label>
              <label className="calendar-modal-label">
                <span>Description</span>
                <textarea
                  className="calendar-modal-input"
                  name="description"
                  value={form.description}
                  onChange={onFormChange}
                  placeholder="Description (optional)"
                  rows={3}
                />
              </label>
              <label className="calendar-modal-label">
                <span>Invite attendees</span>
                <textarea
                  className="calendar-modal-input"
                  name="invitees"
                  value={form.invitees}
                  onChange={onFormChange}
                  placeholder="Add email addresses (comma or line separated)"
                  rows={2}
                />
              </label>
              <p className="calendar-modal-note">
                Separate multiple emails with commas or line breaks.
              </p>
              <label className="calendar-modal-label">
                <span>Start</span>
                {!form.all_day ? (
                  <input
                    className="calendar-modal-input"
                    type="datetime-local"
                    name="startDateTime"
                    value={form.startDateTime}
                    onChange={onFormChange}
                    required
                  />
                ) : (
                  <input
                    className="calendar-modal-input"
                    type="date"
                    name="startDate"
                    value={form.startDate}
                    onChange={onFormChange}
                    required
                  />
                )}
              </label>
              {!form.all_day && (
                <label className="calendar-modal-label">
                  <span>End</span>
                  <input
                    className="calendar-modal-input"
                    type="datetime-local"
                    name="endDateTime"
                    value={form.endDateTime}
                    onChange={onFormChange}
                    required
                  />
                </label>
              )}
              {form.all_day && (
                <p className="calendar-modal-note">
                  End of day is applied automatically for all-day events.
                </p>
              )}
              <label className="calendar-modal-check">
                <input
                  type="checkbox"
                  name="all_day"
                  checked={form.all_day}
                  onChange={onFormChange}
                />
                <span>All day</span>
              </label>
              <label className="calendar-modal-check">
                <input
                  type="checkbox"
                  name="recurrence_enabled"
                  checked={form.recurrence_enabled}
                  onChange={onFormChange}
                />
                <span>Recurring event</span>
              </label>
              {form.recurrence_enabled && (
                <>
                  <label className="calendar-modal-label">
                    <span>Repeats</span>
                    <select
                      className="calendar-modal-input"
                      name="recurrence_frequency"
                      value={form.recurrence_frequency}
                      onChange={onFormChange}
                    >
                      <option value="daily">Daily</option>
                      <option value="weekly">Weekly</option>
                      <option value="monthly">Monthly</option>
                      <option value="yearly">Yearly</option>
                    </select>
                  </label>
                  <span className="calendar-modal-note">
                    {formatRecurrenceLabel(form.recurrence_frequency, form.recurrence_interval)}
                  </span>
                </>
              )}
              {formError && <p className="calendar-modal-error">{formError}</p>}
              <div className="calendar-modal-actions">
                <button
                  type="button"
                  className="calendar-btn calendar-btn--ghost"
                  onClick={handleCloseModal}
                >
                  Cancel
                </button>
                <button type="submit" className="calendar-btn" disabled={submitting}>
                  {submitting ? "Saving..." : "Add mission"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {isDayViewOpen && selectedDayCell && (
        <DayView
          date={selectedDayCell.date}
          events={selectedDayCell.events}
          onClose={handleCloseDayView}
          onCreateEvent={handleCreateFromDayView}
          onEventUpdated={() => refreshOccurrences(referenceDate)}
        />
      )}
    </>
  );
}

export default Calendar;
