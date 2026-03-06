import type { Core } from '@strapi/strapi';
import { tools } from '../mcp/tools';

export default ({ strapi }: { strapi: Core.Strapi }) => ({
  getTools() {
    return tools;
  },
});
