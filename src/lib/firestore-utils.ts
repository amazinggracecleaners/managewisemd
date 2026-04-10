export function cleanForFirestore<T>(input: T): T {
  const cleanValue = (value: unknown): unknown => {
    if (value === undefined) return undefined;

    if (value instanceof Date) {
      return value;
    }

    if (Array.isArray(value)) {
      return value
        .map((item) => cleanValue(item))
        .filter((item) => item !== undefined);
    }

    if (value !== null && typeof value === "object") {
      const cleanedObj: Record<string, unknown> = {};

      for (const [key, nestedValue] of Object.entries(
        value as Record<string, unknown>
      )) {
        const cleanedNestedValue = cleanValue(nestedValue);
        if (cleanedNestedValue !== undefined) {
          cleanedObj[key] = cleanedNestedValue;
        }
      }

      return cleanedObj;
    }

    return value;
  };

  return cleanValue(input) as T;
}