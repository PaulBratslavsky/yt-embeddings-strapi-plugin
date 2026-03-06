/**
 * Text chunking utilities for splitting large content into embeddable chunks
 */

export interface ChunkOptions {
  /** Maximum characters per chunk (default: 4000, roughly ~1000 tokens) */
  chunkSize?: number;
  /** Number of characters to overlap between chunks (default: 200) */
  chunkOverlap?: number;
  /** Separator to use when splitting (default: splits on paragraphs, sentences, then words) */
  separators?: string[];
}

export interface TextChunk {
  /** The chunk text content */
  text: string;
  /** Zero-based chunk index */
  chunkIndex: number;
  /** Total number of chunks */
  totalChunks: number;
  /** Character offset in original text */
  startOffset: number;
  /** Character end offset in original text */
  endOffset: number;
}

const DEFAULT_SEPARATORS = [
  "\n\n", // Paragraphs
  "\n",   // Lines
  ". ",   // Sentences
  "! ",   // Exclamations
  "? ",   // Questions
  "; ",   // Semicolons
  ", ",   // Commas
  " ",    // Words
  "",     // Characters (last resort)
];

/**
 * Estimate token count from character count
 * OpenAI models average ~4 characters per token for English text
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Check if content exceeds the recommended chunk size
 */
export function needsChunking(content: string, maxChars: number = 4000): boolean {
  return content.length > maxChars;
}

/**
 * Split text by a separator, keeping the separator at the end of each piece
 */
function splitWithSeparator(text: string, separator: string): string[] {
  if (separator === "") {
    return text.split("");
  }

  const parts = text.split(separator);
  const result: string[] = [];

  for (let i = 0; i < parts.length; i++) {
    if (i < parts.length - 1) {
      result.push(parts[i] + separator);
    } else if (parts[i]) {
      result.push(parts[i]);
    }
  }

  return result;
}

/**
 * Recursively split text into chunks that fit within the size limit
 */
function splitText(
  text: string,
  chunkSize: number,
  separators: string[]
): string[] {
  if (text.length <= chunkSize) {
    return [text];
  }

  // Find the best separator to use
  let bestSeparator = separators[separators.length - 1]; // Default to last (smallest)

  for (const sep of separators) {
    if (text.includes(sep)) {
      bestSeparator = sep;
      break;
    }
  }

  const splits = splitWithSeparator(text, bestSeparator);
  const chunks: string[] = [];
  let currentChunk = "";

  for (const split of splits) {
    if ((currentChunk + split).length <= chunkSize) {
      currentChunk += split;
    } else {
      if (currentChunk) {
        chunks.push(currentChunk);
      }

      // If single split is too large, recursively split it
      if (split.length > chunkSize) {
        const remainingSeparators = separators.slice(separators.indexOf(bestSeparator) + 1);
        if (remainingSeparators.length > 0) {
          chunks.push(...splitText(split, chunkSize, remainingSeparators));
        } else {
          // Force split at chunkSize if no separators left
          for (let i = 0; i < split.length; i += chunkSize) {
            chunks.push(split.slice(i, i + chunkSize));
          }
        }
        currentChunk = "";
      } else {
        currentChunk = split;
      }
    }
  }

  if (currentChunk) {
    chunks.push(currentChunk);
  }

  return chunks;
}

/**
 * Add overlap between chunks for better context preservation
 */
function addOverlap(chunks: string[], overlap: number): string[] {
  if (overlap <= 0 || chunks.length <= 1) {
    return chunks;
  }

  const result: string[] = [];

  for (let i = 0; i < chunks.length; i++) {
    let chunk = chunks[i];

    // Add overlap from previous chunk
    if (i > 0) {
      const prevChunk = chunks[i - 1];
      const overlapText = prevChunk.slice(-overlap);
      chunk = overlapText + chunk;
    }

    result.push(chunk);
  }

  return result;
}

/**
 * Split content into chunks suitable for embedding
 *
 * @param content - The text content to split
 * @param options - Chunking options
 * @returns Array of TextChunk objects
 */
export function chunkContent(
  content: string,
  options: ChunkOptions = {}
): TextChunk[] {
  const {
    chunkSize = 4000,
    chunkOverlap = 200,
    separators = DEFAULT_SEPARATORS,
  } = options;

  // Clean the content
  const cleanContent = content.trim();

  if (!cleanContent) {
    return [];
  }

  // If content fits in one chunk, return as single chunk
  if (cleanContent.length <= chunkSize) {
    return [{
      text: cleanContent,
      chunkIndex: 0,
      totalChunks: 1,
      startOffset: 0,
      endOffset: cleanContent.length,
    }];
  }

  // Split into initial chunks
  const rawChunks = splitText(cleanContent, chunkSize - chunkOverlap, separators);

  // Add overlap
  const chunksWithOverlap = addOverlap(rawChunks, chunkOverlap);

  // Calculate offsets and build result
  const result: TextChunk[] = [];
  let currentOffset = 0;

  for (let i = 0; i < chunksWithOverlap.length; i++) {
    const text = chunksWithOverlap[i].trim();

    if (text) {
      result.push({
        text,
        chunkIndex: i,
        totalChunks: chunksWithOverlap.length,
        startOffset: currentOffset,
        endOffset: currentOffset + rawChunks[i].length,
      });
    }

    currentOffset += rawChunks[i].length;
  }

  // Update totalChunks after filtering empty chunks
  const totalChunks = result.length;
  result.forEach((chunk, idx) => {
    chunk.chunkIndex = idx;
    chunk.totalChunks = totalChunks;
  });

  return result;
}

/**
 * Format chunk title with index information
 */
export function formatChunkTitle(
  baseTitle: string,
  chunkIndex: number,
  totalChunks: number
): string {
  if (totalChunks === 1) {
    return baseTitle;
  }
  return `${baseTitle} [Part ${chunkIndex + 1}/${totalChunks}]`;
}
