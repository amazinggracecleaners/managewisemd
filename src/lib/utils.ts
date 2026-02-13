import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Recursively removes properties with `undefined` values from an object.
 * Firestore does not allow `undefined` values in documents.
 */
export function cleanForFirestore<T>(value: T): T {
  if (Array.isArray(value)) {
    return value
      .map((v) => cleanForFirestore(v))
      .filter((v) => v !== undefined) as unknown as T;
  }

  if (
    value !== null &&
    typeof value === "object" &&
    !(value instanceof Date) &&
    typeof (value as any).toDate !== "function"
  ) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      const cleaned = cleanForFirestore(v as any);
      if (cleaned !== undefined) out[k] = cleaned;
    }
    return out as T;
  }

  return value;
}
