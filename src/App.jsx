import { useEffect, useMemo, useState } from 'react';
import * as echarts from 'echarts/core';
import { BarChart, HeatmapChart, LineChart, PieChart, ScatterChart, TreemapChart } from 'echarts/charts';
import {
  DataZoomComponent,
  GridComponent,
  LegendComponent,
  ToolboxComponent,
  TooltipComponent,
  VisualMapComponent,
} from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import ReactEChartsCore from 'echarts-for-react/lib/core';
import {
  filterPersonStatsByCompany,
  formatValue,
  getCompanyTimeBreakdown,
  getCompanyOptions,
  getDepartmentBreakdown,
  getDotPlotData,
  getDurationHistogram,
  getExternalVsStaffTrend,
  getGranularityLabel,
  getHeatmapSeries,
  getLineSeries,
  getMeetingNeedAnalysis,
  getMeetingMixData,
  getPage2PersonStats,
  getSummaryMetrics,
  getTopPeopleByScore,
} from './dashboardData';
import appConfig from '../config.json';

echarts.use([
  BarChart,
  CanvasRenderer,
  DataZoomComponent,
  GridComponent,
  HeatmapChart,
  LegendComponent,
  LineChart,
  PieChart,
  ScatterChart,
  ToolboxComponent,
  TooltipComponent,
  TreemapChart,
  VisualMapComponent,
]);

const GRANULARITIES = ['months', 'weeks', 'days', 'hours'];
const APP_CONFIG = {
  demo: Boolean(appConfig?.demo),
  backendUrl: typeof appConfig?.backendUrl === 'string' ? appConfig.backendUrl.replace(/\/$/, '') : '',
};
const DEFAULT_BACKEND_CONFIG = {
  'my-email': '',
  startup: false,
  'fireflies-api-key': '',
  'paid-plan': false,
  'requests-used': 0,
  'company-domains': [],
};

function toDomainsInput(domains) {
  return Array.isArray(domains) ? domains.join(', ') : '';
}

function parseDomainsInput(value) {
  if (!value) {
    return [];
  }

  return value
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

async function fetchBackendConfig(baseUrl) {
  const response = await fetch(`${baseUrl}/config`);
  if (!response.ok) {
    throw new Error(`Failed to fetch backend config (${response.status})`);
  }

  const payload = await response.json();
  return {
    ...DEFAULT_BACKEND_CONFIG,
    ...(payload && typeof payload === 'object' ? payload : {}),
  };
}

async function patchBackendConfig(baseUrl, payload) {
  const response = await fetch(`${baseUrl}/config`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`Failed to update backend config (${response.status})`);
  }

  try {
    const data = await response.json();
    return data && typeof data === 'object' ? data : null;
  } catch {
    return null;
  }
}

async function fetchMeetingDataFromBackend(baseUrl) {
  const response = await fetch(`${baseUrl}/database`);
  if (!response.ok) {
    throw new Error(`Failed to fetch database records (${response.status})`);
  }

  const payload = await response.json();
  if (!Array.isArray(payload)) {
    throw new Error('Backend /database did not return an array.');
  }

  return payload;
}

async function startBackendUpdate(baseUrl, startDate, endDate) {
  const response = await fetch(`${baseUrl}/update`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ startDate, endDate }),
  });

  if (!response.ok) {
    let errorDetail = '';
    try {
      const errorPayload = await response.json();
      errorDetail = errorPayload?.detail || errorPayload?.message || '';
    } catch {
      errorDetail = '';
    }

    const detailSuffix = errorDetail ? `: ${errorDetail}` : '';
    throw new Error(`Failed to start update (${response.status})${detailSuffix}`);
  }

  try {
    return await response.json();
  } catch {
    return null;
  }
}

async function fetchUpdateProgress(baseUrl) {
  const response = await fetch(`${baseUrl}/progress`);
  if (!response.ok) {
    throw new Error(`Failed to fetch update progress (${response.status})`);
  }

  const payload = await response.json();
  return payload && typeof payload === 'object' ? payload : {};
}

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function formatDateInputValue(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function parseDateInputValue(value) {
  if (!value) {
    return null;
  }

  const [year, month, day] = value.split('-').map((segment) => Number(segment));

  if (!year || !month || !day) {
    return null;
  }

  return new Date(year, month - 1, day);
}

function formatDateTag(value) {
  const parsedDate = parseDateInputValue(value);

  if (!parsedDate) {
    return 'N/A';
  }

  return parsedDate.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function getTrendPhrase(values) {
  if (!values.length) {
    return 'no clear trend';
  }

  const first = values[0] ?? 0;
  const last = values[values.length - 1] ?? 0;

  if (Math.abs(first) < 0.001 && Math.abs(last) < 0.001) {
    return 'flat trend';
  }

  if (Math.abs(first) < 0.001) {
    return 'strong increase';
  }

  const changeRatio = (last - first) / Math.abs(first);

  if (changeRatio >= 0.35) {
    return 'strong increase';
  }

  if (changeRatio >= 0.1) {
    return 'slight increase';
  }

  if (changeRatio <= -0.35) {
    return 'strong decrease';
  }

  if (changeRatio <= -0.1) {
    return 'slight decrease';
  }

  return 'mostly stable';
}

function getDepartmentImportanceHint(departmentBreakdown) {
  if (departmentBreakdown.length < 3) {
    return 'all departments are equal to you\nFocus on most lucrative one; delegate the rest';
  }

  const ranked = [...departmentBreakdown].sort(
    (left, right) => right.averageDurationMinutes - left.averageDurationMinutes,
  );

  const topAverage = ranked[0]?.averageDurationMinutes ?? 0;
  const secondAverage = ranked[1]?.averageDurationMinutes ?? 0;
  const thirdAverage = ranked[2]?.averageDurationMinutes ?? 0;

  const topIsClearlyHigher = topAverage - secondAverage >= 60;
  const topTwoAreClearlyHigher = secondAverage - thirdAverage >= 60;

  if (topIsClearlyHigher || topTwoAreClearlyHigher) {
    const highlightedDepartment = topTwoAreClearlyHigher
      ? `${ranked[0].name} and ${ranked[1].name}`
      : ranked[0].name;

    return `${highlightedDepartment} deparment the most important to you. Does it make you the most money?`;
  }

    return 'all departments are equal to you\nFocus on most lucrative one; delegate the rest';
}

function getMeetingConcentrationHint(records) {
  if (!records.length) {
    return 'meetings are spread througout the week';
  }

  const dayLabels = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const periods = ['mornings', 'afternoons', 'evenings', 'nights'];
  const dayCounts = new Array(7).fill(0);
  const periodCounts = { mornings: 0, afternoons: 0, evenings: 0, nights: 0 };
  let validRecordCount = 0;

  function formatNaturalList(values) {
    if (!values.length) {
      return '';
    }

    if (values.length === 1) {
      return values[0];
    }

    if (values.length === 2) {
      return `${values[0]} and ${values[1]}`;
    }

    return `${values.slice(0, -1).join(', ')} and ${values[values.length - 1]}`;
  }

  records.forEach((record) => {
    const date = new Date(record.startTime);
    if (!Number.isFinite(date.getTime())) {
      return;
    }

    validRecordCount += 1;

    const dayIndex = date.getDay();
    const hour = date.getHours();
    dayCounts[dayIndex] += 1;

    if (hour >= 5 && hour < 12) {
      periodCounts.mornings += 1;
    } else if (hour >= 12 && hour < 17) {
      periodCounts.afternoons += 1;
    } else if (hour >= 17 && hour < 22) {
      periodCounts.evenings += 1;
    } else {
      periodCounts.nights += 1;
    }
  });

  if (!validRecordCount) {
    return 'meetings are spread througout the week';
  }

  const averageDayVolume = validRecordCount / dayLabels.length;
  const dominantDayLabels = dayCounts
    .map((count, dayIndex) => ({ count, dayLabel: dayLabels[dayIndex] }))
    .filter((entry) => entry.count >= averageDayVolume * 1.2)
    .map((entry) => entry.dayLabel);

  const averagePeriodVolume = validRecordCount / periods.length;
  const dominantPeriods = periods.filter((period) => periodCounts[period] >= averagePeriodVolume * 1.2);

  if (!dominantDayLabels.length && !dominantPeriods.length) {
    return 'meetings are spread througout the week';
  }

  const dayPhrase = formatNaturalList(dominantDayLabels);
  const periodPhrase = formatNaturalList(dominantPeriods);

  if (dominantDayLabels.length && dominantPeriods.length === 1) {
    return `meetings are concentrated on ${dayPhrase} ${periodPhrase}`;
  }

  if (dominantDayLabels.length && dominantPeriods.length > 1) {
    return `meetings are concentrated on ${dayPhrase} during ${periodPhrase}`;
  }

  return `meetings are concentrated in ${periodPhrase}`;
}

function getCompanyDemandHint(companySeries) {
  if (companySeries.length < 2) {
    return 'All companies demand equal times';
  }

  const ranked = [...companySeries].sort((left, right) => right.totalMinutes - left.totalMinutes);
  const totalMinutes = ranked.reduce((sum, item) => sum + item.totalMinutes, 0);
  if (!totalMinutes) {
    return 'All companies demand equal times';
  }

  const topShare = ranked[0].totalMinutes / totalMinutes;
  const secondShare = ranked[1].totalMinutes / totalMinutes;

  if (topShare >= 0.45 || (topShare - secondShare) >= 0.15) {
    return `${ranked[0].name} demands most time; is it an important customer?`;
  }

  return 'All companies demand equal times';
}

function getMeetingControlHint(durationBuckets) {
  const totals = durationBuckets.reduce((accumulator, bucket) => ({
    byYou: accumulator.byYou + bucket.byYou,
    byOtherStaff: accumulator.byOtherStaff + bucket.byOtherStaff,
  }), { byYou: 0, byOtherStaff: 0 });

  if (totals.byYou > totals.byOtherStaff * 1.5) {
    return 'You have control of your meetings';
  }

  if (totals.byYou < totals.byOtherStaff * 0.5) {
    return 'You have little control of your meetings';
  }

  return 'You have moderate control of your meetings';
}

function getDecisionMakerHint(people) {
  if (!people.length) {
    return 'is this person an important decision maker?';
  }

  return `is ${people[0].person} an important decision maker?`;
}

function ExpandIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M8 4H4v4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M4 4l6 6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M16 20h4v-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M20 20l-6-6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M20 8V4h-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M14 10l6-6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M4 16v4h4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M10 14l-6 6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M6 6l12 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M18 6L6 18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function MeetingsIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="4" y="5" width="16" height="15" rx="2.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path d="M8 3v4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M16 3v4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M4 9h16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M8 13h3" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M8 16h6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function PeopleIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="9" cy="9" r="3" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path d="M4.5 18c.4-2.4 2.5-4 4.5-4s4.1 1.6 4.5 4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="16.5" cy="10" r="2.4" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path d="M14.7 18c.3-1.7 1.7-2.9 3.4-3" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function AlternativesIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M9 14h6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M12 4a6 6 0 0 0-3.4 10.9c.9.6 1.4 1.5 1.4 2.5V18h4v-.6c0-1 .5-1.9 1.4-2.5A6 6 0 0 0 12 4z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M10 21h4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function SettingsIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 8.1a3.9 3.9 0 1 0 0 7.8 3.9 3.9 0 0 0 0-7.8z" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path d="M19.2 12a7.4 7.4 0 0 0-.1-1.1l1.9-1.5-1.8-3.1-2.4 1a7.8 7.8 0 0 0-1.9-1.1l-.4-2.6h-3.6l-.4 2.6a7.8 7.8 0 0 0-1.9 1.1l-2.4-1-1.8 3.1 1.9 1.5a7.4 7.4 0 0 0-.1 1.1c0 .4 0 .7.1 1.1l-1.9 1.5 1.8 3.1 2.4-1c.6.5 1.2.8 1.9 1.1l.4 2.6h3.6l.4-2.6c.7-.3 1.3-.6 1.9-1.1l2.4 1 1.8-3.1-1.9-1.5c.1-.4.1-.7.1-1.1z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
    </svg>
  );
}

const NAV_ITEMS = [
  { id: 'page1', label: 'Page 1 · Meetings', shortLabel: 'Meetings', Icon: MeetingsIcon },
  { id: 'page2', label: 'Page 2 · People', shortLabel: 'People', Icon: PeopleIcon },
  { id: 'page3', label: 'Page 3 · Alternatives', shortLabel: 'Alternatives', Icon: AlternativesIcon },
  { id: 'page4', label: 'Settings', shortLabel: 'Settings', Icon: SettingsIcon },
];

function MetricCard({ label, value, accent, detail }) {
  return (
    <article className="metric-card">
      <span className="metric-accent" style={{ background: accent }} />
      <p className="metric-label">{label}</p>
      <h3>{value}</h3>
      <p className="metric-detail">{detail}</p>
    </article>
  );
}

function SegmentedControl({ value, options, onChange }) {
  return (
    <div className="segmented-control" role="tablist" aria-label="Selector">
      {options.map((option) => (
        <button
          key={option}
          type="button"
          className={option === value ? 'active' : ''}
          onClick={() => onChange(option)}
        >
          {option}
        </button>
      ))}
    </div>
  );
}

function DateRangeFilter({
  startDate,
  endDate,
  minDate,
  maxDate,
  onStartDateChange,
  onEndDateChange,
  disabled,
}) {
  return (
    <div className="date-filter" role="group" aria-label="Date range filter">
      <label className="date-filter-field">
        <span>Start</span>
        <input
          type="date"
          value={startDate}
          min={minDate}
          max={maxDate}
          disabled={disabled}
          onChange={(event) => onStartDateChange(event.target.value)}
        />
      </label>
      <label className="date-filter-field">
        <span>End</span>
        <input
          type="date"
          value={endDate}
          min={minDate}
          max={maxDate}
          disabled={disabled}
          onChange={(event) => onEndDateChange(event.target.value)}
        />
      </label>
    </div>
  );
}

function ChartCard({ eyebrow, title, value, children, granularity, onGranularityChange, extraAction, onExpand, infoHint }) {
  return (
    <section className="chart-card">
      <div className="chart-header">
        <div>
          <p className="chart-eyebrow">{eyebrow}</p>
          <h3>{title}</h3>
          <p className="chart-value">{value}</p>
        </div>
        <div className="chart-actions">
          {onExpand ? (
            <div className="chart-toolbar">
              {infoHint ? (
                <button
                  type="button"
                  className="chart-info-button"
                  aria-label={`${title} trend insight: ${infoHint}`}
                  title={infoHint}
                >
                  ?
                </button>
              ) : null}
              <button
                type="button"
                className="chart-expand-button"
                aria-label={`Expand ${title}`}
                onClick={onExpand}
              >
                <ExpandIcon />
              </button>
            </div>
          ) : null}
          {granularity && onGranularityChange ? (
            <SegmentedControl value={granularity} options={GRANULARITIES} onChange={onGranularityChange} />
          ) : null}
          {extraAction}
        </div>
      </div>
      {children}
    </section>
  );
}

function ScoreTable({ title, rows }) {
  return (
    <section className="chart-card table-card">
      <div className="chart-header">
        <div>
          <p className="chart-eyebrow">Ranking</p>
          <h3>{title}</h3>
          <p className="chart-value">Top 5 people</p>
        </div>
      </div>
      <div className="table-wrap">
        <table className="score-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Person</th>
              <th>Score</th>
              <th>Avg Duration</th>
              <th>Overall Avg</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={`${title}-${row.person}`}>
                <td>{row.rank}</td>
                <td>{row.person}</td>
                <td>{row.score.toFixed(1)}</td>
                <td>{Math.round(row.averageDurationMinutes)} min</td>
                <td>{Math.round(row.overallAverageDurationMinutes)} min</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function App() {
  const [meetingData, setMeetingData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activePage, setActivePage] = useState('page1');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [expandedChart, setExpandedChart] = useState(null);

  const [lineGranularity, setLineGranularity] = useState('weeks');
  const [startDateFilter, setStartDateFilter] = useState('');
  const [endDateFilter, setEndDateFilter] = useState('');

  const [page2CompanyFilter, setPage2CompanyFilter] = useState('All companies');
  const [page2RoleGranularity, setPage2RoleGranularity] = useState('hours');
  const [page2TrendGranularity, setPage2TrendGranularity] = useState('weeks');
  const [backendConfig, setBackendConfig] = useState(DEFAULT_BACKEND_CONFIG);
  const [startupForm, setStartupForm] = useState({
    myEmail: '',
    firefliesApiKey: '',
    paidPlan: false,
    companyDomains: '',
  });
  const [settingsForm, setSettingsForm] = useState({
    myEmail: '',
    firefliesApiKey: '',
    paidPlan: false,
    startup: false,
    companyDomains: '',
  });
  const [showStartupForm, setShowStartupForm] = useState(false);
  const [isSavingStartup, setIsSavingStartup] = useState(false);
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [isRunningUpdate, setIsRunningUpdate] = useState(false);
  const [updateProgress, setUpdateProgress] = useState(null);
  const [updateStartDate, setUpdateStartDate] = useState('');
  const [updateEndDate, setUpdateEndDate] = useState('');
  const [settingsMessage, setSettingsMessage] = useState('');
  const [loadError, setLoadError] = useState('');

  function syncFormsFromConfig(nextConfig) {
    setStartupForm({
      myEmail: nextConfig['my-email'] || '',
      firefliesApiKey: nextConfig['fireflies-api-key'] || '',
      paidPlan: Boolean(nextConfig['paid-plan']),
      companyDomains: toDomainsInput(nextConfig['company-domains']),
    });

    setSettingsForm({
      myEmail: nextConfig['my-email'] || '',
      firefliesApiKey: nextConfig['fireflies-api-key'] || '',
      paidPlan: Boolean(nextConfig['paid-plan']),
      startup: Boolean(nextConfig.startup),
      companyDomains: toDomainsInput(nextConfig['company-domains']),
    });
  }

  useEffect(() => {
    let active = true;

    async function loadMeetingData() {
      setLoading(true);
      setLoadError('');

      try {
        if (APP_CONFIG.demo) {
          const response = await fetch(`${import.meta.env.BASE_URL}data/meetingData.json`);
          const payload = await response.json();

          if (active) {
            setMeetingData(Array.isArray(payload) ? payload : []);
            setBackendConfig(DEFAULT_BACKEND_CONFIG);
            syncFormsFromConfig(DEFAULT_BACKEND_CONFIG);
            setShowStartupForm(false);
            setLoading(false);
          }
          return;
        }

        if (!APP_CONFIG.backendUrl) {
          throw new Error('Missing backendUrl in config.json while demo mode is disabled.');
        }

        const remoteConfig = await fetchBackendConfig(APP_CONFIG.backendUrl);
        const remoteMeetingData = await fetchMeetingDataFromBackend(APP_CONFIG.backendUrl);

        if (active) {
          setBackendConfig(remoteConfig);
          syncFormsFromConfig(remoteConfig);
          setShowStartupForm(Boolean(remoteConfig.startup));
          setMeetingData(remoteMeetingData);
          const sortedDates = remoteMeetingData
            .map((record) => new Date(record.startTime))
            .filter((date) => Number.isFinite(date.getTime()))
            .sort((left, right) => left - right);

          if (sortedDates.length) {
            setUpdateStartDate((current) => current || formatDateInputValue(sortedDates[0]));
            setUpdateEndDate((current) => current || formatDateInputValue(sortedDates[sortedDates.length - 1]));
          }

          setLoading(false);
        }
      } catch (error) {
        if (active) {
          setMeetingData([]);
          setLoading(false);
          setLoadError(error instanceof Error ? error.message : 'Unable to load data.');
        }
      }
    }

    loadMeetingData();

    return () => {
      active = false;
    };
  }, []);

  async function handleStartupSubmit(event) {
    event.preventDefault();

    if (APP_CONFIG.demo || !APP_CONFIG.backendUrl) {
      setShowStartupForm(false);
      return;
    }

    setIsSavingStartup(true);
    setSettingsMessage('');

    const payload = {
      'my-email': startupForm.myEmail.trim(),
      'fireflies-api-key': startupForm.firefliesApiKey.trim(),
      'paid-plan': startupForm.paidPlan,
      'company-domains': parseDomainsInput(startupForm.companyDomains),
      startup: false,
    };

    try {
      const serverConfig = await patchBackendConfig(APP_CONFIG.backendUrl, payload);
      const nextConfig = {
        ...backendConfig,
        ...payload,
        ...(serverConfig && typeof serverConfig === 'object' ? serverConfig : {}),
      };

      setBackendConfig(nextConfig);
      syncFormsFromConfig(nextConfig);
      setShowStartupForm(false);
      setSettingsMessage('Startup configuration saved.');
    } catch (error) {
      setSettingsMessage(error instanceof Error ? error.message : 'Failed to save startup configuration.');
    } finally {
      setIsSavingStartup(false);
    }
  }

  async function handleSettingsSubmit(event) {
    event.preventDefault();

    if (APP_CONFIG.demo || !APP_CONFIG.backendUrl) {
      setSettingsMessage('Demo mode is enabled. Backend settings are not editable.');
      return;
    }

    setIsSavingSettings(true);
    setSettingsMessage('');

    const payload = {
      'my-email': settingsForm.myEmail.trim(),
      'fireflies-api-key': settingsForm.firefliesApiKey.trim(),
      'paid-plan': settingsForm.paidPlan,
      'company-domains': parseDomainsInput(settingsForm.companyDomains),
      startup: settingsForm.startup,
    };

    try {
      const serverConfig = await patchBackendConfig(APP_CONFIG.backendUrl, payload);
      const nextConfig = {
        ...backendConfig,
        ...payload,
        ...(serverConfig && typeof serverConfig === 'object' ? serverConfig : {}),
      };

      setBackendConfig(nextConfig);
      syncFormsFromConfig(nextConfig);
      setSettingsMessage('Settings updated successfully.');
    } catch (error) {
      setSettingsMessage(error instanceof Error ? error.message : 'Failed to update settings.');
    } finally {
      setIsSavingSettings(false);
    }
  }

  async function handleRunBackendUpdate(event) {
    event.preventDefault();

    if (APP_CONFIG.demo || !APP_CONFIG.backendUrl) {
      setSettingsMessage('Demo mode is enabled. Backend update is unavailable.');
      return;
    }

    if (!updateStartDate || !updateEndDate) {
      setSettingsMessage('Please choose both start and end dates before running update.');
      return;
    }

    setIsRunningUpdate(true);
    setSettingsMessage('Starting backend update...');
    setUpdateProgress(null);

    try {
      await startBackendUpdate(APP_CONFIG.backendUrl, updateStartDate, updateEndDate);

      let latestProgress = null;
      do {
        latestProgress = await fetchUpdateProgress(APP_CONFIG.backendUrl);
        setUpdateProgress(latestProgress);

        if (latestProgress?.running) {
          await sleep(1500);
        }
      } while (latestProgress?.running);

      const refreshedData = await fetchMeetingDataFromBackend(APP_CONFIG.backendUrl);
      setMeetingData(refreshedData);

      if (latestProgress?.error) {
        setSettingsMessage(`Update finished with error: ${latestProgress.error}`);
      } else {
        setSettingsMessage('Update completed and data refreshed from /database.');
      }
    } catch (error) {
      setSettingsMessage(error instanceof Error ? error.message : 'Failed to run backend update.');
    } finally {
      setIsRunningUpdate(false);
    }
  }

  useEffect(() => {
    if (!expandedChart) {
      return undefined;
    }

    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        setExpandedChart(null);
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [expandedChart]);

  const availableDateRange = useMemo(() => {
    const timestamps = meetingData
      .map((record) => new Date(record.startTime).getTime())
      .filter((value) => Number.isFinite(value));

    if (!timestamps.length) {
      return null;
    }

    return {
      minDate: new Date(Math.min(...timestamps)),
      maxDate: new Date(Math.max(...timestamps)),
    };
  }, [meetingData]);

  useEffect(() => {
    if (!availableDateRange) {
      return;
    }

    const minDate = formatDateInputValue(availableDateRange.minDate);
    const maxDate = formatDateInputValue(availableDateRange.maxDate);

    setStartDateFilter((current) => current || minDate);
    setEndDateFilter((current) => current || maxDate);
  }, [availableDateRange]);

  const minDateFilterValue = availableDateRange ? formatDateInputValue(availableDateRange.minDate) : '';
  const maxDateFilterValue = availableDateRange ? formatDateInputValue(availableDateRange.maxDate) : '';

  const filteredMeetingData = useMemo(() => {
    const startBoundary = parseDateInputValue(startDateFilter);
    const endBoundary = parseDateInputValue(endDateFilter);

    if (endBoundary) {
      endBoundary.setHours(23, 59, 59, 999);
    }

    return meetingData.filter((record) => {
      const recordDate = new Date(record.startTime);

      if (!Number.isFinite(recordDate.getTime())) {
        return false;
      }

      if (startBoundary && recordDate < startBoundary) {
        return false;
      }

      if (endBoundary && recordDate > endBoundary) {
        return false;
      }

      return true;
    });
  }, [endDateFilter, meetingData, startDateFilter]);

  const selectedRangeLabel = startDateFilter && endDateFilter
    ? `${formatDateTag(startDateFilter)} - ${formatDateTag(endDateFilter)}`
    : 'All dates';

  function handleStartDateChange(nextStartDate) {
    setStartDateFilter(nextStartDate);

    if (endDateFilter && nextStartDate && nextStartDate > endDateFilter) {
      setEndDateFilter(nextStartDate);
    }
  }

  function handleEndDateChange(nextEndDate) {
    setEndDateFilter(nextEndDate);

    if (startDateFilter && nextEndDate && nextEndDate < startDateFilter) {
      setStartDateFilter(nextEndDate);
    }
  }

  const summary = getSummaryMetrics(filteredMeetingData);

  const lineSeries = getLineSeries(filteredMeetingData, lineGranularity);
  const lineGranularityLabel = getGranularityLabel(lineGranularity).toLowerCase();
  const lineValues = useMemo(
    () => lineSeries.map((item) => formatValue(item.value, lineGranularity)),
    [lineGranularity, lineSeries],
  );
  const lineTrendValues = useMemo(
    () => {
      if (!lineValues.length) {
        return [];
      }

      if (lineValues.length === 1) {
        return [lineValues[0]];
      }

      const points = lineValues.map((value, index) => ({ x: index, y: value }));
      const n = points.length;
      const sumX = points.reduce((sum, point) => sum + point.x, 0);
      const sumY = points.reduce((sum, point) => sum + point.y, 0);
      const sumXY = points.reduce((sum, point) => sum + (point.x * point.y), 0);
      const sumXSquare = points.reduce((sum, point) => sum + (point.x * point.x), 0);

      const denominator = (n * sumXSquare) - (sumX * sumX);
      if (Math.abs(denominator) < 0.000001) {
        return [...lineValues];
      }

      const slope = ((n * sumXY) - (sumX * sumY)) / denominator;
      const intercept = (sumY - (slope * sumX)) / n;

      return points.map((point) => Number((intercept + (slope * point.x)).toFixed(2)));
    },
    [lineValues],
  );
  const lineTrendPhrase = useMemo(() => getTrendPhrase(lineTrendValues), [lineTrendValues]);
  const departmentSeries = getDepartmentBreakdown(filteredMeetingData, 'hours');
  const departmentInsight = useMemo(
    () => getDepartmentImportanceHint(departmentSeries),
    [departmentSeries],
  );
  const companySeries = useMemo(() => getCompanyTimeBreakdown(filteredMeetingData, 'hours'), [filteredMeetingData]);
  const companyDemandHint = useMemo(() => getCompanyDemandHint(companySeries), [companySeries]);
  const heatmapSeries = getHeatmapSeries(filteredMeetingData, 'hours');
  const heatmapConcentrationHint = useMemo(() => getMeetingConcentrationHint(filteredMeetingData), [filteredMeetingData]);
  const durationHistogram = getDurationHistogram(filteredMeetingData);
  const meetingControlHint = useMemo(() => getMeetingControlHint(durationHistogram), [durationHistogram]);

  const personStats = useMemo(() => getPage2PersonStats(filteredMeetingData), [filteredMeetingData]);
  const companyOptions = useMemo(() => getCompanyOptions(personStats), [personStats]);
  useEffect(() => {
    if (!companyOptions.includes(page2CompanyFilter)) {
      setPage2CompanyFilter('All companies');
    }
  }, [companyOptions, page2CompanyFilter]);
  const filteredPersonStats = useMemo(
    () => filterPersonStatsByCompany(personStats, page2CompanyFilter),
    [page2CompanyFilter, personStats],
  );
  const topPeopleForChart = useMemo(() => filteredPersonStats.slice(0, 30), [filteredPersonStats]);
  const decisionMakerHint = useMemo(() => getDecisionMakerHint(topPeopleForChart), [topPeopleForChart]);
  const topThreeBestFriends = filteredPersonStats.slice(0, 3);
  const dotPlotData = useMemo(
    () => getDotPlotData(filteredMeetingData, page2CompanyFilter),
    [filteredMeetingData, page2CompanyFilter],
  );
  const externalVsStaffTrend = useMemo(
    () => getExternalVsStaffTrend(filteredMeetingData, page2TrendGranularity),
    [filteredMeetingData, page2TrendGranularity],
  );
  const talkativeTop = useMemo(
    () => getTopPeopleByScore(filteredPersonStats, 'talkativeScore', summary.averageDuration),
    [filteredPersonStats, summary.averageDuration],
  );
  const inquisitiveTop = useMemo(
    () => getTopPeopleByScore(filteredPersonStats, 'inquisitiveScore', summary.averageDuration),
    [filteredPersonStats, summary.averageDuration],
  );
  const meetingMixData = useMemo(() => getMeetingMixData(filteredMeetingData), [filteredMeetingData]);
  const meetingNeedAnalysis = useMemo(() => getMeetingNeedAnalysis(filteredMeetingData), [filteredMeetingData]);

  const lineOption = {
    tooltip: {
      trigger: 'axis',
      formatter: (params) => {
        const point = params[0];
        const bucket = lineSeries[point.dataIndex];
        const trendPoint = params.find((item) => item.seriesName === 'Average trend');

        if (!bucket) {
          return `${point.axisValue}<br/>No data`;
        }

        const total = formatValue(bucket.value, lineGranularity);
        const average = bucket.count ? bucket.value / bucket.count : 0;

        return [
          point.axisValue,
          `${point.marker} Total: ${total} ${lineGranularityLabel}`,
          `Avg meeting duration: ${Math.round(average)} min`,
          `Meetings: ${bucket.count}`,
          trendPoint ? `${trendPoint.marker} Average trend: ${trendPoint.value} ${lineGranularityLabel}` : null,
        ].filter(Boolean).join('<br/>');
      },
    },
    legend: {
      top: 0,
      textStyle: { color: '#40506b' },
      itemWidth: 12,
      itemHeight: 12,
    },
    toolbox: {
      right: 8,
      top: 0,
      feature: {
        dataZoom: { yAxisIndex: 'none' },
        restore: {},
      },
      iconStyle: { borderColor: '#5a6880' },
    },
    dataZoom: [
      { type: 'inside', xAxisIndex: 0, filterMode: 'none' },
      { type: 'slider', xAxisIndex: 0, height: 18, bottom: 4, borderColor: 'rgba(63, 81, 112, 0.15)' },
    ],
    grid: { top: 54, right: 20, bottom: 56, left: 44 },
    xAxis: {
      type: 'category',
      boundaryGap: false,
      axisLine: { lineStyle: { color: '#8190a8' } },
      axisLabel: { color: '#5a6880', hideOverlap: true },
      data: lineSeries.map((item) => item.label),
    },
    yAxis: {
      type: 'value',
      axisLabel: { color: '#5a6880' },
      splitLine: { lineStyle: { color: 'rgba(63, 81, 112, 0.08)' } },
    },
    series: [
      {
        name: 'Total time',
        type: 'line',
        smooth: true,
        showSymbol: false,
        lineStyle: { width: 3, color: '#16324f' },
        areaStyle: {
          color: {
            type: 'linear',
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [
              { offset: 0, color: 'rgba(25, 91, 146, 0.35)' },
              { offset: 1, color: 'rgba(25, 91, 146, 0.03)' },
            ],
          },
        },
        data: lineValues,
      },
      {
        name: 'Average trend',
        type: 'line',
        smooth: true,
        showSymbol: false,
        lineStyle: { width: 2, type: 'dashed', color: '#c97342' },
        itemStyle: { color: '#c97342' },
        data: lineTrendValues,
      },
    ],
  };

  const departmentOption = {
    tooltip: {
      formatter: ({ data }) => {
        if (!data) {
          return 'No data';
        }

        return [
          data.name,
          `Total duration: ${formatValue(data.totalMinutes, 'hours')} hours`,
          `Avg duration: ${Math.round(data.averageDurationMinutes)} min`,
          `Median duration: ${Math.round(data.medianDurationMinutes)} min`,
          `Meetings: ${data.meetingCount}`,
        ].join('<br/>');
      },
    },
    series: [
      {
        type: 'treemap',
        roam: false,
        breadcrumb: { show: false },
        itemStyle: {
          borderColor: '#f4f1ea',
          borderWidth: 4,
          gapWidth: 4,
        },
        levels: [
          {
            color: ['#16324f', '#c97342', '#4c8c77', '#7b8ba5', '#d7b97f', '#6a5871'],
            colorMappingBy: 'value',
          },
        ],
        label: {
          color: '#f4f1ea',
          fontWeight: 600,
          formatter: ({ data }) => {
            if (!data) {
              return '';
            }

            const totalHours = formatValue(data.totalMinutes, 'hours');
            const averageMinutes = Math.round(data.averageDurationMinutes);
            const medianMinutes = Math.round(data.medianDurationMinutes);
            return `${data.name}\nTotal: ${totalHours}h\nAvg: ${averageMinutes}m\nMedian: ${medianMinutes}m`;
          },
        },
        data: departmentSeries,
      },
    ],
  };

  const companyOption = {
    tooltip: {
      trigger: 'item',
      formatter: ({ data, percent }) => {
        if (!data) {
          return 'No data';
        }

        return [
          data.name,
          `Total duration: ${formatValue(data.totalMinutes, 'hours')} hours (${percent}%)`,
          `Avg duration: ${Math.round(data.averageDurationMinutes)} min`,
        ].join('<br/>');
      },
    },
    legend: {
      bottom: 0,
      textStyle: { color: '#40506b' },
      itemWidth: 12,
      itemHeight: 12,
    },
    series: [
      {
        type: 'pie',
        radius: ['58%', '78%'],
        center: ['50%', '45%'],
        avoidLabelOverlap: true,
        label: { color: '#40506b' },
        labelLine: { lineStyle: { color: '#9aa7bb' } },
        itemStyle: {
          borderColor: '#f4f1ea',
          borderWidth: 3,
        },
        color: ['#16324f', '#c97342', '#4c8c77', '#d7b97f', '#7b8ba5', '#a94f58'],
        data: companySeries,
      },
    ],
  };

  const heatmapOption = {
    tooltip: {
      position: 'top',
      formatter: (params) => `${heatmapSeries.yAxis[params.value[1]]} / ${heatmapSeries.xAxis[params.value[0]]}<br/>${params.value[2]} meetings`,
    },
    grid: { top: 12, right: 12, bottom: 52, left: 58 },
    xAxis: {
      type: 'category',
      data: heatmapSeries.xAxis,
      splitArea: { show: false },
      axisLabel: { color: '#5a6880', rotate: 0, hideOverlap: true },
      axisLine: { lineStyle: { color: '#93a1b7' } },
    },
    yAxis: {
      type: 'category',
      data: heatmapSeries.yAxis,
      splitArea: { show: false },
      axisLabel: { color: '#5a6880' },
      axisLine: { lineStyle: { color: '#93a1b7' } },
    },
    visualMap: {
      min: 0,
      max: Math.max(...heatmapSeries.series.map((item) => item[2]), 1),
      orient: 'horizontal',
      left: 'center',
      bottom: 0,
      calculable: true,
      textStyle: { color: '#40506b' },
      inRange: {
        color: ['#edf0f4', '#cdd8e7', '#8fb2c1', '#4c8c77', '#16324f'],
      },
    },
    series: [
      {
        type: 'heatmap',
        data: heatmapSeries.series,
        label: { show: false },
      },
    ],
  };

  const durationOption = {
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      formatter: (params) => {
        const bucket = durationHistogram.find((entry) => entry.label === params[0].axisValue);
        if (!bucket) {
          return `${params[0].axisValue}<br/>No data`;
        }

        const total = bucket.byYou + bucket.byOtherStaff;
        const byYouPct = total ? (bucket.byYou / total) * 100 : 0;
        const byOtherPct = total ? (bucket.byOtherStaff / total) * 100 : 0;

        return [
          params[0].axisValue,
          `${params[0].marker} By you: ${Math.round(byYouPct)}% (${bucket.byYou} meetings)`,
          `${params[1].marker} By other staff: ${Math.round(byOtherPct)}% (${bucket.byOtherStaff} meetings)`,
          `Total meetings: ${total}`,
        ].join('<br/>');
      },
    },
    legend: {
      top: 0,
      textStyle: { color: '#40506b' },
    },
    grid: { top: 40, right: 20, bottom: 34, left: 44 },
    xAxis: {
      type: 'category',
      data: durationHistogram.map((item) => item.label),
      axisLine: { lineStyle: { color: '#93a1b7' } },
      axisLabel: { color: '#5a6880', hideOverlap: true },
    },
    yAxis: {
      type: 'value',
      max: 100,
      name: 'Share of meetings (%)',
      axisLabel: { color: '#5a6880', formatter: '{value}%' },
      splitLine: { lineStyle: { color: 'rgba(63, 81, 112, 0.08)' } },
    },
    series: [
      {
        name: 'By you',
        type: 'bar',
        stack: 'ownership',
        data: durationHistogram.map((item) => {
          const total = item.byYou + item.byOtherStaff;
          return total ? Number(((item.byYou / total) * 100).toFixed(1)) : 0;
        }),
        label: {
          show: true,
          position: 'inside',
          color: '#f4f1ea',
          fontWeight: 600,
          formatter: ({ value }) => (value ? `${Math.round(value)}%` : ''),
        },
        itemStyle: {
          color: '#16324f',
          borderRadius: [0, 0, 0, 0],
        },
      },
      {
        name: 'By other staff',
        type: 'bar',
        stack: 'ownership',
        data: durationHistogram.map((item) => {
          const total = item.byYou + item.byOtherStaff;
          return total ? Number(((item.byOtherStaff / total) * 100).toFixed(1)) : 0;
        }),
        label: {
          show: true,
          position: 'inside',
          color: '#ffffff',
          fontWeight: 600,
          formatter: ({ value }) => (value ? `${Math.round(value)}%` : ''),
        },
        itemStyle: {
          color: '#c97342',
          borderRadius: [8, 8, 0, 0],
        },
      },
    ],
  };

  const personTimeOption = {
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      formatter: (params) => {
        const activeBar = params.find((item) => Number(item.value) > 0) ?? params[0];
        const person = topPeopleForChart[activeBar.dataIndex];
        const isInternal = (person?.company || '').trim().toLowerCase() === 'denteel';
        const personType = isInternal ? 'Internal (Denteel)' : 'External';

        return [
          person?.person || activeBar.name,
          `${activeBar.marker} Total time: ${activeBar.value} hours`,
          `Type: ${personType}`,
        ].join('<br/>');
      },
    },
    legend: {
      top: 0,
      textStyle: { color: '#40506b' },
      data: ['Internal (Denteel)', 'External'],
    },
    grid: { top: 44, right: 20, bottom: 28, left: 140 },
    dataZoom: [
      { type: 'inside', yAxisIndex: 0 },
      { type: 'slider', yAxisIndex: 0, width: 12, right: 4, top: 24, bottom: 30 },
    ],
    xAxis: {
      type: 'value',
      name: getGranularityLabel('hours'),
      axisLabel: { color: '#5a6880' },
      splitLine: { lineStyle: { color: 'rgba(63, 81, 112, 0.08)' } },
    },
    yAxis: {
      type: 'category',
      data: topPeopleForChart.map((entry) => entry.person),
      axisLabel: { color: '#5a6880' },
    },
    series: [
      {
        name: 'Internal (Denteel)',
        type: 'bar',
        stack: 'personType',
        data: topPeopleForChart.map((entry) => {
          const isInternal = (entry.company || '').trim().toLowerCase() === 'denteel';
          return isInternal ? formatValue(entry.totalMinutes, 'hours') : 0;
        }),
        itemStyle: { color: '#16324f', borderRadius: [0, 8, 8, 0] },
      },
      {
        name: 'External',
        type: 'bar',
        stack: 'personType',
        data: topPeopleForChart.map((entry) => {
          const isInternal = (entry.company || '').trim().toLowerCase() === 'denteel';
          return isInternal ? 0 : formatValue(entry.totalMinutes, 'hours');
        }),
        itemStyle: { color: '#c97342', borderRadius: [0, 8, 8, 0] },
      },
    ],
  };

  const dotPlotOption = {
    tooltip: {
      formatter: ({ data }) => `${data.person}<br/>${new Date(data.value[0]).toLocaleString()}<br/>${data.duration} min`,
    },
    grid: { top: 20, right: 20, bottom: 42, left: 150 },
    dataZoom: [{ type: 'inside', yAxisIndex: 0 }, { type: 'slider', yAxisIndex: 0, width: 12, right: 4, top: 24, bottom: 42 }],
    xAxis: {
      type: 'time',
      axisLabel: { color: '#5a6880' },
      axisLine: { lineStyle: { color: '#93a1b7' } },
    },
    yAxis: {
      type: 'category',
      data: dotPlotData.people,
      axisLabel: { color: '#5a6880' },
    },
    series: [
      {
        type: 'scatter',
        data: dotPlotData.points,
        symbolSize: (value, params) => Math.max(6, Math.min(14, Math.round(params.data.duration / 12))),
        itemStyle: { color: '#4c8c77', opacity: 0.8 },
      },
    ],
  };

  const hostVsAttendeeOption = {
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    legend: { top: 0, textStyle: { color: '#40506b' } },
    grid: { top: 42, right: 20, bottom: 30, left: 140 },
    dataZoom: [
      { type: 'inside', yAxisIndex: 0 },
      { type: 'slider', yAxisIndex: 0, width: 12, right: 4, top: 24, bottom: 30 },
    ],
    xAxis: {
      type: 'value',
      name: getGranularityLabel(page2RoleGranularity),
      axisLabel: { color: '#5a6880' },
      splitLine: { lineStyle: { color: 'rgba(63, 81, 112, 0.08)' } },
    },
    yAxis: {
      type: 'category',
      data: filteredPersonStats.map((entry) => entry.person),
      axisLabel: { color: '#5a6880' },
    },
    series: [
      {
        name: 'You host',
        type: 'bar',
        data: filteredPersonStats.map((entry) => formatValue(entry.hostMinutes, page2RoleGranularity)),
        itemStyle: { color: '#16324f', borderRadius: [0, 8, 8, 0] },
      },
      {
        name: 'You attend',
        type: 'bar',
        data: filteredPersonStats.map((entry) => formatValue(entry.attendeeMinutes, page2RoleGranularity)),
        itemStyle: { color: '#c97342', borderRadius: [0, 8, 8, 0] },
      },
    ],
  };

  const externalVsStaffOption = {
    tooltip: { trigger: 'axis' },
    legend: { top: 0, textStyle: { color: '#40506b' } },
    grid: { top: 44, right: 20, bottom: 30, left: 44 },
    xAxis: {
      type: 'category',
      data: externalVsStaffTrend.map((entry) => entry.label),
      axisLabel: { color: '#5a6880' },
      axisLine: { lineStyle: { color: '#93a1b7' } },
    },
    yAxis: {
      type: 'value',
      name: getGranularityLabel(page2TrendGranularity),
      axisLabel: { color: '#5a6880' },
      splitLine: { lineStyle: { color: 'rgba(63, 81, 112, 0.08)' } },
    },
    series: [
      {
        name: 'External stakeholders',
        type: 'line',
        smooth: true,
        data: externalVsStaffTrend.map((entry) => formatValue(entry.externalMinutes, page2TrendGranularity)),
        itemStyle: { color: '#c97342' },
      },
      {
        name: 'Staff',
        type: 'line',
        smooth: true,
        data: externalVsStaffTrend.map((entry) => formatValue(entry.staffMinutes, page2TrendGranularity)),
        itemStyle: { color: '#4c8c77' },
      },
    ],
  };

  const meetingMixOption = {
    tooltip: { trigger: 'item' },
    legend: { bottom: 0, textStyle: { color: '#40506b' } },
    series: [
      {
        type: 'pie',
        radius: ['42%', '75%'],
        center: ['50%', '46%'],
        label: { color: '#40506b' },
        itemStyle: { borderColor: '#f4f1ea', borderWidth: 3 },
        color: ['#16324f', '#4c8c77', '#c97342', '#7b8ba5', '#d7b97f', '#a94f58'],
        data: meetingMixData,
      },
    ],
  };

  const durationVsTalkShareOption = {
    tooltip: {
      trigger: 'item',
      formatter: ({ data }) => {
        if (!data) {
          return 'No data';
        }

        return [
          data.title,
          `Participants: ${data.participantSummary}`,
          `Duration: ${Math.round(data.value[0])} min`,
          `Jacques talk time: ${Math.round(data.value[1])}%`,
        ].join('<br/>');
      },
    },
    grid: { top: 44, right: 20, bottom: 42, left: 56 },
    xAxis: {
      type: 'value',
      name: 'Meeting duration (min)',
      axisLabel: { color: '#5a6880' },
      axisLine: { lineStyle: { color: '#93a1b7' } },
      splitLine: { lineStyle: { color: 'rgba(63, 81, 112, 0.08)' } },
    },
    yAxis: {
      type: 'value',
      name: 'My talk time (%)',
      min: 0,
      max: 100,
      axisLabel: { color: '#5a6880', formatter: '{value}%' },
      splitLine: { lineStyle: { color: 'rgba(63, 81, 112, 0.08)' } },
    },
    series: [
      {
        type: 'scatter',
        data: meetingNeedAnalysis.durationVsTalkShareScatter,
        symbolSize: 10,
        itemStyle: { color: '#16324f', opacity: 0.78 },
      },
    ],
  };

  const normalCurveOption = {
    tooltip: {
      trigger: 'item',
      formatter: (params) => {
        if (params.seriesName === 'Meetings') {
          return `${params.data.title}<br/>Duration: ${Math.round(params.data.value[0])} min`;
        }

        if (params.seriesName === 'Normal curve') {
          return `Duration: ${Math.round(params.value[0])} min<br/>Density: ${params.value[1]}`;
        }

        return 'No data';
      },
    },
    legend: {
      top: 0,
      textStyle: { color: '#40506b' },
      data: ['Normal curve', 'Meetings'],
    },
    grid: { top: 52, right: 24, bottom: 44, left: 56 },
    xAxis: {
      type: 'value',
      name: 'Meeting duration (min)',
      axisLabel: { color: '#5a6880' },
      axisLine: { lineStyle: { color: '#93a1b7' } },
    },
    yAxis: {
      type: 'value',
      name: 'Density',
      axisLabel: { color: '#5a6880' },
      splitLine: { lineStyle: { color: 'rgba(63, 81, 112, 0.08)' } },
    },
    series: [
      {
        name: 'Normal curve',
        type: 'line',
        smooth: true,
        showSymbol: false,
        lineStyle: { color: '#4c8c77', width: 3 },
        areaStyle: { color: 'rgba(76, 140, 119, 0.14)' },
        markLine: {
          symbol: 'none',
          label: { color: '#40506b' },
          lineStyle: { type: 'dashed', color: '#16324f' },
          data: [
            { xAxis: Number(meetingNeedAnalysis.durationNormalCurve.percentiles.p25.toFixed(2)), name: 'P25' },
            { xAxis: Number(meetingNeedAnalysis.durationNormalCurve.percentiles.p50.toFixed(2)), name: 'P50' },
            { xAxis: Number(meetingNeedAnalysis.durationNormalCurve.percentiles.p75.toFixed(2)), name: 'P75' },
          ],
        },
        data: meetingNeedAnalysis.durationNormalCurve.curve,
      },
      {
        name: 'Meetings',
        type: 'scatter',
        data: meetingNeedAnalysis.durationNormalCurve.points,
        symbolSize: 9,
        itemStyle: { color: '#c97342', opacity: 0.8 },
      },
    ],
  };

  const expandedChartConfig = {
    line: {
      eyebrow: 'Trend',
      title: 'Time spent in meetings',
      value: `Displayed in ${getGranularityLabel(lineGranularity).toLowerCase()}`,
      option: lineOption,
    },
    department: {
      eyebrow: 'Load',
      title: 'Time spent by department',
      value: 'Each block shows total, average, and median duration',
      option: departmentOption,
    },
    campaign: {
      eyebrow: 'Companies',
      title: 'Time spent per company',
      value: 'Donut values shown in hours with average duration on hover',
      option: companyOption,
    },
    heatmap: {
      eyebrow: 'Density',
      title: 'Days with the most meetings',
      value: 'Heat map by hour of day only',
      option: heatmapOption,
    },
    duration: {
      eyebrow: 'Distribution',
      title: 'Meetings by duration range',
      value: 'Stacked by hosted ownership percentages',
      option: durationOption,
    },
    p2PeopleTime: {
      eyebrow: 'People',
      title: 'Total time spent per person',
      value: `Filter: ${page2CompanyFilter} · Top 30 · Unit: hours · Color: internal vs external`,
      option: personTimeOption,
    },
    p2Dot: {
      eyebrow: 'Cadence',
      title: 'Best overall meeting rhythm',
      value: 'Each dot is one participant in one meeting',
      option: dotPlotOption,
    },
    p2HostAttendee: {
      eyebrow: 'Role split',
      title: 'Time spent as host vs attendee',
      value: `Compared by participant in ${getGranularityLabel(page2RoleGranularity).toLowerCase()}`,
      option: hostVsAttendeeOption,
    },
    p2ExternalStaff: {
      eyebrow: 'Relationship mix',
      title: 'External stakeholders vs staff',
      value: `Displayed in ${getGranularityLabel(page2TrendGranularity).toLowerCase()}`,
      option: externalVsStaffOption,
    },
    p2MeetingMix: {
      eyebrow: 'Structure',
      title: '1:1 vs 1:M meeting proportions',
      value: 'Subgrouped by staff, external, mixed',
      option: meetingMixOption,
    },
    p3DurationVsTalkShare: {
      eyebrow: 'Voice balance',
      title: 'Meeting duration vs my talk time %',
      value: 'Jacques speaking share from meetingData myTalkTime field',
      option: durationVsTalkShareOption,
    },
    p3Normal: {
      eyebrow: 'Normal curve',
      title: 'Meeting duration normal curve',
      value: 'P25, median, and P75 are overlaid on the distribution',
      option: normalCurveOption,
    },
  };

  const activeExpandedChart = expandedChart ? expandedChartConfig[expandedChart] : null;

  function navigateTo(pageId) {
    setActivePage(pageId);
    setIsSidebarOpen(false);
  }

  return (
    <div className={`app-shell${isSidebarOpen ? '' : ' sidebar-collapsed'}`}>
      <button
        type="button"
        className="sidebar-toggle"
        aria-expanded={isSidebarOpen}
        aria-controls="dashboard-sidebar"
        onClick={() => setIsSidebarOpen((current) => !current)}
      >
        {isSidebarOpen ? 'Close menu' : 'Open menu'}
      </button>

      <button
        type="button"
        className={`sidebar-overlay${isSidebarOpen ? ' visible' : ''}`}
        aria-label="Close sidebar"
        onClick={() => setIsSidebarOpen(false)}
      />

      <aside id="dashboard-sidebar" className={`sidebar${isSidebarOpen ? ' is-open' : ''}`}>
        <div>
          <p className="sidebar-kicker">Denteel</p>
          <h1>Jacques the COO</h1>
        </div>
        <nav>
          {NAV_ITEMS.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`nav-item${activePage === item.id ? ' active' : ''}`}
              onClick={() => navigateTo(item.id)}
            >
              {item.label}
            </button>
          ))}
        </nav>
        <p className="sidebar-note">
          Use the page switcher to move between time-based and relationship-based meeting analysis.
        </p>
      </aside>

      <nav className="sidebar-icon-rail" aria-label="Dashboard page tabs">
        {NAV_ITEMS.map((item) => {
          const Icon = item.Icon;
          return (
            <button
              key={item.id}
              type="button"
              className={`icon-nav-item${activePage === item.id ? ' active' : ''}`}
              onClick={() => navigateTo(item.id)}
              aria-label={item.shortLabel}
              title={item.shortLabel}
            >
              <Icon />
              <span className="sr-only">{item.shortLabel}</span>
            </button>
          );
        })}
      </nav>

      <button
        type="button"
        className="sidebar-desktop-toggle"
        aria-label={isSidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
        aria-expanded={isSidebarOpen}
        aria-controls="dashboard-sidebar"
        onClick={() => setIsSidebarOpen((current) => !current)}
      >
        {isSidebarOpen ? '›' : '‹'}
      </button>

      <main className="dashboard-content">
        {activePage === 'page1' ? (
          <>
            <header className="hero-card">
              <div>
                <p className="hero-kicker">Page 1</p>
                <h2>How much time do I spend on meetings?</h2>
                <p className="hero-copy">This view tracks overall meeting load, department distribution, and duration bands.</p>
              </div>
              <div className="hero-side">
                {/* <div className="hero-tag">Range: {selectedRangeLabel} · {loading ? 'Loading data...' : `${summary.meetingsCount.toLocaleString()} meetings`}</div> */}
                <DateRangeFilter
                  startDate={startDateFilter}
                  endDate={endDateFilter}
                  minDate={minDateFilterValue}
                  maxDate={maxDateFilterValue}
                  onStartDateChange={handleStartDateChange}
                  onEndDateChange={handleEndDateChange}
                  disabled={loading || !availableDateRange}
                />
              </div>
            </header>

            <section className="metrics-grid">
              <MetricCard
                label="Total time spent in meetings"
                value={`${formatValue(summary.totalMinutes, 'days')} days`}
                detail={`${formatValue(summary.totalMinutes, 'hours')} hours across the full dataset`}
                accent="linear-gradient(135deg, #16324f, #4c8c77)"
              />
              <MetricCard
                label="Average meeting duration"
                value={`${Math.round(summary.averageDuration)} min`}
                detail="Actual duration averaged across all sessions"
                accent="linear-gradient(135deg, #c97342, #d7b97f)"
              />
              <MetricCard
                label="Number of meetings"
                value={summary.meetingsCount.toLocaleString()}
                detail="Recorded meetings generated at hourly cadence"
                accent="linear-gradient(135deg, #4c8c77, #16324f)"
              />
            </section>

            <section className="charts-grid charts-grid-primary">
              <ChartCard
                eyebrow="Trend"
                title="Time spent in meetings"
                value={`Displayed in ${getGranularityLabel(lineGranularity).toLowerCase()}`}
                granularity={lineGranularity}
                onGranularityChange={setLineGranularity}
                onExpand={() => setExpandedChart('line')}
                infoHint={lineTrendPhrase}
              >
                <ReactEChartsCore echarts={echarts} option={lineOption} style={{ height: 320 }} />
              </ChartCard>

              <ChartCard
                eyebrow="Load"
                title="Time spent by department"
                value="Each block shows total, average, and median duration"
                onExpand={() => setExpandedChart('department')}
                infoHint={departmentInsight}
              >
                <ReactEChartsCore echarts={echarts} option={departmentOption} style={{ height: 320 }} />
              </ChartCard>
            </section>

            <section className="charts-grid charts-grid-secondary">
              <ChartCard
                eyebrow="Companies"
                title="Time spent per company"
                value="Donut values shown in hours with average duration on hover"
                onExpand={() => setExpandedChart('campaign')}
                infoHint={companyDemandHint}
              >
                <ReactEChartsCore echarts={echarts} option={companyOption} style={{ height: 340 }} />
              </ChartCard>

              <ChartCard
                eyebrow="Density"
                title="Days with the most meetings"
                value="Heat map by hour of day only"
                onExpand={() => setExpandedChart('heatmap')}
                infoHint={heatmapConcentrationHint}
              >
                <ReactEChartsCore echarts={echarts} option={heatmapOption} style={{ height: 340 }} />
              </ChartCard>
            </section>

            <section className="charts-grid charts-grid-tertiary">
              <ChartCard
                eyebrow="Distribution"
                title="Meetings by duration range"
                value="Stacked by hosted ownership percentages"
                onExpand={() => setExpandedChart('duration')}
                infoHint={meetingControlHint}
              >
                <ReactEChartsCore echarts={echarts} option={durationOption} style={{ height: 340 }} />
              </ChartCard>
            </section>
          </>
        ) : activePage === 'page2' ? (
          <>
            <header className="hero-card">
              <div>
                <p className="hero-kicker">Page 2</p>
                <h2>Who do I give my time to?</h2>
                <p className="hero-copy">Relationship analysis by person, role, cadence, audience mix, and speaking behavior.</p>
              </div>
              <div className="hero-side">
                <div className="hero-tag">Range: {selectedRangeLabel} · {loading ? 'Loading data...' : `${filteredPersonStats.length} people in view`}</div>
                <DateRangeFilter
                  startDate={startDateFilter}
                  endDate={endDateFilter}
                  minDate={minDateFilterValue}
                  maxDate={maxDateFilterValue}
                  onStartDateChange={handleStartDateChange}
                  onEndDateChange={handleEndDateChange}
                  disabled={loading || !availableDateRange}
                />
              </div>
            </header>

            <section className="metrics-grid">
              {topThreeBestFriends.length ? topThreeBestFriends.map((friend, index) => (
                <MetricCard
                  key={`best-friend-${friend.person}`}
                  label={`Best friend #${index + 1}`}
                  value={friend.person}
                  detail={`${formatValue(friend.totalMinutes, 'hours')} hours · ${friend.meetings} meetings`}
                  accent="linear-gradient(135deg, #16324f, #c97342)"
                />
              )) : (
                <MetricCard
                  label="Best friends"
                  value="No data"
                  detail="No matching people for current filter"
                  accent="linear-gradient(135deg, #16324f, #c97342)"
                />
              )}
            </section>

            <section className="charts-grid charts-grid-tertiary">
              <ChartCard
                eyebrow="People"
                title="Total time spent per person"
                value={`Filter: ${page2CompanyFilter} · Top 30 · Unit: hours · Color: internal vs external`}
                onExpand={() => setExpandedChart('p2PeopleTime')}
                infoHint={decisionMakerHint}
                extraAction={
                  <select
                    className="company-select"
                    value={page2CompanyFilter}
                    onChange={(event) => setPage2CompanyFilter(event.target.value)}
                  >
                    {companyOptions.map((option) => <option key={option} value={option}>{option}</option>)}
                  </select>
                }
              >
                <ReactEChartsCore echarts={echarts} option={personTimeOption} style={{ height: 360 }} />
              </ChartCard>
            </section>

            <section className="charts-grid charts-grid-tertiary">
              <ChartCard
                eyebrow="Cadence"
                title="Dot plot (best overall)"
                value="Recurring meetings appear as visible patterns"
                onExpand={() => setExpandedChart('p2Dot')}
              >
                <ReactEChartsCore echarts={echarts} option={dotPlotOption} style={{ height: 360 }} />
              </ChartCard>
            </section>

            <section className="charts-grid charts-grid-secondary">
              <ChartCard
                eyebrow="Role split"
                title="Time spent as host vs attendee"
                value={`Per participant in ${getGranularityLabel(page2RoleGranularity).toLowerCase()}`}
                granularity={page2RoleGranularity}
                onGranularityChange={setPage2RoleGranularity}
                onExpand={() => setExpandedChart('p2HostAttendee')}
              >
                <ReactEChartsCore echarts={echarts} option={hostVsAttendeeOption} style={{ height: 360 }} />
              </ChartCard>

              <ChartCard
                eyebrow="Relationship mix"
                title="External stakeholders vs staff"
                value={`Displayed in ${getGranularityLabel(page2TrendGranularity).toLowerCase()}`}
                granularity={page2TrendGranularity}
                onGranularityChange={setPage2TrendGranularity}
                onExpand={() => setExpandedChart('p2ExternalStaff')}
              >
                <ReactEChartsCore echarts={echarts} option={externalVsStaffOption} style={{ height: 360 }} />
              </ChartCard>
            </section>

            <section className="charts-grid charts-grid-secondary">
              <ScoreTable title="Highest talkative score" rows={talkativeTop} />
              <ScoreTable title="Highest inquisitiveness score" rows={inquisitiveTop} />
            </section>

            <section className="charts-grid charts-grid-tertiary">
              <ChartCard
                eyebrow="Structure"
                title="Proportion of 1:1 vs 1:M"
                value="Subgrouped into staff, external, and mixed"
                onExpand={() => setExpandedChart('p2MeetingMix')}
              >
                <ReactEChartsCore echarts={echarts} option={meetingMixOption} style={{ height: 380 }} />
              </ChartCard>
            </section>
          </>
        ) : activePage === 'page3' ? (
          <>
            <header className="hero-card">
              <div>
                <p className="hero-kicker">Page 3</p>
                <h2>Do I really need a meeting for this?</h2>
                <p className="hero-copy">A quick read on meeting duration shape and how much of each session you appear to be carrying.</p>
              </div>
              <div className="hero-side">
                <div className="hero-tag">Range: {selectedRangeLabel} · {loading ? 'Loading data...' : `${summary.meetingsCount.toLocaleString()} meetings`}</div>
                <DateRangeFilter
                  startDate={startDateFilter}
                  endDate={endDateFilter}
                  minDate={minDateFilterValue}
                  maxDate={maxDateFilterValue}
                  onStartDateChange={handleStartDateChange}
                  onEndDateChange={handleEndDateChange}
                  disabled={loading || !availableDateRange}
                />
              </div>
            </header>

            <section className="charts-grid charts-grid-secondary">
              <ChartCard
                eyebrow="Voice balance"
                title="Meeting duration vs my talk time %"
                value="Jacques speaking share from meetingData myTalkTime field"
                onExpand={() => setExpandedChart('p3DurationVsTalkShare')}
              >
                <ReactEChartsCore echarts={echarts} option={durationVsTalkShareOption} style={{ height: 360 }} />
              </ChartCard>

              <ChartCard
                eyebrow="Normal curve"
                title="Meeting duration normal curve"
                value="P25, median, and P75 are overlaid on the distribution"
                onExpand={() => setExpandedChart('p3Normal')}
              >
                <ReactEChartsCore echarts={echarts} option={normalCurveOption} style={{ height: 360 }} />
              </ChartCard>
            </section>
          </>
        ) : (
          <>
            <header className="hero-card">
              <div>
                <p className="hero-kicker">Settings</p>
                <h2>Connection and account configuration</h2>
                <p className="hero-copy">Manage backend credentials, plan mode, company domains, and startup behavior.</p>
              </div>
              <div className="hero-side">
                <div className="hero-tag">Mode: {APP_CONFIG.demo ? 'Demo' : 'Backend'}{APP_CONFIG.demo ? '' : ` · ${APP_CONFIG.backendUrl}`}</div>
              </div>
            </header>

            <section className="charts-grid charts-grid-tertiary">
              <section className="chart-card settings-card">
                <div className="chart-header">
                  <div>
                    <p className="chart-eyebrow">Backend config</p>
                    <h3>Editable values from /config</h3>
                    <p className="chart-value">
                      {APP_CONFIG.demo
                        ? 'Demo mode active: values below are local placeholders and cannot be saved to backend.'
                        : 'Update values and save to PATCH /config.'}
                    </p>
                  </div>
                </div>

                {loadError ? <p className="settings-message error">{loadError}</p> : null}
                {settingsMessage ? <p className="settings-message">{settingsMessage}</p> : null}

                <form className="settings-form" onSubmit={handleSettingsSubmit}>
                  <label className="settings-field">
                    <span className="settings-label">Meeting email</span>
                    <span className="settings-description">The email identity used to classify your meetings.</span>
                    <input
                      type="email"
                      value={settingsForm.myEmail}
                      onChange={(event) => setSettingsForm((current) => ({ ...current, myEmail: event.target.value }))}
                      disabled={APP_CONFIG.demo || isSavingSettings}
                    />
                  </label>

                  <label className="settings-field">
                    <span className="settings-label">Fireflies API key</span>
                    <span className="settings-description">API key used for meeting transcript ingestion and sync.</span>
                    <input
                      type="text"
                      value={settingsForm.firefliesApiKey}
                      onChange={(event) => setSettingsForm((current) => ({ ...current, firefliesApiKey: event.target.value }))}
                      disabled={APP_CONFIG.demo || isSavingSettings}
                    />
                  </label>

                  <label className="settings-field">
                    <span className="settings-label">Plan type</span>
                    <span className="settings-description">Whether your Fireflies plan is paid or free.</span>
                    <select
                      value={settingsForm.paidPlan ? 'paid' : 'free'}
                      onChange={(event) => setSettingsForm((current) => ({ ...current, paidPlan: event.target.value === 'paid' }))}
                      disabled={APP_CONFIG.demo || isSavingSettings}
                    >
                      <option value="free">Free</option>
                      <option value="paid">Paid</option>
                    </select>
                  </label>

                  <label className="settings-field">
                    <span className="settings-label">Company domains</span>
                    <span className="settings-description">Comma-separated domains treated as internal company addresses.</span>
                    <input
                      type="text"
                      value={settingsForm.companyDomains}
                      onChange={(event) => setSettingsForm((current) => ({ ...current, companyDomains: event.target.value }))}
                      placeholder="pontifex.co, denteel.com"
                      disabled={APP_CONFIG.demo || isSavingSettings}
                    />
                  </label>

                  <label className="settings-field">
                    <span className="settings-label">Startup prompt enabled</span>
                    <span className="settings-description">When true, onboarding runs on next load and asks for required setup details.</span>
                    <select
                      value={settingsForm.startup ? 'true' : 'false'}
                      onChange={(event) => setSettingsForm((current) => ({ ...current, startup: event.target.value === 'true' }))}
                      disabled={APP_CONFIG.demo || isSavingSettings}
                    >
                      <option value="false">False</option>
                      <option value="true">True</option>
                    </select>
                  </label>

                  <div className="settings-field">
                    <span className="settings-label">Requests used</span>
                    <span className="settings-description">Read-only counter returned by backend /config.</span>
                    <p className="settings-readonly-value">{Number(backendConfig['requests-used']) || 0}</p>
                  </div>

                  <button type="submit" className="settings-save" disabled={APP_CONFIG.demo || isSavingSettings}>
                    {isSavingSettings ? 'Saving...' : 'Save settings'}
                  </button>
                </form>

                <hr className="settings-divider" />

                <form className="settings-form" onSubmit={handleRunBackendUpdate}>
                  <p className="chart-value">Run backend transcript update for a date range (POST /update), then auto-refresh from GET /database.</p>

                  <div className="settings-inline-grid">
                    <label className="settings-field">
                      <span className="settings-label">Update start date</span>
                      <span className="settings-description">Earliest meeting date to fetch and map.</span>
                      <input
                        type="date"
                        value={updateStartDate}
                        onChange={(event) => setUpdateStartDate(event.target.value)}
                        disabled={APP_CONFIG.demo || isRunningUpdate}
                        required
                      />
                    </label>

                    <label className="settings-field">
                      <span className="settings-label">Update end date</span>
                      <span className="settings-description">Latest meeting date to fetch and map.</span>
                      <input
                        type="date"
                        value={updateEndDate}
                        onChange={(event) => setUpdateEndDate(event.target.value)}
                        disabled={APP_CONFIG.demo || isRunningUpdate}
                        required
                      />
                    </label>
                  </div>

                  <button type="submit" className="settings-save" disabled={APP_CONFIG.demo || isRunningUpdate}>
                    {isRunningUpdate ? 'Updating...' : 'Run update'}
                  </button>

                  {updateProgress ? (
                    <div className="settings-progress">
                      <p><strong>Status:</strong> {updateProgress.running ? 'Running' : 'Idle'}</p>
                      <p><strong>Message:</strong> {updateProgress.message || 'No message'}</p>
                      <p><strong>Window:</strong> {updateProgress.startDate || 'n/a'} to {updateProgress.endDate || 'n/a'}</p>
                      <p><strong>Batches:</strong> {updateProgress.completedBatches || 0} / {updateProgress.queuedBatches || 0}</p>
                      <p><strong>Mapped:</strong> {updateProgress.mappedTranscripts || 0} | <strong>Appended:</strong> {updateProgress.appendedTranscripts || 0} | <strong>Skipped:</strong> {updateProgress.skippedDuplicates || 0}</p>
                      {updateProgress.error ? <p><strong>Error:</strong> {String(updateProgress.error)}</p> : null}
                    </div>
                  ) : null}
                </form>
              </section>
            </section>
          </>
        )}
      </main>

      {showStartupForm && !APP_CONFIG.demo ? (
        <div className="startup-overlay" role="presentation">
          <section className="startup-modal" role="dialog" aria-modal="true" aria-label="Startup configuration">
            <div className="chart-modal-header">
              <div>
                <p className="chart-eyebrow">Startup setup</p>
                <h3>Complete your backend configuration</h3>
                <p className="chart-value">Please add required details before using non-demo mode.</p>
              </div>
            </div>

            <form className="settings-form" onSubmit={handleStartupSubmit}>
              <label className="settings-field">
                <span className="settings-label">Fireflies API key</span>
                <span className="settings-description">Used to fetch meeting transcripts and metadata.</span>
                <input
                  type="text"
                  value={startupForm.firefliesApiKey}
                  onChange={(event) => setStartupForm((current) => ({ ...current, firefliesApiKey: event.target.value }))}
                  disabled={isSavingStartup}
                  required
                />
              </label>

              <label className="settings-field">
                <span className="settings-label">Plan type</span>
                <span className="settings-description">Select whether your current plan is free or paid.</span>
                <select
                  value={startupForm.paidPlan ? 'paid' : 'free'}
                  onChange={(event) => setStartupForm((current) => ({ ...current, paidPlan: event.target.value === 'paid' }))}
                  disabled={isSavingStartup}
                >
                  <option value="free">Free</option>
                  <option value="paid">Paid</option>
                </select>
              </label>

              <label className="settings-field">
                <span className="settings-label">Company email domains</span>
                <span className="settings-description">Comma-separated domains like pontifex.co, denteel.com.</span>
                <input
                  type="text"
                  value={startupForm.companyDomains}
                  onChange={(event) => setStartupForm((current) => ({ ...current, companyDomains: event.target.value }))}
                  disabled={isSavingStartup}
                  required
                />
              </label>

              <label className="settings-field">
                <span className="settings-label">Meetings email</span>
                <span className="settings-description">Your main meeting email identity.</span>
                <input
                  type="email"
                  value={startupForm.myEmail}
                  onChange={(event) => setStartupForm((current) => ({ ...current, myEmail: event.target.value }))}
                  disabled={isSavingStartup}
                  required
                />
              </label>

              {settingsMessage ? <p className="settings-message">{settingsMessage}</p> : null}

              <button type="submit" className="settings-save" disabled={isSavingStartup}>
                {isSavingStartup ? 'Saving startup config...' : 'Save and continue'}
              </button>
            </form>
          </section>
        </div>
      ) : null}

      {activeExpandedChart ? (
        <div className="chart-modal-overlay" role="presentation" onClick={() => setExpandedChart(null)}>
          <section
            className="chart-modal"
            role="dialog"
            aria-modal="true"
            aria-label={activeExpandedChart.title}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="chart-modal-header">
              <div>
                <p className="chart-eyebrow">{activeExpandedChart.eyebrow}</p>
                <h3>{activeExpandedChart.title}</h3>
                <p className="chart-value">{activeExpandedChart.value}</p>
              </div>
              <button
                type="button"
                className="chart-modal-close"
                aria-label="Close expanded chart"
                onClick={() => setExpandedChart(null)}
              >
                <CloseIcon />
              </button>
            </div>
            <ReactEChartsCore
              echarts={echarts}
              option={activeExpandedChart.option}
              style={{ height: 'min(72vh, 760px)', width: '100%' }}
            />
          </section>
        </div>
      ) : null}
    </div>
  );
}

export default App;
