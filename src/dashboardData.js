const GRANULARITY_DIVISORS = {
  hours: 60,
  days: 60 * 24,
  weeks: 60 * 24 * 7,
  months: 60 * 24 * 30,
};

const GRANULARITY_LABELS = {
  hours: 'Hours',
  days: 'Days',
  weeks: 'Weeks',
  months: 'Months',
};

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function startOfDay(date) {
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);
  return result;
}

function startOfWeek(date) {
  const result = startOfDay(date);
  const day = result.getDay();
  const diff = (day + 6) % 7;
  result.setDate(result.getDate() - diff);
  return result;
}

function startOfMonth(date) {
  const result = startOfDay(date);
  result.setDate(1);
  return result;
}

function getWeekNumber(date) {
  const value = startOfDay(date);
  value.setDate(value.getDate() + 3 - ((value.getDay() + 6) % 7));
  const firstThursday = new Date(value.getFullYear(), 0, 4);
  firstThursday.setDate(firstThursday.getDate() + 3 - ((firstThursday.getDay() + 6) % 7));
  return 1 + Math.round((value - firstThursday) / (7 * 24 * 60 * 60 * 1000));
}

export function formatValue(minutes, granularity) {
  const divisor = GRANULARITY_DIVISORS[granularity];
  const value = minutes / divisor;
  return Number(value.toFixed(value >= 10 ? 1 : 2));
}

export function getGranularityLabel(granularity) {
  return GRANULARITY_LABELS[granularity];
}

export function getSummaryMetrics(records) {
  const totalMinutes = records.reduce((sum, record) => sum + record.actualDurationMinutes, 0);
  const averageDuration = records.length ? totalMinutes / records.length : 0;

  return {
    totalMinutes,
    averageDuration,
    meetingsCount: records.length,
  };
}

export function getLineSeries(records, granularity) {
  const buckets = new Map();

  records.forEach((record) => {
    const date = new Date(record.startTime);
    let key;
    let label;

    if (granularity === 'months') {
      key = startOfMonth(date).toISOString();
      label = `${MONTH_LABELS[date.getMonth()]} ${String(date.getFullYear()).slice(-2)}`;
    } else if (granularity === 'weeks') {
      const bucketDate = startOfWeek(date);
      key = bucketDate.toISOString();
      label = `W${String(getWeekNumber(date)).padStart(2, '0')}`;
    } else if (granularity === 'days') {
      key = startOfDay(date).toISOString();
      label = `${MONTH_LABELS[date.getMonth()]} ${date.getDate()}`;
    } else {
      const bucketDate = new Date(date);
      bucketDate.setMinutes(0, 0, 0);
      key = bucketDate.toISOString();
      label = `${MONTH_LABELS[date.getMonth()]} ${date.getDate()} ${String(date.getHours()).padStart(2, '0')}:00`;
    }

    const current = buckets.get(key) ?? { label, value: 0 };
    current.value += record.actualDurationMinutes;
    buckets.set(key, current);
  });

  return Array.from(buckets.entries())
    .sort(([left], [right]) => new Date(left) - new Date(right))
    .map(([, entry]) => ({
      label: entry.label,
      value: entry.value,
    }));
}

export function getDepartmentBreakdown(records, granularity) {
  const buckets = new Map();

  records.forEach((record) => {
    buckets.set(record.department, (buckets.get(record.department) ?? 0) + record.actualDurationMinutes);
  });

  return Array.from(buckets.entries())
    .map(([name, value]) => ({
      name,
      value: formatValue(value, granularity),
    }))
    .sort((left, right) => right.value - left.value);
}

export function getCampaignBreakdown(records, granularity) {
  const buckets = new Map();

  records.forEach((record) => {
    buckets.set(record.campaign, (buckets.get(record.campaign) ?? 0) + record.actualDurationMinutes);
  });

  return Array.from(buckets.entries())
    .map(([name, value]) => ({
      name,
      value: formatValue(value, granularity),
    }))
    .sort((left, right) => right.value - left.value);
}

export function getHeatmapSeries(records, granularity) {
  const matrix = new Map();
  const xAxis = [];

  records.forEach((record) => {
    const date = new Date(record.startTime);
    const weekStart = startOfWeek(date);
    let xKey;
    let xLabel;

    if (granularity === 'months') {
      xKey = `${date.getFullYear()}-${date.getMonth()}`;
      xLabel = MONTH_LABELS[date.getMonth()];
    } else if (granularity === 'weeks') {
      xKey = weekStart.toISOString();
      xLabel = `W${String(getWeekNumber(date)).padStart(2, '0')}`;
    } else if (granularity === 'days') {
      xKey = startOfDay(date).toISOString();
      xLabel = `${MONTH_LABELS[date.getMonth()]} ${date.getDate()}`;
    } else {
      xKey = `${date.getHours()}`;
      xLabel = `${String(date.getHours()).padStart(2, '0')}:00`;
    }

    if (!xAxis.find((value) => value.key === xKey)) {
      xAxis.push({ key: xKey, label: xLabel });
    }

    const yLabel = WEEKDAY_LABELS[date.getDay()];
    const matrixKey = `${xKey}::${yLabel}`;
    matrix.set(matrixKey, (matrix.get(matrixKey) ?? 0) + 1);
  });

  const sortedXAxis = [...xAxis].sort((left, right) => {
    if (granularity === 'hours') {
      return Number(left.key) - Number(right.key);
    }
    return left.key.localeCompare(right.key);
  });

  const xIndex = new Map(sortedXAxis.map((item, index) => [item.key, index]));
  const yAxis = WEEKDAY_LABELS;

  const series = [];
  matrix.forEach((value, key) => {
    const [xKey, yLabel] = key.split('::');
    series.push([xIndex.get(xKey), yAxis.indexOf(yLabel), value]);
  });

  return {
    xAxis: sortedXAxis.map((item) => item.label),
    yAxis,
    series,
  };
}

export function getVarianceSeries(records, granularity, filter) {
  const buckets = new Map();

  records.forEach((record) => {
    const date = new Date(record.startTime);
    let key;
    let label;

    if (granularity === 'months') {
      key = startOfMonth(date).toISOString();
      label = `${MONTH_LABELS[date.getMonth()]} ${String(date.getFullYear()).slice(-2)}`;
    } else if (granularity === 'weeks') {
      const bucketDate = startOfWeek(date);
      key = bucketDate.toISOString();
      label = `W${String(getWeekNumber(date)).padStart(2, '0')}`;
    } else if (granularity === 'days') {
      key = startOfDay(date).toISOString();
      label = `${MONTH_LABELS[date.getMonth()]} ${date.getDate()}`;
    } else {
      const hour = new Date(date);
      hour.setMinutes(0, 0, 0);
      key = hour.toISOString();
      label = `${MONTH_LABELS[date.getMonth()]} ${date.getDate()} ${String(date.getHours()).padStart(2, '0')}:00`;
    }

    const current = buckets.get(key) ?? { label, overtime: 0, undertime: 0 };
    const delta = record.actualDurationMinutes - record.scheduledDurationMinutes;

    if (delta > 0 && filter !== 'undertime') {
      current.overtime += delta;
    }

    if (delta < 0 && filter !== 'overtime') {
      current.undertime += Math.abs(delta);
    }

    buckets.set(key, current);
  });

  return Array.from(buckets.entries())
    .sort(([left], [right]) => new Date(left) - new Date(right))
    .map(([, entry]) => ({
      label: entry.label,
      overtime: entry.overtime,
      undertime: entry.undertime,
    }));
}