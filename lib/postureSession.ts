const pad = (value: number) => String(value).padStart(2, '0');

export const formatDuration = (ms: number): string => {
  if (!Number.isFinite(ms) || ms <= 0) {
    return '00:00';
  }

  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
  }

  return `${pad(minutes)}:${pad(seconds)}`;
};

export const computePercentage = (numerator: number, denominator: number): number => {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator <= 0) {
    return 0;
  }

  return Math.round((numerator / denominator) * 100);
};

export const formatAngle = (value: number | null): string => {
  if (value === null || !Number.isFinite(value)) {
    return '-';
  }

  return `${value.toFixed(1)} deg`;
};
