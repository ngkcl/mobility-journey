export const normalizeTargetMuscles = (
  input?: string | string[] | null,
): string[] => {
  if (!input) return [];
  const items = Array.isArray(input) ? input : input.split(',');
  const cleaned = items
    .map((value) => value.trim())
    .filter((value) => value.length > 0);

  return Array.from(new Set(cleaned));
};
