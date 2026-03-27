import { useEffect, useState } from 'react';
import * as echarts from 'echarts/core';
import { BarChart, HeatmapChart, LineChart, PieChart, TreemapChart } from 'echarts/charts';
import { GridComponent, LegendComponent, TooltipComponent, VisualMapComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import ReactEChartsCore from 'echarts-for-react/lib/core';
import {
  formatValue,
  getCampaignBreakdown,
  getDepartmentBreakdown,
  getGranularityLabel,
  getHeatmapSeries,
  getLineSeries,
  getSummaryMetrics,
  getVarianceSeries,
} from './dashboardData';

echarts.use([
  BarChart,
  CanvasRenderer,
  GridComponent,
  HeatmapChart,
  LegendComponent,
  LineChart,
  PieChart,
  TooltipComponent,
  TreemapChart,
  VisualMapComponent,
]);

const GRANULARITIES = ['months', 'weeks', 'days', 'hours'];
const VARIANCE_FILTERS = ['all', 'overtime', 'undertime'];

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
    <div className="segmented-control" role="tablist" aria-label="Time granularity selector">
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
          <SegmentedControl value={granularity} options={GRANULARITIES} onChange={onGranularityChange} />
          {extraAction}
        </div>
      </div>
      {children}
    </section>
  );
}

function App() {
  const [meetingData, setMeetingData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [expandedChart, setExpandedChart] = useState(null);
  const [lineGranularity, setLineGranularity] = useState('weeks');
  const [departmentGranularity, setDepartmentGranularity] = useState('hours');
  const [campaignGranularity, setCampaignGranularity] = useState('hours');
  const [heatmapGranularity, setHeatmapGranularity] = useState('days');
  const [varianceGranularity, setVarianceGranularity] = useState('weeks');
  const [varianceFilter, setVarianceFilter] = useState('all');

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
  const varianceSeries = getVarianceSeries(meetingData, varianceGranularity, varianceFilter);

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
        emphasis: {
          itemStyle: {
            shadowBlur: 10,
            shadowColor: 'rgba(22, 50, 79, 0.35)',
          },
        },
      },
    ],
  };

  const varianceOption = {
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
    },
    legend: {
      top: 0,
      textStyle: { color: '#40506b' },
    },
    grid: { top: 40, right: 20, bottom: 34, left: 44 },
    xAxis: {
      type: 'category',
      data: varianceSeries.map((item) => item.label),
      axisLine: { lineStyle: { color: '#93a1b7' } },
      axisLabel: { color: '#5a6880', hideOverlap: true },
    },
    yAxis: {
      type: 'value',
      axisLabel: { color: '#5a6880' },
      splitLine: { lineStyle: { color: 'rgba(63, 81, 112, 0.08)' } },
    },
    series: [
      {
        name: 'Overtime',
        type: 'bar',
        stack: 'variance',
        data: varianceSeries.map((item) => formatValue(item.overtime, varianceGranularity)),
        itemStyle: { color: '#c97342', borderRadius: [8, 8, 0, 0] },
      },
      {
        name: 'Undertime',
        type: 'bar',
        stack: 'variance',
        data: varianceSeries.map((item) => formatValue(item.undertime, varianceGranularity)),
        itemStyle: { color: '#4c8c77', borderRadius: [8, 8, 0, 0] },
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
    variance: {
      eyebrow: 'Variance',
      title: 'Meetings that ran under or over time',
      value: `Stacked bars in ${getGranularityLabel(varianceGranularity).toLowerCase()}`,
      option: varianceOption,
    },
  };

  const activeExpandedChart = expandedChart ? expandedChartConfig[expandedChart] : null;

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
          <button type="button" className="nav-item active" onClick={() => setIsSidebarOpen(false)}>Page 1 · Meetings</button>
          <button type="button" className="nav-item" disabled>Page 2 · Teams</button>
          <button type="button" className="nav-item" disabled>Page 3 · Campaigns</button>
        </nav>
        <p className="sidebar-note">
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
        <header className="hero-card">
          <div>
            <p className="hero-kicker">Page 1</p>
            <h2>How much time do I spend on meetings?</h2>
            <p className="hero-copy">
            </p>
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
            eyebrow="Variance"
            title="Meetings that ran under or over time"
            value={`Stacked bars in ${getGranularityLabel(varianceGranularity).toLowerCase()}`}
            granularity={varianceGranularity}
            onGranularityChange={setVarianceGranularity}
            onExpand={() => setExpandedChart('variance')}
            extraAction={
              <SegmentedControl
                value={varianceFilter}
                options={VARIANCE_FILTERS}
                onChange={setVarianceFilter}
              />
            }
          >
            <ReactEChartsCore echarts={echarts} option={varianceOption} style={{ height: 340 }} />
          </ChartCard>
        </section>
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