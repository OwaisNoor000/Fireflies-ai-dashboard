import { useEffect, useMemo, useState } from 'react';
import * as echarts from 'echarts/core';
import { BarChart, HeatmapChart, LineChart, PieChart, ScatterChart, TreemapChart } from 'echarts/charts';
import {
  DataZoomComponent,
  GridComponent,
  LegendComponent,
  TooltipComponent,
  VisualMapComponent,
} from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import ReactEChartsCore from 'echarts-for-react/lib/core';
import {
  filterPersonStatsByCompany,
  formatValue,
  getCampaignBreakdown,
  getCompanyOptions,
  getDepartmentBreakdown,
  getDotPlotData,
  getDurationHistogram,
  getExternalVsStaffTrend,
  getGranularityLabel,
  getHeatmapSeries,
  getLineSeries,
  getMeetingMixData,
  getPage2PersonStats,
  getSummaryMetrics,
  getTopPeopleByScore,
} from './dashboardData';

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
  TooltipComponent,
  TreemapChart,
  VisualMapComponent,
]);

const GRANULARITIES = ['months', 'weeks', 'days', 'hours'];
const OWNER_FILTERS = ['by you', 'by other staff'];

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

function ChartCard({ eyebrow, title, value, children, granularity, onGranularityChange, extraAction, onExpand }) {
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
  const [departmentGranularity, setDepartmentGranularity] = useState('hours');
  const [campaignGranularity, setCampaignGranularity] = useState('hours');
  const [heatmapGranularity, setHeatmapGranularity] = useState('days');
  const [durationOwnerFilter, setDurationOwnerFilter] = useState('by you');

  const [page2CompanyFilter, setPage2CompanyFilter] = useState('All companies');
  const [page2PeopleGranularity, setPage2PeopleGranularity] = useState('hours');
  const [page2RoleGranularity, setPage2RoleGranularity] = useState('hours');
  const [page2TrendGranularity, setPage2TrendGranularity] = useState('weeks');

  useEffect(() => {
    let active = true;

    async function loadMeetingData() {
      const response = await fetch(`${import.meta.env.BASE_URL}data/meetingData.json`);
      const payload = await response.json();

      if (active) {
        setMeetingData(payload);
        setLoading(false);
      }
    }

    loadMeetingData().catch(() => {
      if (active) {
        setMeetingData([]);
        setLoading(false);
      }
    });

    return () => {
      active = false;
    };
  }, []);

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

  const summary = getSummaryMetrics(meetingData);

  const lineSeries = getLineSeries(meetingData, lineGranularity);
  const departmentSeries = getDepartmentBreakdown(meetingData, departmentGranularity);
  const campaignSeries = getCampaignBreakdown(meetingData, campaignGranularity);
  const heatmapSeries = getHeatmapSeries(meetingData, heatmapGranularity);
  const durationHistogram = getDurationHistogram(meetingData);

  const personStats = useMemo(() => getPage2PersonStats(meetingData), [meetingData]);
  const companyOptions = useMemo(() => getCompanyOptions(personStats), [personStats]);
  const filteredPersonStats = useMemo(
    () => filterPersonStatsByCompany(personStats, page2CompanyFilter),
    [page2CompanyFilter, personStats],
  );
  const bestFriend = filteredPersonStats[0];
  const dotPlotData = useMemo(() => getDotPlotData(meetingData, page2CompanyFilter), [meetingData, page2CompanyFilter]);
  const externalVsStaffTrend = useMemo(
    () => getExternalVsStaffTrend(meetingData, page2TrendGranularity),
    [meetingData, page2TrendGranularity],
  );
  const talkativeTop = useMemo(
    () => getTopPeopleByScore(filteredPersonStats, 'talkativeScore', summary.averageDuration),
    [filteredPersonStats, summary.averageDuration],
  );
  const inquisitiveTop = useMemo(
    () => getTopPeopleByScore(filteredPersonStats, 'inquisitiveScore', summary.averageDuration),
    [filteredPersonStats, summary.averageDuration],
  );
  const meetingMixData = useMemo(() => getMeetingMixData(meetingData), [meetingData]);

  const lineOption = {
    tooltip: {
      trigger: 'axis',
      formatter: (params) => {
        const point = params[0];
        return `${point.axisValue}<br/>${formatValue(point.value, lineGranularity)} ${getGranularityLabel(lineGranularity).toLowerCase()}`;
      },
    },
    grid: { top: 20, right: 20, bottom: 34, left: 44 },
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
        data: lineSeries.map((item) => formatValue(item.value, lineGranularity)),
      },
    ],
  };

  const departmentOption = {
    tooltip: {
      formatter: ({ name, value }) => `${name}<br/>${value} ${getGranularityLabel(departmentGranularity).toLowerCase()}`,
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
          formatter: '{b}\n{c}',
        },
        data: departmentSeries,
      },
    ],
  };

  const campaignOption = {
    tooltip: {
      trigger: 'item',
      formatter: ({ name, value, percent }) => `${name}<br/>${value} ${getGranularityLabel(campaignGranularity).toLowerCase()} (${percent}%)`,
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
        data: campaignSeries,
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
      axisLabel: { color: '#5a6880', rotate: heatmapGranularity === 'hours' ? 0 : 35, hideOverlap: true },
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
        const lines = params.map((item) => `${item.marker} ${item.seriesName}: ${item.value} meetings`);
        return `${params[0].axisValue}<br/>${lines.join('<br/>')}`;
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
      name: 'Meetings',
      axisLabel: { color: '#5a6880' },
      splitLine: { lineStyle: { color: 'rgba(63, 81, 112, 0.08)' } },
    },
    series: [
      {
        name: 'By you',
        type: 'bar',
        data: durationHistogram.map((item) => item.byYou),
        itemStyle: {
          color: '#16324f',
          borderRadius: [8, 8, 0, 0],
          opacity: durationOwnerFilter === 'by you' ? 1 : 0.34,
        },
      },
      {
        name: 'By other staff',
        type: 'bar',
        data: durationHistogram.map((item) => item.byOtherStaff),
        itemStyle: {
          color: '#c97342',
          borderRadius: [8, 8, 0, 0],
          opacity: durationOwnerFilter === 'by other staff' ? 1 : 0.34,
        },
      },
    ],
  };

  const personTimeOption = {
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    grid: { top: 20, right: 20, bottom: 28, left: 140 },
    dataZoom: [
      { type: 'inside', yAxisIndex: 0 },
      { type: 'slider', yAxisIndex: 0, width: 12, right: 4, top: 24, bottom: 30 },
    ],
    xAxis: {
      type: 'value',
      name: getGranularityLabel(page2PeopleGranularity),
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
        type: 'bar',
        data: filteredPersonStats.map((entry) => formatValue(entry.totalMinutes, page2PeopleGranularity)),
        itemStyle: { color: '#16324f', borderRadius: [0, 8, 8, 0] },
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
      value: `Treemap sized in ${getGranularityLabel(departmentGranularity).toLowerCase()}`,
      option: departmentOption,
    },
    campaign: {
      eyebrow: 'Campaigns',
      title: 'Time spent per campaign',
      value: `Donut values shown in ${getGranularityLabel(campaignGranularity).toLowerCase()}`,
      option: campaignOption,
    },
    heatmap: {
      eyebrow: 'Density',
      title: 'Days with the most meetings',
      value: `Heat map pivoted by ${getGranularityLabel(heatmapGranularity).toLowerCase()}`,
      option: heatmapOption,
    },
    duration: {
      eyebrow: 'Distribution',
      title: 'Meetings by duration range',
      value: `Focused on ${durationOwnerFilter}`,
      option: durationOption,
    },
    p2PeopleTime: {
      eyebrow: 'People',
      title: 'Total time spent per person',
      value: `Filter: ${page2CompanyFilter} · Unit: ${getGranularityLabel(page2PeopleGranularity).toLowerCase()}`,
      option: personTimeOption,
    },
    p2Dot: {
      eyebrow: 'Cadence',
      title: 'Best overall meeting rhythm',
      value: 'Each dot is a meeting with one person',
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
          <button type="button" className={`nav-item${activePage === 'page1' ? ' active' : ''}`} onClick={() => navigateTo('page1')}>Page 1 · Meetings</button>
          <button type="button" className={`nav-item${activePage === 'page2' ? ' active' : ''}`} onClick={() => navigateTo('page2')}>Page 2 · People</button>
          <button type="button" className="nav-item" disabled>Page 3 · Campaigns</button>
        </nav>
        <p className="sidebar-note">
          Use the page switcher to move between time-based and relationship-based meeting analysis.
        </p>
      </aside>

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
              <div className="hero-tag">Coverage: 180 days · {loading ? 'Loading data...' : `${summary.meetingsCount.toLocaleString()} meetings`}</div>
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
              >
                <ReactEChartsCore echarts={echarts} option={lineOption} style={{ height: 320 }} />
              </ChartCard>

              <ChartCard
                eyebrow="Load"
                title="Time spent by department"
                value={`Treemap sized in ${getGranularityLabel(departmentGranularity).toLowerCase()}`}
                granularity={departmentGranularity}
                onGranularityChange={setDepartmentGranularity}
                onExpand={() => setExpandedChart('department')}
              >
                <ReactEChartsCore echarts={echarts} option={departmentOption} style={{ height: 320 }} />
              </ChartCard>
            </section>

            <section className="charts-grid charts-grid-secondary">
              <ChartCard
                eyebrow="Campaigns"
                title="Time spent per campaign"
                value={`Donut values shown in ${getGranularityLabel(campaignGranularity).toLowerCase()}`}
                granularity={campaignGranularity}
                onGranularityChange={setCampaignGranularity}
                onExpand={() => setExpandedChart('campaign')}
              >
                <ReactEChartsCore echarts={echarts} option={campaignOption} style={{ height: 340 }} />
              </ChartCard>

              <ChartCard
                eyebrow="Density"
                title="Days with the most meetings"
                value={`Heat map pivoted by ${getGranularityLabel(heatmapGranularity).toLowerCase()}`}
                granularity={heatmapGranularity}
                onGranularityChange={setHeatmapGranularity}
                onExpand={() => setExpandedChart('heatmap')}
              >
                <ReactEChartsCore echarts={echarts} option={heatmapOption} style={{ height: 340 }} />
              </ChartCard>
            </section>

            <section className="charts-grid charts-grid-tertiary">
              <ChartCard
                eyebrow="Distribution"
                title="Meetings by duration range"
                value={`Focused on ${durationOwnerFilter}`}
                onExpand={() => setExpandedChart('duration')}
                extraAction={
                  <SegmentedControl
                    value={durationOwnerFilter}
                    options={OWNER_FILTERS}
                    onChange={setDurationOwnerFilter}
                  />
                }
              >
                <ReactEChartsCore echarts={echarts} option={durationOption} style={{ height: 340 }} />
              </ChartCard>
            </section>
          </>
        ) : (
          <>
            <header className="hero-card">
              <div>
                <p className="hero-kicker">Page 2</p>
                <h2>Who do I give my time to?</h2>
                <p className="hero-copy">Relationship analysis by person, role, cadence, audience mix, and speaking behavior.</p>
              </div>
              <div className="hero-tag">{loading ? 'Loading data...' : `${filteredPersonStats.length} people in view`}</div>
            </header>

            <section className="metrics-grid metrics-grid-single">
              <MetricCard
                label="Best friend"
                value={bestFriend ? bestFriend.person : 'No data'}
                detail={bestFriend ? `${formatValue(bestFriend.totalMinutes, 'hours')} hours · ${bestFriend.meetings} meetings` : 'No matching person for current filter'}
                accent="linear-gradient(135deg, #16324f, #c97342)"
              />
            </section>

            <section className="charts-grid charts-grid-secondary">
              <ChartCard
                eyebrow="People"
                title="Total time spent per person"
                value={`Filter: ${page2CompanyFilter} · Unit: ${getGranularityLabel(page2PeopleGranularity).toLowerCase()}`}
                granularity={page2PeopleGranularity}
                onGranularityChange={setPage2PeopleGranularity}
                onExpand={() => setExpandedChart('p2PeopleTime')}
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
        )}
      </main>

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
