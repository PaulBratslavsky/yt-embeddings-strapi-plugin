import { PLUGIN_ID } from "../pluginId";
import qs from "qs";

const API_BASE = `/${PLUGIN_ID}/embeddings`;
const SYNC_BASE = `/${PLUGIN_ID}`;

interface CreateEmbeddingData {
  title: string;
  content: string;
  collectionType?: string;
  fieldName?: string;
  related?: {
    __type: string;
    id: number;
  };
}

interface EmbeddingsListParams {
  page?: number;
  pageSize?: number;
  filters?: Record<string, any>;
}

export const embeddingsApi = {
  create: async (
    fetchClient: { post: Function },
    data: CreateEmbeddingData
  ) => {
    const response = await fetchClient.post(`${API_BASE}/create-embedding`, {
      data,
    });
    return response.data;
  },

  delete: async (fetchClient: { del: Function }, id: string) => {
    const response = await fetchClient.del(`${API_BASE}/delete-embedding/${id}`);
    return response.data;
  },

  getOne: async (fetchClient: { get: Function }, id: string) => {
    const response = await fetchClient.get(`${API_BASE}/find/${id}`);
    return response.data;
  },

  getAll: async (
    fetchClient: { get: Function },
    params?: EmbeddingsListParams
  ) => {
    const queryString = params ? `?${qs.stringify(params)}` : "";
    const response = await fetchClient.get(`${API_BASE}/find${queryString}`);
    return response.data;
  },

  query: async (fetchClient: { get: Function }, query: string) => {
    const response = await fetchClient.get(
      `${API_BASE}/embeddings-query?${qs.stringify({ query })}`
    );
    return response.data;
  },
};

export interface SyncStatus {
  neonCount: number;
  strapiCount: number;
  inSync: boolean;
  missingInStrapi: number;
  missingInNeon: number;
  contentDifferences: number;
}

export interface SyncResult {
  success: boolean;
  timestamp: string;
  dryRun?: boolean;
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

export interface RecreateResult {
  success: boolean;
  message: string;
  totalProcessed: number;
  created: number;
  failed: number;
  errors: string[];
}

export const syncApi = {
  getStatus: async (fetchClient: { get: Function }): Promise<SyncStatus> => {
    const response = await fetchClient.get(`${SYNC_BASE}/sync/status`);
    return response.data;
  },

  syncFromNeon: async (
    fetchClient: { post: Function },
    options?: { removeOrphans?: boolean; dryRun?: boolean }
  ): Promise<SyncResult> => {
    const queryString = options ? `?${qs.stringify(options)}` : "";
    const response = await fetchClient.post(`${SYNC_BASE}/sync${queryString}`);
    return response.data;
  },

  recreateAll: async (fetchClient: { post: Function }): Promise<RecreateResult> => {
    const response = await fetchClient.post(`${SYNC_BASE}/recreate`);
    return response.data;
  },
};
