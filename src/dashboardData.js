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
const FREE_EMAIL_DOMAINS = new Set(['gmail.com', 'outlook.com', 'hotmail.com', 'live.com']);
const EXECUTIVE_NAME = 'Jacques';

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

    const current = buckets.get(key) ?? { label, value: 0, count: 0 };
    current.value += record.actualDurationMinutes;
    current.count += 1;
    buckets.set(key, current);
  });

  return Array.from(buckets.entries())
    .sort(([left], [right]) => new Date(left) - new Date(right))
    .map(([, entry]) => ({
      label: entry.label,
      value: entry.value,
      count: entry.count,
    }));
}

export function getDepartmentBreakdown(records, granularity) {
  const buckets = new Map();

  records.forEach((record) => {
    const current = buckets.get(record.department) ?? {
      totalMinutes: 0,
      meetingCount: 0,
      durations: [],
    };
    current.totalMinutes += record.actualDurationMinutes;
    current.meetingCount += 1;
    current.durations.push(record.actualDurationMinutes);
    buckets.set(record.department, current);
  });

  return Array.from(buckets.entries())
    .map(([name, entry]) => {
      const sortedDurations = [...entry.durations].sort((left, right) => left - right);
      const middle = Math.floor(sortedDurations.length / 2);
      const medianDurationMinutes = sortedDurations.length % 2 === 0
        ? (sortedDurations[middle - 1] + sortedDurations[middle]) / 2
        : sortedDurations[middle];

      return {
        name,
        value: formatValue(entry.totalMinutes, granularity),
        totalMinutes: entry.totalMinutes,
        meetingCount: entry.meetingCount,
        averageDurationMinutes: entry.meetingCount ? entry.totalMinutes / entry.meetingCount : 0,
        medianDurationMinutes,
      };
    })
    .sort((left, right) => right.totalMinutes - left.totalMinutes);
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

function titleCase(value) {
  return value
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function getCompanyNameFromDomain(domain) {
  const normalizedDomain = domain.trim().toLowerCase();

  if (!normalizedDomain) {
    return 'Unknown';
  }

  if (FREE_EMAIL_DOMAINS.has(normalizedDomain)) {
    return 'Unknown';
  }

  const labels = normalizedDomain.split('.').filter(Boolean);
  const root = labels.length >= 2 ? labels[labels.length - 2] : labels[0];
  return root ? titleCase(root) : 'Unknown';
}

function getEmailDomain(value) {
  if (!value || typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim().toLowerCase();
  const atIndex = trimmed.lastIndexOf('@');

  if (atIndex <= 0 || atIndex === trimmed.length - 1) {
    return null;
  }

  return trimmed.slice(atIndex + 1);
}

function getParticipants(record) {
  if (!Array.isArray(record.participantDetails)) {
    return [];
  }

  return record.participantDetails.filter((participant) => participant && participant.name);
}

function getParticipantsExcludingExecutive(record) {
  return getParticipants(record).filter((participant) => participant.name !== EXECUTIVE_NAME);
}

function getParticipantScore(participant, scoreKey) {
  const value = participant?.[scoreKey];
  return Number.isFinite(value) ? value : 50;
}

function extractAttendeeEmailDomains(record) {
  const emails = [];

  if (Array.isArray(record.attendeeEmails)) {
    emails.push(...record.attendeeEmails);
  }

  if (Array.isArray(record.participantEmails)) {
    emails.push(...record.participantEmails);
  }

  if (Array.isArray(record.participants)) {
    emails.push(...record.participants);
  }

  if (Array.isArray(record.participantDetails)) {
    record.participantDetails.forEach((participant) => {
      if (participant?.email) {
        emails.push(participant.email);
      }
    });
  }

  return Array.from(new Set(emails
    .map((email) => getEmailDomain(email))
    .filter(Boolean)));
}

export function getCompanyTimeBreakdown(records, granularity = 'hours') {
  const buckets = new Map();

  records.forEach((record) => {
    const companyMinuteShares = new Map();
    const participants = getParticipants(record);

    if (participants.length) {
      const share = record.actualDurationMinutes / participants.length;
      participants.forEach((participant) => {
        const companyName = sanitizeCompany(participant.company);
        companyMinuteShares.set(companyName, (companyMinuteShares.get(companyName) ?? 0) + share);
      });
    } else {
      let companyNames = extractAttendeeEmailDomains(record)
        .map((domain) => getCompanyNameFromDomain(domain))
        .filter(Boolean);

      if (!companyNames.length) {
        companyNames = ['Unknown'];
      }

      const share = companyNames.length ? record.actualDurationMinutes / companyNames.length : record.actualDurationMinutes;
      companyNames.forEach((companyName) => {
        const normalizedCompany = sanitizeCompany(companyName);
        companyMinuteShares.set(normalizedCompany, (companyMinuteShares.get(normalizedCompany) ?? 0) + share);
      });
    }

    companyMinuteShares.forEach((minutes, companyName) => {
      const normalizedCompany = companyName && companyName.trim() ? companyName : 'Unknown';
      const current = buckets.get(normalizedCompany) ?? {
        totalMinutes: 0,
        meetingCount: 0,
      };

      current.totalMinutes += minutes;
      current.meetingCount += 1;
      buckets.set(normalizedCompany, current);
    });
  });

  return Array.from(buckets.entries())
    .map(([name, entry]) => ({
      name,
      value: formatValue(entry.totalMinutes, granularity),
      totalMinutes: entry.totalMinutes,
      meetingCount: entry.meetingCount,
      averageDurationMinutes: entry.meetingCount ? entry.totalMinutes / entry.meetingCount : 0,
    }))
    .sort((left, right) => right.totalMinutes - left.totalMinutes);
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
    const participants = getParticipants(record);
    const nonExecutiveParticipants = participants.filter((participant) => participant.name !== EXECUTIVE_NAME);
    const nonExecutiveShare = nonExecutiveParticipants.length
      ? record.actualDurationMinutes / nonExecutiveParticipants.length
      : 0;

    participants.forEach((participant) => {
      const personName = participant.name || 'Unknown';

      if (!people.has(personName)) {
        people.set(personName, {
          person: personName,
          company: sanitizeCompany(participant.company),
          companyType: participant.type || 'staff',
          meetings: 0,
          totalMinutes: 0,
          hostMinutes: 0,
          attendeeMinutes: 0,
          talkativeTotal: 0,
          inquisitiveTotal: 0,
        });
      }

      const allocatedMinutes = participant.name === EXECUTIVE_NAME
        ? record.actualDurationMinutes
        : nonExecutiveShare;
      const current = people.get(personName);
      current.meetings += 1;
      current.totalMinutes += allocatedMinutes;
      current.talkativeTotal += getParticipantScore(participant, 'talkativeScore');
      current.inquisitiveTotal += getParticipantScore(participant, 'inquisitiveScore');

      if (record.ownerName === participant.name) {
        current.hostMinutes += allocatedMinutes;
      } else {
        current.attendeeMinutes += allocatedMinutes;
      }
    });
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
  const pointsByParticipant = [];

  records.forEach((record) => {
    const participants = getParticipants(record);
    participants.forEach((participant) => {
      const company = sanitizeCompany(participant.company);
      if (companyFilter && companyFilter !== 'All companies' && company !== companyFilter) {
        return;
      }

      pointsByParticipant.push({
        person: participant.name || 'Unknown',
        company,
        startTime: record.startTime,
        duration: record.actualDurationMinutes,
      });
    });
  });

  const meetingCounts = new Map();
  pointsByParticipant.forEach((point) => {
    meetingCounts.set(point.person, (meetingCounts.get(point.person) ?? 0) + 1);
  });

  const people = Array.from(meetingCounts.entries())
    .sort((left, right) => right[1] - left[1])
    .map(([name]) => name);

  const yIndex = new Map(people.map((name, index) => [name, index]));

  const points = pointsByParticipant.map((point) => {
    return {
      value: [point.startTime, yIndex.get(point.person)],
      person: point.person,
      duration: point.duration,
      company: point.company,
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

    const participants = getParticipantsExcludingExecutive(record);
    if (participants.length) {
      const share = record.actualDurationMinutes / participants.length;
      participants.forEach((participant) => {
        if (participant.type === 'external') {
          current.externalMinutes += share;
        } else {
          current.staffMinutes += share;
        }
      });
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

function getQuantile(sortedValues, quantile) {
  if (!sortedValues.length) {
    return 0;
  }

  const index = (sortedValues.length - 1) * quantile;
  const lowerIndex = Math.floor(index);
  const upperIndex = Math.ceil(index);

  if (lowerIndex === upperIndex) {
    return sortedValues[lowerIndex];
  }

  const lowerValue = sortedValues[lowerIndex];
  const upperValue = sortedValues[upperIndex];
  const weight = index - lowerIndex;

  return lowerValue + ((upperValue - lowerValue) * weight);
}

export function getMeetingNeedAnalysis(records) {
  const validRecords = records.filter((record) => Number.isFinite(record.actualDurationMinutes));
  const durations = validRecords
    .map((record) => record.actualDurationMinutes)
    .sort((left, right) => left - right);

  if (!durations.length) {
    return {
      durationVsTalkShareScatter: [],
      durationNormalCurve: {
        curve: [],
        points: [],
        percentiles: { p25: 0, p50: 0, p75: 0 },
      },
    };
  }

  const mean = durations.reduce((sum, value) => sum + value, 0) / durations.length;
  const variance = durations.reduce((sum, value) => sum + ((value - mean) ** 2), 0) / durations.length;
  const stdDev = Math.sqrt(variance);
  const minDuration = Math.max(0, durations[0] - 10);
  const maxDuration = durations[durations.length - 1] + 10;
  const steps = 80;
  const range = Math.max(maxDuration - minDuration, 1);

  const getDensity = (duration) => {
    if (stdDev < 0.0001) {
      return duration === mean ? 1 : 0;
    }

    const zScore = (duration - mean) / stdDev;
    return (1 / (stdDev * Math.sqrt(2 * Math.PI))) * Math.exp(-((zScore ** 2) / 2));
  };

  const curve = Array.from({ length: steps + 1 }, (_, index) => {
    const duration = minDuration + ((range * index) / steps);
    return [Number(duration.toFixed(2)), Number(getDensity(duration).toFixed(6))];
  });

  const points = validRecords.map((record) => ({
    value: [record.actualDurationMinutes, Number(getDensity(record.actualDurationMinutes).toFixed(6))],
    id: record.id,
    title: record.title,
  }));

  const durationVsTalkShareScatter = validRecords.map((record) => {
    const nonExecutiveParticipants = getParticipantsExcludingExecutive(record);
    const averageCounterpartTalkative = nonExecutiveParticipants.length
      ? nonExecutiveParticipants.reduce((sum, participant) => sum + getParticipantScore(participant, 'talkativeScore'), 0)
        / nonExecutiveParticipants.length
      : 50;

    return {
      value: [record.actualDurationMinutes, Math.max(0, Math.min(100, 100 - averageCounterpartTalkative))],
      id: record.id,
      title: record.title,
      participantSummary: nonExecutiveParticipants.length
        ? nonExecutiveParticipants.map((participant) => participant.name).join(', ')
        : 'No additional participants',
    };
  });

  return {
    durationVsTalkShareScatter,
    durationNormalCurve: {
      curve,
      points,
      percentiles: {
        p25: getQuantile(durations, 0.25),
        p50: getQuantile(durations, 0.5),
        p75: getQuantile(durations, 0.75),
      },
    },
  };
}
