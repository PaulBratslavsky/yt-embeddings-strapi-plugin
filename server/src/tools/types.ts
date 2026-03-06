import type { Core } from '@strapi/strapi';
import type { z } from 'zod';

export interface ToolDefinition {
  name: string;
  description: string;
  schema: z.ZodObject<any>;
  execute: (args: any, strapi: Core.Strapi, context?: { adminUserId?: number }) => Promise<unknown>;
  /** If true, tool is only available in AI SDK chat, not exposed via MCP */
  internal?: boolean;
  /** If true, tool is safe for unauthenticated public chat (read-only) */
  publicSafe?: boolean;
}
