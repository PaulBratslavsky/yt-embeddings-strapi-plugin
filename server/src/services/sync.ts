import type { Core } from "@strapi/strapi";
import { pluginManager } from "../plugin-manager";

const PLUGIN_ID = "yt-embeddings-strapi-plugin";
const CONTENT_TYPE_UID = `plugin::${PLUGIN_ID}.embedding` as const;

export interface SyncResult {
  success: boolean;
  timestamp: string;
  dryRun: boolean;
  neonCount: number;
  strapiCount: number;
  actions: {
    created: number;
    updated: number;
    orphansRemoved: number;
  };
  details: {
    created: string[];
    updated: string[];
    orphansRemoved: string[];
  };
  errors: string[];
}

interface NeonEmbedding {
  id: string;
  strapiId: string;
  title: string;
  content: string;
  collectionType: string;
  fieldName: string;
}

interface StrapiEmbedding {
  documentId: string;
  title: string;
  content: string;
  embeddingId: string | null;
  collectionType: string;
  fieldName: string;
}

export interface RecreateResult {
  success: boolean;
  timestamp: string;
  deletedFromNeon: number;
  processedFromStrapi: number;
  recreatedInNeon: number;
  errors: string[];
  details: {
    recreated: string[];
    failed: string[];
  };
}

const sync = ({ strapi }: { strapi: Core.Strapi }) => ({
  /**
   * Sync embeddings from Neon DB to Strapi DB
   *
   * This performs the following operations:
   * 1. Fetches all embeddings from Neon DB (source of truth)
   * 2. Fetches all embeddings from Strapi DB
   * 3. Creates missing entries in Strapi that exist in Neon
   * 4. Updates Strapi entries where content differs from Neon
   * 5. Optionally removes orphaned Strapi entries (no matching Neon record)
   */
  async syncFromNeon(options?: {
    removeOrphans?: boolean;
    dryRun?: boolean;
  }): Promise<SyncResult> {
    const { removeOrphans = false, dryRun = false } = options || {};

    const result: SyncResult = {
      success: false,
      timestamp: new Date().toISOString(),
      dryRun,
      neonCount: 0,
      strapiCount: 0,
      actions: {
        created: 0,
        updated: 0,
        orphansRemoved: 0,
      },
      details: {
        created: [],
        updated: [],
        orphansRemoved: [],
      },
      errors: [],
    };

    // Check if plugin is initialized
    if (!pluginManager.isInitialized()) {
      result.errors.push(
        "Plugin manager not initialized. Check your Neon and OpenAI configuration."
      );
      return result;
    }

    try {
      // Step 1: Get all embeddings from Neon DB
      const neonEmbeddings = await pluginManager.getAllNeonEmbeddings();
      result.neonCount = neonEmbeddings.length;

      // Step 2: Get all embeddings from Strapi DB
      const strapiEmbeddings = (await strapi
        .documents(CONTENT_TYPE_UID)
        .findMany({
          limit: 10000, // High limit to get all
        })) as unknown as StrapiEmbedding[];
      result.strapiCount = strapiEmbeddings.length;

      // Create lookup maps
      const neonBystrapiId = new Map<string, NeonEmbedding>();
      for (const neon of neonEmbeddings) {
        if (neon.strapiId) {
          neonBystrapiId.set(neon.strapiId, neon);
        }
      }

      const strapiByDocumentId = new Map<string, StrapiEmbedding>();
      for (const strapi of strapiEmbeddings) {
        strapiByDocumentId.set(strapi.documentId, strapi);
      }

      // Step 3: Find Neon embeddings that don't exist in Strapi
      for (const neon of neonEmbeddings) {
        if (!neon.strapiId) {
          // Neon record has no Strapi reference - skip or log
          result.errors.push(
            `Neon embedding ${neon.id} has no strapiId in metadata`
          );
          continue;
        }

        const existingStrapi = strapiByDocumentId.get(neon.strapiId);

        if (!existingStrapi) {
          // Create new Strapi entry
          if (!dryRun) {
            try {
              await strapi.documents(CONTENT_TYPE_UID).create({
                data: {
                  documentId: neon.strapiId,
                  title: neon.title,
                  content: neon.content,
                  embeddingId: neon.id,
                  collectionType: neon.collectionType,
                  fieldName: neon.fieldName,
                } as any,
              });
              result.actions.created++;
              result.details.created.push(
                `${neon.strapiId} (${neon.title || "untitled"})`
              );
            } catch (error) {
              result.errors.push(
                `Failed to create Strapi entry for ${neon.strapiId}: ${error}`
              );
            }
          } else {
            result.actions.created++;
            result.details.created.push(
              `[DRY RUN] ${neon.strapiId} (${neon.title || "untitled"})`
            );
          }
        } else {
          // Check if content needs updating
          const contentChanged = existingStrapi.content !== neon.content;
          const titleChanged = existingStrapi.title !== neon.title;
          const embeddingIdMissing = !existingStrapi.embeddingId;

          if (contentChanged || titleChanged || embeddingIdMissing) {
            if (!dryRun) {
              try {
                await strapi.documents(CONTENT_TYPE_UID).update({
                  documentId: neon.strapiId,
                  data: {
                    title: neon.title,
                    content: neon.content,
                    embeddingId: neon.id,
                  } as any,
                });
                result.actions.updated++;
                result.details.updated.push(
                  `${neon.strapiId} (${neon.title || "untitled"})`
                );
              } catch (error) {
                result.errors.push(
                  `Failed to update Strapi entry ${neon.strapiId}: ${error}`
                );
              }
            } else {
              result.actions.updated++;
              result.details.updated.push(
                `[DRY RUN] ${neon.strapiId} (${neon.title || "untitled"})`
              );
            }
          }
        }
      }

      // Step 4: Handle orphaned Strapi entries (exist in Strapi but not in Neon)
      if (removeOrphans) {
        for (const strapiEmbed of strapiEmbeddings) {
          const hasNeonRecord = neonBystrapiId.has(strapiEmbed.documentId);

          if (!hasNeonRecord) {
            if (!dryRun) {
              try {
                await strapi.documents(CONTENT_TYPE_UID).delete({
                  documentId: strapiEmbed.documentId,
                });
                result.actions.orphansRemoved++;
                result.details.orphansRemoved.push(
                  `${strapiEmbed.documentId} (${strapiEmbed.title || "untitled"})`
                );
              } catch (error) {
                result.errors.push(
                  `Failed to remove orphan ${strapiEmbed.documentId}: ${error}`
                );
              }
            } else {
              result.actions.orphansRemoved++;
              result.details.orphansRemoved.push(
                `[DRY RUN] ${strapiEmbed.documentId} (${strapiEmbed.title || "untitled"})`
              );
            }
          }
        }
      }

      result.success = result.errors.length === 0;
      return result;
    } catch (error) {
      result.errors.push(`Sync failed: ${error}`);
      return result;
    }
  },

  /**
   * Get sync status - compare Neon and Strapi without making changes
   */
  async getSyncStatus(): Promise<{
    neonCount: number;
    strapiCount: number;
    inSync: boolean;
    missingInStrapi: number;
    missingInNeon: number;
    contentDifferences: number;
  }> {
    if (!pluginManager.isInitialized()) {
      throw new Error("Plugin manager not initialized");
    }

    const neonEmbeddings = await pluginManager.getAllNeonEmbeddings();
    const strapiEmbeddings = (await strapi
      .documents(CONTENT_TYPE_UID)
      .findMany({
        limit: 10000,
      })) as unknown as StrapiEmbedding[];

    const neonBystrapiId = new Map<string, NeonEmbedding>();
    for (const neon of neonEmbeddings) {
      if (neon.strapiId) {
        neonBystrapiId.set(neon.strapiId, neon);
      }
    }

    const strapiByDocumentId = new Map<string, StrapiEmbedding>();
    for (const s of strapiEmbeddings) {
      strapiByDocumentId.set(s.documentId, s);
    }

    let missingInStrapi = 0;
    let contentDifferences = 0;

    for (const neon of neonEmbeddings) {
      if (!neon.strapiId) continue;
      const strapiRecord = strapiByDocumentId.get(neon.strapiId);
      if (!strapiRecord) {
        missingInStrapi++;
      } else if (strapiRecord.content !== neon.content) {
        contentDifferences++;
      }
    }

    let missingInNeon = 0;
    for (const s of strapiEmbeddings) {
      if (!neonBystrapiId.has(s.documentId)) {
        missingInNeon++;
      }
    }

    return {
      neonCount: neonEmbeddings.length,
      strapiCount: strapiEmbeddings.length,
      inSync:
        missingInStrapi === 0 &&
        missingInNeon === 0 &&
        contentDifferences === 0,
      missingInStrapi,
      missingInNeon,
      contentDifferences,
    };
  },

  /**
   * Recreate all embeddings in Neon DB from Strapi data
   *
   * This will:
   * 1. Delete ALL embeddings from Neon DB
   * 2. Re-create embeddings for each Strapi embedding entry
   * 3. Update Strapi entries with new embedding IDs
   *
   * Use this when embeddings were created with incorrect metadata format
   */
  async recreateAllEmbeddings(): Promise<RecreateResult> {
    const result: RecreateResult = {
      success: false,
      timestamp: new Date().toISOString(),
      deletedFromNeon: 0,
      processedFromStrapi: 0,
      recreatedInNeon: 0,
      errors: [],
      details: {
        recreated: [],
        failed: [],
      },
    };

    if (!pluginManager.isInitialized()) {
      result.errors.push(
        "Plugin manager not initialized. Check your Neon and OpenAI configuration."
      );
      return result;
    }

    try {
      // Step 1: Clear all embeddings from Neon
      console.log("[recreateAllEmbeddings] Step 1: Clearing Neon DB...");
      result.deletedFromNeon = await pluginManager.clearAllNeonEmbeddings();
      console.log(`[recreateAllEmbeddings] Deleted ${result.deletedFromNeon} embeddings from Neon`);

      // Step 2: Get all embeddings from Strapi
      console.log("[recreateAllEmbeddings] Step 2: Fetching Strapi embeddings...");
      const strapiEmbeddings = await strapi
        .documents(CONTENT_TYPE_UID)
        .findMany({
          limit: -1, // Get all
        });

      result.processedFromStrapi = strapiEmbeddings.length;
      console.log(`[recreateAllEmbeddings] Found ${strapiEmbeddings.length} embeddings in Strapi`);

      if (strapiEmbeddings.length === 0) {
        result.success = true;
        return result;
      }

      // Step 3: Recreate each embedding in Neon
      console.log("[recreateAllEmbeddings] Step 3: Recreating embeddings in Neon...");

      for (let i = 0; i < strapiEmbeddings.length; i++) {
        const entry = strapiEmbeddings[i] as any;
        const progress = `[${i + 1}/${strapiEmbeddings.length}]`;

        if (!entry.content) {
          console.log(`${progress} Skipping ${entry.documentId} - no content`);
          result.details.failed.push(`${entry.documentId}: no content`);
          continue;
        }

        try {
          console.log(`${progress} Creating embedding for: ${entry.title || entry.documentId}`);

          // Create embedding in Neon with proper JSONB metadata
          const embeddingResult = await pluginManager.createEmbedding({
            id: entry.documentId,
            title: entry.title || "",
            content: entry.content,
            collectionType: entry.collectionType || "standalone",
            fieldName: entry.fieldName || "content",
          });

          // Update Strapi entry with new embedding ID
          await strapi.documents(CONTENT_TYPE_UID).update({
            documentId: entry.documentId,
            data: {
              embeddingId: embeddingResult.embeddingId,
              embedding: embeddingResult.embedding,
            } as any,
          });

          result.recreatedInNeon++;
          result.details.recreated.push(`${entry.documentId} (${entry.title || "untitled"})`);

          // Add small delay to avoid rate limiting
          if (i < strapiEmbeddings.length - 1) {
            await new Promise((resolve) => setTimeout(resolve, 500));
          }
        } catch (error: any) {
          console.error(`${progress} Failed:`, error.message || error);
          result.errors.push(`${entry.documentId}: ${error.message || error}`);
          result.details.failed.push(`${entry.documentId}: ${error.message || error}`);
        }
      }

      result.success = result.errors.length === 0;
      console.log(`[recreateAllEmbeddings] Complete. Recreated: ${result.recreatedInNeon}, Failed: ${result.details.failed.length}`);

      return result;
    } catch (error: any) {
      result.errors.push(`Recreate failed: ${error.message || error}`);
      return result;
    }
  },
});

export default sync;
