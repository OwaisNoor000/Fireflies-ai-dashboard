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

export function getDurationHistogram(records) {
  const bins = [
    { label: '15-30 min', min: 15, max: 30, byYou: 0, byOtherStaff: 0 },
    { label: '30-60 min', min: 30, max: 60, byYou: 0, byOtherStaff: 0 },
    { label: '1-2 hours', min: 60, max: 120, byYou: 0, byOtherStaff: 0 },
    { label: '2+ hours', min: 120, max: Number.POSITIVE_INFINITY, byYou: 0, byOtherStaff: 0 },
  ];

  records.forEach((record) => {
    const matchingBin = bins.find((bin) => record.actualDurationMinutes >= bin.min && record.actualDurationMinutes < bin.max);

    if (!matchingBin) {
      return;
    }

    if (record.ownerCategory === 'by-you') {
      matchingBin.byYou += 1;
    } else {
      matchingBin.byOtherStaff += 1;
    }
  });

  return bins.map(({ label, byYou, byOtherStaff }) => ({
    label,
    byYou,
    byOtherStaff,
  }));
}

function sanitizeCompany(value) {
  return value && value.trim() ? value : 'Unknown';
}

export function getPage2PersonStats(records) {
  const people = new Map();

  records.forEach((record) => {
    const personName = record.counterpartName || record.ownerName || 'Unknown';
    const company = sanitizeCompany(record.counterpartCompany);

    if (!people.has(personName)) {
      people.set(personName, {
        person: personName,
        company,
        companyType: record.counterpartType || 'staff',
        meetings: 0,
        totalMinutes: 0,
        hostMinutes: 0,
        attendeeMinutes: 0,
        talkativeTotal: 0,
        inquisitiveTotal: 0,
      });
    }

    const current = people.get(personName);
    current.meetings += 1;
    current.totalMinutes += record.actualDurationMinutes;
    current.talkativeTotal += record.counterpartTalkativeScore ?? 50;
    current.inquisitiveTotal += record.counterpartInquisitiveScore ?? 50;

    if (record.jacquesRole === 'host') {
      current.hostMinutes += record.actualDurationMinutes;
    } else {
      current.attendeeMinutes += record.actualDurationMinutes;
    }
  });

  return Array.from(people.values())
    .map((entry) => ({
      ...entry,
      averageDurationMinutes: entry.meetings ? entry.totalMinutes / entry.meetings : 0,
      talkativeScore: entry.meetings ? entry.talkativeTotal / entry.meetings : 0,
      inquisitiveScore: entry.meetings ? entry.inquisitiveTotal / entry.meetings : 0,
    }))
    .sort((left, right) => right.totalMinutes - left.totalMinutes);
}

export function getCompanyOptions(personStats) {
  const options = Array.from(new Set(personStats.map((entry) => sanitizeCompany(entry.company))));
  return ['All companies', ...options.sort((left, right) => left.localeCompare(right))];
}

export function filterPersonStatsByCompany(personStats, companyFilter) {
  if (!companyFilter || companyFilter === 'All companies') {
    return personStats;
  }

  return personStats.filter((entry) => sanitizeCompany(entry.company) === companyFilter);
}

export function getDotPlotData(records, companyFilter) {
  const filtered = records.filter((record) => {
    if (!companyFilter || companyFilter === 'All companies') {
      return true;
    }

    return sanitizeCompany(record.counterpartCompany) === companyFilter;
  });

  const meetingCounts = new Map();
  filtered.forEach((record) => {
    const person = record.counterpartName || record.ownerName || 'Unknown';
    meetingCounts.set(person, (meetingCounts.get(person) ?? 0) + 1);
  });

  const people = Array.from(meetingCounts.entries())
    .sort((left, right) => right[1] - left[1])
    .map(([name]) => name);

  const yIndex = new Map(people.map((name, index) => [name, index]));

  const points = filtered.map((record) => {
    const person = record.counterpartName || record.ownerName || 'Unknown';
    return {
      value: [record.startTime, yIndex.get(person)],
      person,
      duration: record.actualDurationMinutes,
    };
  });

  return {
    people,
    points,
  };
}

export function getExternalVsStaffTrend(records, granularity = 'weeks') {
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

    const current = buckets.get(key) ?? { label, externalMinutes: 0, staffMinutes: 0 };

    if (record.counterpartType === 'external') {
      current.externalMinutes += record.actualDurationMinutes;
    } else {
      current.staffMinutes += record.actualDurationMinutes;
    }

    buckets.set(key, current);
  });

  return Array.from(buckets.entries())
    .sort(([left], [right]) => new Date(left) - new Date(right))
    .map(([, value]) => value);
}

export function getTopPeopleByScore(personStats, scoreKey, overallAverageDuration, limit = 5) {
  return [...personStats]
    .sort((left, right) => (right[scoreKey] ?? 0) - (left[scoreKey] ?? 0))
    .slice(0, limit)
    .map((entry, index) => ({
      rank: index + 1,
      person: entry.person,
      score: entry[scoreKey] ?? 0,
      averageDurationMinutes: entry.averageDurationMinutes,
      overallAverageDurationMinutes: overallAverageDuration,
    }));
}

export function getMeetingMixData(records) {
  const buckets = new Map();

  records.forEach((record) => {
    const sizeType = record.meetingSizeType || '1:M';
    const audienceType = record.meetingAudienceType || 'mixed';
    const label = `${sizeType} ${audienceType}`;
    buckets.set(label, (buckets.get(label) ?? 0) + 1);
  });

  return Array.from(buckets.entries())
    .map(([name, value]) => ({ name, value }))
    .sort((left, right) => right.value - left.value);
}