'use client';

import type { FC } from "react";

interface SparklineProps {
  values: number[];
  className?: string;
}

function buildPath(values: number[], width: number, height: number) {
  if (values.length === 0) {
    return "";
  }

  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const range = Math.max(max - min, 1);
  const step = width / Math.max(values.length - 1, 1);

  return values
    .map((value, index) => {
      const x = index * step;
      const y = height - ((value - min) / range) * height;
      return `${index === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");
}

export const Sparkline: FC<SparklineProps> = ({ values, className }) => {
  const width = 120;
  const height = 32;
  const path = buildPath(values, width, height);

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      className={className}
      aria-hidden
    >
      <polyline
        points={`0,${height} ${width},${height}`}
        fill="none"
        stroke="rgba(148,163,184,0.2)"
        strokeWidth={1}
      />
      <path
        d={path}
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
};
