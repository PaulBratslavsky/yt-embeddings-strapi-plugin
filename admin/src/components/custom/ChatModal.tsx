import React, { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import styled from "styled-components";
import qs from "qs";
import { useFetchClient } from "@strapi/strapi/admin";
import {
  Button,
  Typography,
  Box,
  TextInput,
  Modal,
  Accordion,
  Link,
} from "@strapi/design-system";

import { PLUGIN_ID } from "../../pluginId";
import { RobotIcon } from "./RobotIcon";
import { Markdown } from "./Markdown";

const StyledButton = styled(Button)`
  position: fixed;
  bottom: 1.5rem;
  right: 1.5rem;
  height: 3.5rem;
  width: 3.5rem;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1),
    0 2px 4px -1px rgba(0, 0, 0, 0.06);
  z-index: 100;

  svg {
    height: 1.75rem;
    width: 1.75rem;
  }
`;

const ResponseContainer = styled.div`
  border: solid 1px #e3e9f3;
  border-radius: 4px;
  padding: 1rem;
  color: #32324d;
  font-weight: 400;
  font-size: 0.875rem;
  display: block;
  width: 100%;
  max-height: 400px;
  background: inherit;
  overflow-y: auto;
  scroll-behavior: smooth;
`;

interface SourceDocument {
  pageContent: string;
  metadata: {
    id: string;
    title: string;
    deepLink?: string;
  };
}

interface QueryResponse {
  text: string;
  sourceDocuments: SourceDocument[];
}

interface AccordionDetailsProps {
  title: string;
  content: React.ReactNode;
  children?: React.ReactNode;
}

function AccordionDetails({ title, content, children }: AccordionDetailsProps) {
  return (
    <Box padding={1} background="primary100">
      <Accordion.Root size="S">
        <Accordion.Item value="acc-1">
          <Accordion.Header>
            <Accordion.Trigger>{title}</Accordion.Trigger>
          </Accordion.Header>
          <Accordion.Content>
            <Box padding={3}>
              <Typography>{content}</Typography>
              {children && <Box padding={1}>{children}</Box>}
            </Box>
          </Accordion.Content>
        </Accordion.Item>
      </Accordion.Root>
    </Box>
  );
}

interface ShowResponseProps {
  data: QueryResponse[];
  onNavigate: (id: string) => void;
}

function ShowResponse({ data, onNavigate }: ShowResponseProps) {
  return (
    <>
      {data.map((item, index) => (
        <Box key={index} marginBottom={4}>
          <Box padding={1}>
            <Markdown>{item.text}</Markdown>
          </Box>

          {item.sourceDocuments?.length > 0 &&
            item.sourceDocuments.map((doc, docIndex) => (
              <AccordionDetails
                key={docIndex}
                title={`Source: ${doc.metadata.title}`}
                content={<Markdown>{doc.pageContent}</Markdown>}
              >
                <Box display="flex" gap={3}>
                  {doc.metadata.deepLink && (
                    <a
                      href={doc.metadata.deepLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ color: '#4945ff', textDecoration: 'none', fontSize: '0.875rem' }}
                    >
                      Watch on YouTube ↗
                    </a>
                  )}
                  <Link
                    onClick={() => onNavigate(doc.metadata.id)}
                    style={{ cursor: "pointer" }}
                  >
                    View in Dashboard
                  </Link>
                </Box>
              </AccordionDetails>
            ))}
        </Box>
      ))}
    </>
  );
}

export function ChatModal() {
  const { get } = useFetchClient();
  const containerRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  const [isVisible, setIsVisible] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const [data, setData] = useState<QueryResponse[]>([]);

  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [data]);

  function handleNavigate(id: string) {
    setIsVisible(false);
    navigate(`/plugins/${PLUGIN_ID}/video/${id}`);
  }

  async function handleQueryEmbeddings(e: React.FormEvent) {
    e.preventDefault();
    if (!inputValue.trim() || isLoading) return;

    setIsLoading(true);
    try {
      const response = await get(
        `/${PLUGIN_ID}/embeddings/embeddings-query?${qs.stringify({
          query: inputValue,
        })}`
      );
      if (response.data && !response.data.error) {
        setData((prev) => [...prev, response.data as QueryResponse]);
      }
      setInputValue("");
    } catch (error) {
      console.error("Query failed:", error);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <>
      <StyledButton onClick={() => setIsVisible(true)} aria-label="Open chat">
        <RobotIcon height={28} width={28} />
      </StyledButton>

      <Modal.Root open={isVisible} onOpenChange={setIsVisible}>
        <Modal.Content>
          <Modal.Header>
            <Modal.Title>Chat With Your Data</Modal.Title>
          </Modal.Header>
          <Modal.Body>
            {data.length > 0 && (
              <Box padding={1} marginBottom={4}>
                <ResponseContainer ref={containerRef}>
                  <ShowResponse data={data} onNavigate={handleNavigate} />
                </ResponseContainer>
              </Box>
            )}
            <Box padding={1}>
              <form onSubmit={handleQueryEmbeddings}>
                <TextInput
                  placeholder="Enter your question"
                  type="text"
                  aria-label="Question"
                  name="question"
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    setInputValue(e.target.value)
                  }
                  value={inputValue}
                />
              </form>
            </Box>
          </Modal.Body>
          <Modal.Footer>
            <Modal.Close>
              <Button variant="tertiary">Cancel</Button>
            </Modal.Close>
            <Button
              onClick={handleQueryEmbeddings}
              disabled={!inputValue.trim() || isLoading}
              loading={isLoading}
            >
              {isLoading ? "Sending..." : "Send"}
            </Button>
          </Modal.Footer>
        </Modal.Content>
      </Modal.Root>
    </>
  );
}
