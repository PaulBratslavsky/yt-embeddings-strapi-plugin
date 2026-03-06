/**
 * Content preprocessing utilities for cleaning text before embedding
 * Handles HTML stripping, markdown conversion, and text normalization
 */

import { convert } from "html-to-text";
import removeMarkdown from "remove-markdown";

export interface PreprocessOptions {
  /** Strip HTML tags from content (default: true) */
  stripHtml?: boolean;
  /** Strip markdown syntax from content (default: true) */
  stripMarkdown?: boolean;
  /** Normalize whitespace (collapse multiple spaces/newlines) (default: true) */
  normalizeWhitespace?: boolean;
}

const DEFAULT_OPTIONS: PreprocessOptions = {
  stripHtml: true,
  stripMarkdown: true,
  normalizeWhitespace: true,
};

/**
 * Detect if content likely contains HTML
 */
function containsHtml(content: string): boolean {
  // Look for common HTML patterns
  return /<[a-z][\s\S]*>/i.test(content);
}

/**
 * Detect if content likely contains Markdown
 */
function containsMarkdown(content: string): boolean {
  // Look for common markdown patterns
  const markdownPatterns = [
    /^#{1,6}\s/m,           // Headers: # ## ### etc
    /\*\*[^*]+\*\*/,        // Bold: **text**
    /\*[^*]+\*/,            // Italic: *text*
    /__[^_]+__/,            // Bold: __text__
    /_[^_]+_/,              // Italic: _text_
    /\[.+\]\(.+\)/,         // Links: [text](url)
    /^[-*+]\s/m,            // Unordered lists: - * +
    /^\d+\.\s/m,            // Ordered lists: 1. 2. etc
    /^>\s/m,                // Blockquotes: >
    /`[^`]+`/,              // Inline code: `code`
    /```[\s\S]*?```/,       // Code blocks: ```code```
    /^\|.+\|$/m,            // Tables: |col|col|
  ];

  return markdownPatterns.some(pattern => pattern.test(content));
}

/**
 * Strip HTML tags and convert to plain text
 */
function stripHtml(content: string): string {
  if (!containsHtml(content)) {
    return content;
  }

  return convert(content, {
    wordwrap: false,
    preserveNewlines: true,
    selectors: [
      // Convert headings to plain text with colon
      { selector: "h1", options: { uppercase: false, trailingLineBreaks: 1 } },
      { selector: "h2", options: { uppercase: false, trailingLineBreaks: 1 } },
      { selector: "h3", options: { uppercase: false, trailingLineBreaks: 1 } },
      { selector: "h4", options: { uppercase: false, trailingLineBreaks: 1 } },
      { selector: "h5", options: { uppercase: false, trailingLineBreaks: 1 } },
      { selector: "h6", options: { uppercase: false, trailingLineBreaks: 1 } },
      // Remove images but keep alt text
      { selector: "img", format: "skip" },
      // Remove scripts and styles completely
      { selector: "script", format: "skip" },
      { selector: "style", format: "skip" },
      // Keep link text, remove URLs
      { selector: "a", options: { ignoreHref: true } },
    ],
  });
}

/**
 * Strip markdown syntax and convert to plain text
 */
function stripMarkdownSyntax(content: string): string {
  if (!containsMarkdown(content)) {
    return content;
  }

  // Use remove-markdown library
  let result = removeMarkdown(content, {
    stripListLeaders: true,
    listUnicodeChar: "",
    gfm: true,
    useImgAltText: true,
  });

  // Additional cleanup for edge cases the library might miss
  result = result
    // Remove any remaining code block markers
    .replace(/```[\s\S]*?```/g, (match) => {
      // Extract code content without markers
      return match.replace(/```\w*\n?/g, "").replace(/```/g, "");
    })
    // Remove inline code backticks
    .replace(/`([^`]+)`/g, "$1")
    // Clean up horizontal rules
    .replace(/^[-*_]{3,}$/gm, "");

  return result;
}

/**
 * Normalize whitespace in content
 */
function normalizeWhitespace(content: string): string {
  return content
    // Replace multiple newlines with double newline (preserve paragraphs)
    .replace(/\n{3,}/g, "\n\n")
    // Replace multiple spaces with single space
    .replace(/[ \t]+/g, " ")
    // Trim each line
    .split("\n")
    .map(line => line.trim())
    .join("\n")
    // Final trim
    .trim();
}

/**
 * Preprocess content for embedding
 * Strips HTML, markdown, and normalizes whitespace
 *
 * @param content - The raw content to preprocess
 * @param options - Preprocessing options
 * @returns Cleaned plain text ready for embedding
 */
export function preprocessContent(
  content: string,
  options: PreprocessOptions = {}
): string {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  if (!content || typeof content !== "string") {
    return "";
  }

  let result = content;

  // Step 1: Strip HTML if present
  if (opts.stripHtml) {
    result = stripHtml(result);
  }

  // Step 2: Strip Markdown if present
  if (opts.stripMarkdown) {
    result = stripMarkdownSyntax(result);
  }

  // Step 3: Normalize whitespace
  if (opts.normalizeWhitespace) {
    result = normalizeWhitespace(result);
  }

  return result;
}

/**
 * Check if content needs preprocessing
 * Returns true if content contains HTML or Markdown
 */
export function needsPreprocessing(content: string): boolean {
  return containsHtml(content) || containsMarkdown(content);
}
