export interface Segment {
  text: string;
  start: number;     // ms — from Strapi, never modify
  end: number;       // ms — from Strapi, never modify
  duration: number;  // ms
}

export interface YtChunk {
  text: string;
  startSeconds: number;   // segment[0].start / 1000
  endSeconds: number;     // segment[last].end / 1000
  durationSeconds: number;
  chunkIndex: number;
  segments: Segment[];    // original objects preserved in full
  tokens: number;         // approximate: word count / 0.75
}

const TARGET_MS = 60_000;   // 60 seconds per chunk
const MAX_MS    = 90_000;   // hard cap
const MIN_MS    = 15_000;   // don't create micro-chunks

export function chunkTranscript(segments: Segment[]): YtChunk[] {
  if (!segments.length) return [];

  validateSegments(segments);

  const chunks: YtChunk[] = [];
  let buffer: Segment[] = [];

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    const next = segments[i + 1];
    buffer.push(seg);

    const bufferDurationMs = buffer[buffer.length - 1].end - buffer[0].start;
    const isLast         = !next;
    const atHardCap      = bufferDurationMs >= MAX_MS;
    const atTarget       = bufferDurationMs >= TARGET_MS;
    const pauseAfterMs   = next ? next.start - seg.end : Infinity;
    const isNaturalPause = pauseAfterMs > 1000;
    const endsSentence   = /[.!?]\s*$/.test(seg.text.trim());

    const shouldFlush = isLast || atHardCap || (atTarget && (isNaturalPause || endsSentence));

    if (shouldFlush && (bufferDurationMs >= MIN_MS || isLast)) {
      const text = buffer.map(s => s.text).join(' ').replace(/\s+/g, ' ').trim();
      chunks.push({
        text,
        startSeconds: buffer[0].start / 1000,
        endSeconds:   buffer[buffer.length - 1].end / 1000,
        durationSeconds: bufferDurationMs / 1000,
        chunkIndex: chunks.length,
        segments: buffer.map(s => ({ ...s })),
        tokens: Math.ceil(text.split(/\s+/).length / 0.75),
      });
      buffer = [];
    }
  }

  if (buffer.length > 0) {
    const text = buffer.map(s => s.text).join(' ').replace(/\s+/g, ' ').trim();
    if (text.length > 20) {
      chunks.push({
        text,
        startSeconds: buffer[0].start / 1000,
        endSeconds:   buffer[buffer.length - 1].end / 1000,
        durationSeconds: (buffer[buffer.length - 1].end - buffer[0].start) / 1000,
        chunkIndex: chunks.length,
        segments: buffer.map(s => ({ ...s })),
        tokens: Math.ceil(text.split(/\s+/).length / 0.75),
      });
    }
  }

  validateChunkBoundaries(chunks);
  return chunks;
}

function validateSegments(segments: Segment[]): void {
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];

    if (seg.end <= seg.start) {
      throw new Error(`[yt-chunker] Segment ${i}: end(${seg.end}) <= start(${seg.start})`);
    }
    if (i > 0 && seg.start < segments[i - 1].end) {
      // YouTube captions commonly overlap — clamp start to previous end
      seg.start = segments[i - 1].end;
      seg.duration = seg.end - seg.start;
    }
  }
}

function validateChunkBoundaries(chunks: YtChunk[]): void {
  for (let i = 1; i < chunks.length; i++) {
    const prev = chunks[i - 1];
    const curr = chunks[i];
    if (curr.startSeconds < prev.endSeconds - 0.1) {
      throw new Error(
        `[yt-chunker] Chunk ${i} overlaps chunk ${i - 1}: ` +
        `prev ends ${prev.endSeconds}s, curr starts ${curr.startSeconds}s`
      );
    }
  }
}
