// use server'

/**
 * @fileOverview Generates a summary of worked hours for each employee within a specified period.
 *
 * - generateEmployeeTimesheetSummary - A function that generates the timesheet summary.
 * - GenerateEmployeeTimesheetSummaryInput - The input type for the generateEmployeeTimesheetSummary function.
 * - GenerateEmployeeTimesheetSummaryOutput - The return type for the generateEmployeeTimesheetSummary function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const GenerateEmployeeTimesheetSummaryInputSchema = z.object({
  entries: z.array(
    z.object({
      id: z.string().optional(),
      employee: z.string(),
      action: z.enum(['in', 'out']),
      ts: z.string().describe('The ISO 8601 timestamp for the event.'),
      lat: z.number().optional(),
      lng: z.number().optional(),
      note: z.string().optional(),
      site: z.string().optional(),
    })
  ).describe('An array of timeclock entries.'),
  fromDate: z.string().describe('The start date for the summary period (YYYY-MM-DD).'),
  toDate: z.string().describe('The end date for the summary period (YYYY-MM-DD).'),
});

export type GenerateEmployeeTimesheetSummaryInput = z.infer<typeof GenerateEmployeeTimesheetSummaryInputSchema>;

const GenerateEmployeeTimesheetSummaryOutputSchema = z.object({
  summary: z.string().describe('A summary of worked hours for each employee within the specified period.'),
});

export type GenerateEmployeeTimesheetSummaryOutput = z.infer<typeof GenerateEmployeeTimesheetSummaryOutputSchema>;

export async function generateEmployeeTimesheetSummary(input: GenerateEmployeeTimesheetSummaryInput): Promise<GenerateEmployeeTimesheetSummaryOutput> {
  return generateEmployeeTimesheetSummaryFlow(input);
}

const prompt = ai.definePrompt({
  name: 'generateEmployeeTimesheetSummaryPrompt',
  input: {schema: GenerateEmployeeTimesheetSummaryInputSchema},
  output: {schema: GenerateEmployeeTimesheetSummaryOutputSchema},
  prompt: `You are an AI assistant tasked with generating a summary of worked hours for each employee within a specified period.

  Analyze the provided timeclock entries and produce a concise summary, including:
  - Total worked hours for each employee.
  - Any relevant notes associated with their shifts.
  - The specified date range.

  Date Range: {{fromDate}} - {{toDate}}

  Timeclock Entries:
  {{#each entries}}
  - Employee: {{employee}}, Action: {{action}}, Timestamp: {{ts}}, Note: {{note}}, Site: {{site}}
  {{/each}}

  Summary:`,
});

const generateEmployeeTimesheetSummaryFlow = ai.defineFlow(
  {
    name: 'generateEmployeeTimesheetSummaryFlow',
    inputSchema: GenerateEmployeeTimesheetSummaryInputSchema,
    outputSchema: GenerateEmployeeTimesheetSummaryOutputSchema,
  },
  async input => {
    const {output} = await prompt(input);
    return output!;
  }
);
