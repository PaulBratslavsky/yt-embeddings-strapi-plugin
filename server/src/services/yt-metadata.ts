import { generateObject } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { z } from 'zod';

export interface KeyMoment {
  label: string;
  startSeconds: number;
  summary: string;
}

export interface VideoMetadata {
  topics: string[];
  summary: string;
  keyMoments: KeyMoment[];
  language: string;
}

const metadataSchema = z.object({
  topics: z.array(z.string()).max(8),
  summary: z.string().max(400),
  keyMoments: z.array(z.object({
    label: z.string(),
    startSeconds: z.number(),
    summary: z.string().max(150),
  })).max(10),
  language: z.string().default('en'),
});

export async function extractVideoMetadata(
  title: string,
  fullTranscript: string,
  durationSeconds: number,
  openAIApiKey: string,
): Promise<VideoMetadata> {
  const openai = createOpenAI({ apiKey: openAIApiKey });

  // For long transcripts, sample first + last 2000 words
  const words = fullTranscript.split(/\s+/);
  const sample = words.length > 4000
    ? [...words.slice(0, 2000), '...', ...words.slice(-2000)].join(' ')
    : fullTranscript;

  const { object } = await generateObject({
    model: openai('gpt-4o-mini'),
    schema: metadataSchema,
    temperature: 0,
    prompt: `
Video title: "${title}"
Duration: ${Math.floor(durationSeconds / 60)} minutes

Transcript (may be truncated for long videos):
"""
${sample}
"""

Extract:
- topics: key subjects covered (use specific terms, not generic like "technology")
- summary: 2-3 sentences describing what the video teaches or argues
- keyMoments: the 5-8 most important moments, with approximate start time in seconds
- language: ISO 639-1 language code of the transcript
    `.trim(),
  });

  return {
    topics: object.topics ?? [],
    summary: object.summary ?? '',
    keyMoments: (object.keyMoments ?? []) as KeyMoment[],
    language: object.language ?? 'en',
  };
}
