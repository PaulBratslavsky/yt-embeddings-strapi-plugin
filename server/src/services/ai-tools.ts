/**
 * AI Tools Service — Adapter for AI SDK Discovery
 *
 * Re-exports canonical tool definitions from ../tools for AI SDK registration.
 * The AI SDK discovery loop calls getTools() to register these into its ToolRegistry.
 */

import type { Core } from '@strapi/strapi';
import { tools } from '../tools';

export default ({ strapi }: { strapi: Core.Strapi }) => ({
  getTools() {
    return tools;
  },
});
