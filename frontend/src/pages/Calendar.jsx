import { useCallback, useEffect, useMemo, useState } from "react";

import Navigation from "../components/Navigation";
import {
  addMonths,
  endOfMonth,
  formatMonthTitle,
  isoDate,
  isoLocal,
  startOfMonth,
} from "../utils/date";
import { formatRecurrenceLabel } from "../utils/recurrence";
import { createEvent, fetchOccurrences } from "../services/events";

import "../styles/Calendar.css";

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

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
  };
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

export default function Calendar() {
  const [referenceDate, setReferenceDate] = useState(startOfMonth(new Date()));
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [form, setForm] = useState(() => createInitialForm());
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");

  const refreshOccurrences = useCallback(
    async (targetDate) => {
      const month = targetDate ?? referenceDate;
      setLoading(true);
      setError("");
      try {
        const monthStart = startOfMonth(month);
        const monthEnd = endOfMonth(month);
        const data = await fetchOccurrences({
          start: monthStart.toISOString(),
          end: monthEnd.toISOString(),
        });
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
      const displayDate = cellDate.getDate();
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
    setForm(createInitialForm(referenceDate));
  };

  const handleDayClick = (cell) => {
    if (!cell.inCurrentMonth) {
      return;
    }
    setForm(createInitialForm(cell.date));
    setFormError("");
    setIsModalOpen(true);
  };

  const onFormChange = (event) => {
    const { name, value, type, checked } = event.target;
    setForm((previous) => {
      if (name === "all_day") {
        if (checked) {
          const start = new Date(previous.startDateTime);
          return {
            ...previous,
            all_day: true,
            startDate: isoDate(start),
          };
        }
        return {
          ...previous,
          all_day: false,
        };
      }

      if (name === "startDate") {
        if (!value) {
          return { ...previous, startDate: value };
        }
        const base = new Date(value);
        if (Number.isNaN(base.getTime())) {
          return { ...previous, startDate: value };
        }
        const startDateTime = new Date(previous.startDateTime);
        startDateTime.setFullYear(base.getFullYear(), base.getMonth(), base.getDate());
        const endDateTime = new Date(previous.endDateTime);
        endDateTime.setFullYear(base.getFullYear(), base.getMonth(), base.getDate());
        return {
          ...previous,
          startDate: value,
          startDateTime: isoLocal(startDateTime),
          endDateTime: isoLocal(endDateTime),
        };
      }

      if (name === "startDateTime") {
        let nextEnd = previous.endDateTime;
        const newStart = new Date(value);
        if (!Number.isNaN(newStart.getTime())) {
          const currentEnd = new Date(previous.endDateTime);
          if (Number.isNaN(currentEnd.getTime()) || currentEnd <= newStart) {
            const bumped = new Date(newStart.getTime() + 60 * 60 * 1000);
            nextEnd = isoLocal(bumped);
          }
        }
        return {
          ...previous,
          startDateTime: value,
          endDateTime: nextEnd,
          startDate: value ? isoDate(value) : previous.startDate,
        };
      }

      if (name === "recurrence_interval") {
        const numeric = Number(value) || 1;
        return {
          ...previous,
          recurrence_interval: Math.max(1, numeric),
        };
      }

      if (type === "checkbox") {
        return {
          ...previous,
          [name]: checked,
        };
      }

      return {
        ...previous,
        [name]: value,
      };
    });
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
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

    const payload = {
      title: form.title,
      description: form.description,
      start: startDateValue.toISOString(),
      end: endDateValue.toISOString(),
      all_day: form.all_day,
      recurrence_frequency: form.recurrence_enabled ? form.recurrence_frequency : "none",
      recurrence_interval: form.recurrence_enabled ? form.recurrence_interval : 1,
      recurrence_count: form.recurrence_enabled ? null : null,
      recurrence_end_date: null,
    };

    try {
      await createEvent(payload);
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
                onKeyDown={(eventKey) => {
                  if (!cell.inCurrentMonth) return;
                  if (eventKey.key === "Enter" || eventKey.key === " ") {
                    eventKey.preventDefault();
                    handleDayClick(cell);
                  }
                }}
              >
                <span className="calendar-day__date">{cell.label}</span>
                <div className="calendar-day__events">
                  {cell.events.length === 0 && cell.inCurrentMonth && !loading ? (
                    <span className="calendar-day__more">No missions</span>
                  ) : (
                    cell.events.slice(0, 3).map((eventItem) => (
                      <div className="calendar-event" key={eventItem.occurrence_id}>
                        <span>{eventItem.title}</span>
                        <span className="calendar-event__time">
                          {new Date(eventItem.start).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            ))}
          </section>

          {error && <p className="calendar-error">{error}</p>}

          <section className="calendar-meta">
            <div>
              <h2>Upcoming missions</h2>
              <p>
                {events.length > 0
                  ? "Tap a day to schedule a new sortie."
                  : "No missions scheduled this month."}
              </p>
            </div>
          </section>
        </div>
      </main>

      {isModalOpen && (
        <div className="calendar-modal-overlay" onClick={handleCloseModal}>
          <div
            className="calendar-modal calendar-modal--narrow"
            onClick={(eventClick) => eventClick.stopPropagation()}
          >
            <div className="calendar-modal-header">
              <h2>Add mission</h2>
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
    </>
  );
}

