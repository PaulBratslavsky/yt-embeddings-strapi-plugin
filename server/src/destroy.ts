import type { Core } from "@strapi/strapi";
import { pluginManager } from "./plugin-manager";

const destroy = async ({ strapi }: { strapi: Core.Strapi }) => {
  // Clean up the plugin manager (close DB connections)
  await pluginManager.destroy();
  console.log("Content Embeddings plugin destroyed");
};

export default destroy;
