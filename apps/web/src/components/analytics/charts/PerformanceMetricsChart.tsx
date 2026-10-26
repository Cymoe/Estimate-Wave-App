import React from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
  ChartOptions
} from 'chart.js';
import { Bar } from 'react-chartjs-2';

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend
);

interface MetricData {
  category: string;
  profitMargin: number;
  taskCompletion: number;
  avgDuration: number;
}

interface PerformanceMetricsChartProps {
  data: MetricData[];
}

export const PerformanceMetricsChart: React.FC<PerformanceMetricsChartProps> = ({ data }) => {
  const options: ChartOptions<'bar'> = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'bottom' as const,
        labels: {
          color: '#ffffff',
          font: {
            family: 'Roboto',
            size: 12
          },
          padding: 20,
          usePointStyle: true
        }
      },
      tooltip: {
        backgroundColor: '#1E1E1E',
        titleColor: '#ffffff',
        bodyColor: '#ffffff',
        borderColor: '#336699',
        borderWidth: 1,
        padding: 12,
        displayColors: true,
        callbacks: {
          label: function(context) {
            let label = context.dataset.label || '';
            if (label) {
              label += ': ';
            }
            if (context.parsed.y !== null) {
              if (context.dataset.label === 'Profit Margin' || context.dataset.label === 'Task Completion') {
                label += context.parsed.y.toFixed(1) + '%';
              } else {
                label += context.parsed.y.toFixed(0) + ' days';
              }
            }
            return label;
          }
        }
      }
    },
    scales: {
      x: {
        grid: {
          color: 'rgba(255, 255, 255, 0.1)',
          display: false
        },
        ticks: {
          color: '#9E9E9E',
          font: {
            family: 'Roboto',
            size: 11
          }
        }
      },
      'y-percentage': {
        type: 'linear' as const,
        display: true,
        position: 'left' as const,
        grid: {
          color: 'rgba(255, 255, 255, 0.1)'
        },
        ticks: {
          color: '#9E9E9E',
          font: {
            family: 'Roboto Mono',
            size: 11
          },
          callback: function(value) {
            return value + '%';
          }
        },
        max: 100
      },
      'y-days': {
        type: 'linear' as const,
        display: true,
        position: 'right' as const,
        grid: {
          display: false
        },
        ticks: {
          color: '#9E9E9E',
          font: {
            family: 'Roboto Mono',
            size: 11
          },
          callback: function(value) {
            return value + ' days';
          }
        }
      }
    },
    interaction: {
      mode: 'index' as const,
      intersect: false
    }
  };

  const chartData = {
    labels: data.map(d => d.category),
    datasets: [
      {
        label: 'Profit Margin',
        data: data.map(d => d.profitMargin),
        backgroundColor: '#336699',
        borderColor: '#336699',
        borderWidth: 1,
        yAxisID: 'y-percentage',
        borderRadius: 4
      },
      {
        label: 'Task Completion',
        data: data.map(d => d.taskCompletion),
        backgroundColor: '#388E3C',
        borderColor: '#388E3C',
        borderWidth: 1,
        yAxisID: 'y-percentage',
        borderRadius: 4
      },
      {
        label: 'Avg Duration',
        data: data.map(d => d.avgDuration),
        backgroundColor: '#336699',
        borderColor: '#336699',
        borderWidth: 1,
        yAxisID: 'y-days',
        borderRadius: 4
      }
    ]
  };

  return (
    <div className="bg-[#333333] rounded-[4px] p-6">
      <h3 className="text-lg font-medium mb-4">PERFORMANCE METRICS BY CATEGORY</h3>
      <div style={{ height: '300px' }}>
        <Bar options={options} data={chartData} />
      </div>
    </div>
  );
}; 