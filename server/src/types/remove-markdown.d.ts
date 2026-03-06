declare module "remove-markdown" {
  interface RemoveMarkdownOptions {
    /** Remove list leaders (default: true) */
    stripListLeaders?: boolean;
    /** Character to use for list items (default: '') */
    listUnicodeChar?: string;
    /** Enable GitHub Flavored Markdown (default: true) */
    gfm?: boolean;
    /** Use image alt text (default: true) */
    useImgAltText?: boolean;
  }

  function removeMarkdown(
    markdown: string,
    options?: RemoveMarkdownOptions
  ): string;

  export = removeMarkdown;
}
