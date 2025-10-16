const UNIT_LABELS = {
  daily: "day",
  weekly: "week",
  monthly: "month",
  yearly: "year",
};

export function formatRecurrenceLabel(frequency, interval) {
  if (!frequency || frequency === "none") {
    return "";
  }
  const unit = UNIT_LABELS[frequency] || "cycle";
  if (interval === 1) {
    return `Repeats every ${unit}`;
  }
  return `Repeats every ${interval} ${unit}${interval > 1 ? "s" : ""}`;
}

