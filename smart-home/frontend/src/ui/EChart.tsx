import ReactECharts from 'echarts-for-react';
import type { EChartsOption } from 'echarts';
import type { CSSProperties } from 'react';

type Props = {
  option: EChartsOption;
  style?: CSSProperties;
  className?: string;
};

const DEFAULT_STYLE: CSSProperties = { width: '100%', height: '100%' };

export function EChart({ option, style, className }: Props) {
  return (
    <ReactECharts
      option={option}
      notMerge
      lazyUpdate
      style={style ?? DEFAULT_STYLE}
      className={className}
      opts={{ renderer: 'svg' }}
    />
  );
}
