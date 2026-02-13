"use server";

import { generateEmployeeTimesheetSummary, type GenerateEmployeeTimesheetSummaryInput } from "@/ai/flows/generate-employee-timesheet-summary";
import type { AiEntry } from "@/shared/types/domain";

export async function getAiSummary(
  entries: AiEntry[],
  fromDate: string,
  toDate: string
): Promise<{ success: boolean; summary?: string; error?: string }> {
  // Simple validation
  if (!entries || entries.length === 0) {
    return { success: false, error: "No entries to summarize." };
  }

  try {
    const result = await generateEmployeeTimesheetSummary({
      entries,
      fromDate,
      toDate,
    });
    return { success: true, summary: result.summary };
  } catch (error) {
    console.error("AI summary generation failed:", error);
    return {
      success: false,
      error:
        "An error occurred while generating the summary. Please try again later.",
    };
  }
}
