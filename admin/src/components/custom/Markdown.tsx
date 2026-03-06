import React from "react";
import ReactMarkdown from "react-markdown";
import styled from "styled-components";

const MarkdownWrapper = styled.div`
  /* Headers */
  h1 {
    font-size: 2.25rem;
    font-weight: 700;
    margin-bottom: 1rem;
    color: #272728;
  }

  h2 {
    font-size: 1.75rem;
    font-weight: 700;
    margin-bottom: 1rem;
    color: #272728;
  }

  h3 {
    font-size: 1.5rem;
    font-weight: 700;
    margin-bottom: 1rem;
    color: #272728;
  }

  h4 {
    font-size: 1.25rem;
    font-weight: 700;
    margin-bottom: 1rem;
    color: #272728;
  }

  h5 {
    font-size: 1.125rem;
    font-weight: 700;
    margin-bottom: 1rem;
    color: #272728;
  }

  h6 {
    font-size: 1rem;
    font-weight: 700;
    margin-bottom: 1rem;
    color: #9d4edd;
  }

  /* Horizontal rules */
  hr {
    border-color: #d1d5db;
    margin-top: 2rem;
    margin-bottom: 2rem;
  }

  a {
    color: #4945ff;
    text-decoration: underline;
  }

  /* Paragraphs */
  p {
    margin-bottom: 1rem;
    line-height: 1.5rem;
    color: #39393a;
  }

  /* Emphasis */
  strong {
    font-weight: 700;
  }

  em {
    font-style: italic;
  }

  del {
    text-decoration: line-through;
  }

  /* Blockquotes */
  blockquote {
    border-left-width: 1px;
    border-color: #9ca3af;
    padding-left: 1rem;
    padding-top: 0.5rem;
    padding-bottom: 0.5rem;
    margin-bottom: 1rem;
  }

  /* Lists */
  ul {
    list-style-type: disc;
    padding-left: 1rem;
    margin-bottom: 1rem;
  }

  ol {
    list-style-type: decimal;
    padding-left: 1rem;
    margin-bottom: 1rem;
  }

  li {
    margin-bottom: 0.5rem;
  }

  li > ul {
    list-style-type: disc;
    padding-left: 1rem;
    margin-bottom: 0.5rem;
  }

  li > ol {
    list-style-type: decimal;
    padding-left: 1rem;
    margin-bottom: 0.5rem;
  }

  /* Code blocks */
  pre {
    font-family: monospace;
    background-color: #1f2937;
    color: #f9fafb;
    border-radius: 0.375rem;
    padding: 1rem;
    margin-top: 1.5rem;
    margin-bottom: 1.5rem;
    line-height: 1.5rem;
    overflow: auto;
  }

  code {
    font-family: monospace;
    background-color: #1f2937;
    color: #f9fafb;
    border-radius: 0.375rem;
    padding-left: 0.5rem;
    padding-right: 0.5rem;
    padding-top: 0.25rem;
    padding-bottom: 0.25rem;
  }

  /* Tables */
  table {
    width: 100%;
    border-collapse: collapse;
    border-color: #d1d5db;
    margin-top: 1.5rem;
    margin-bottom: 1.5rem;
  }

  th {
    background-color: #1f2937;
    text-align: left;
    padding-top: 0.5rem;
    padding-bottom: 0.5rem;
    padding-left: 1rem;
    padding-right: 1rem;
    font-weight: 600;
    border-bottom-width: 1px;
    border-color: #d1d5db;
  }

  td {
    padding-top: 0.5rem;
    padding-bottom: 0.5rem;
    padding-left: 1rem;
    padding-right: 1rem;
    border-bottom-width: 1px;
    border-color: #d1d5db;
  }

  /* Images */
  img {
    width: 100%;
    object-fit: cover;
    border-radius: 0.75rem;
    margin-top: 1.5rem;
    margin-bottom: 1.5rem;
  }
`;

interface MarkdownProps {
  children: string;
}

export function Markdown({ children }: MarkdownProps) {
  return (
    <MarkdownWrapper>
      <ReactMarkdown
        components={{
          a: ({ href, children: linkChildren }) => (
            <a href={href} target="_blank" rel="noopener noreferrer">
              {linkChildren}
            </a>
          ),
        }}
      >
        {children}
      </ReactMarkdown>
    </MarkdownWrapper>
  );
}
