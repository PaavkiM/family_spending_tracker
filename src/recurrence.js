/**
 * Recurrence expansion.
 *
 * An entry stored in the DB represents the FIRST occurrence plus a rule
 * (interval + optional end date). To display history we expand each recurring
 * entry into the concrete dates on which it occurs, bounded by a window so we
 * never loop forever on a "recurring forever" entry.
 */

const VALID_INTERVALS = new Set(['none', 'daily', 'weekly', 'monthly', 'yearly']);

export function isValidInterval(interval) {
  return VALID_INTERVALS.has(interval);
}

/** Parse a YYYY-MM-DD string into a UTC date (no timezone surprises). */
function parseDate(str) {
  const [y, m, d] = String(str).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function toISODate(date) {
  return date.toISOString().slice(0, 10);
}

/** Last day (28-31) of a given UTC month. */
function lastDayOfMonth(year, monthIndex) {
  // Day 0 of the next month is the last day of this month.
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
}

/**
 * The Nth occurrence of a recurring entry, computed from the ORIGINAL start
 * date (not from the previous occurrence) so dates never drift.
 *
 * For monthly/yearly, the day is clamped to the last valid day of the target
 * month. So a "31st" monthly entry lands on Jan 31, Feb 28, Mar 31, Apr 30…
 * and a Feb 29 yearly entry lands on Feb 28 in non-leap years — and returns to
 * the 29th/31st whenever the month is long enough again.
 *
 * @param {Date}   start    the original first occurrence (UTC)
 * @param {string} interval 'daily' | 'weekly' | 'monthly' | 'yearly'
 * @param {number} n        0 for the first occurrence, 1 for the next, …
 * @returns {Date|null}
 */
function occurrenceAt(start, interval, n) {
  const startYear = start.getUTCFullYear();
  const startMonth = start.getUTCMonth();
  const startDay = start.getUTCDate();

  switch (interval) {
    case 'daily':
      return new Date(Date.UTC(startYear, startMonth, startDay + n));
    case 'weekly':
      return new Date(Date.UTC(startYear, startMonth, startDay + n * 7));
    case 'monthly': {
      const totalMonths = startMonth + n;
      const year = startYear + Math.floor(totalMonths / 12);
      const monthIndex = ((totalMonths % 12) + 12) % 12;
      const day = Math.min(startDay, lastDayOfMonth(year, monthIndex));
      return new Date(Date.UTC(year, monthIndex, day));
    }
    case 'yearly': {
      const year = startYear + n;
      const day = Math.min(startDay, lastDayOfMonth(year, startMonth));
      return new Date(Date.UTC(year, startMonth, day));
    }
    default:
      return null;
  }
}

/**
 * Expand one DB row into display occurrences within [windowStart, windowEnd].
 *
 * @param {object} entry   row from `entries` (with joined category fields)
 * @param {Date}   windowStart inclusive lower bound
 * @param {Date}   windowEnd   inclusive upper bound
 * @returns {Array} occurrences, each a flat object ready for the client
 */
export function expandEntry(entry, windowStart, windowEnd) {
  const base = {
    id: entry.id,
    description: entry.description,
    amount: Number(entry.amount),
    category_id: entry.category_id,
    category_name: entry.category_name,
    category_color: entry.category_color,
    is_recurring: entry.is_recurring,
    recur_interval: entry.recur_interval,
    recur_until: entry.recur_until ? toISODate(new Date(entry.recur_until)) : null,
  };

  const start = parseDate(entry.spent_on);

  // Non-recurring: a single occurrence if it falls in the window.
  if (!entry.is_recurring || entry.recur_interval === 'none') {
    if (start >= windowStart && start <= windowEnd) {
      return [{ ...base, occurrence_date: toISODate(start), is_occurrence: false }];
    }
    return [];
  }

  const occurrences = [];
  const hardEnd = entry.recur_until ? parseDate(entry.recur_until) : null;
  // Never generate past the window or the rule's own end date.
  const limit = hardEnd && hardEnd < windowEnd ? hardEnd : windowEnd;

  const MAX = 100_000; // safety valve
  for (let n = 0; n < MAX; n += 1) {
    // Each occurrence is computed from the ORIGINAL start, so no drift.
    const cursor = occurrenceAt(start, entry.recur_interval, n);
    if (!cursor) break;
    if (cursor > limit) break;

    if (cursor >= windowStart) {
      occurrences.push({
        ...base,
        occurrence_date: toISODate(cursor),
        // The very first date is the "original"; later ones are generated.
        is_occurrence: n !== 0,
      });
    }
  }

  return occurrences;
}

export { parseDate, toISODate };
