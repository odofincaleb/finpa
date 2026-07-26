import AsyncStorage from "@react-native-async-storage/async-storage";
import type { TransactionWriteInput } from "./api";

const QUEUE_KEY = "finpa.syncQueue";

export type SyncQueueItem =
  | {
      id: string;
      op: "create";
      localId: string;
      payload: TransactionWriteInput;
      createdAt: string;
    }
  | {
      id: string;
      op: "update";
      localId: string;
      serverId?: string;
      payload: Partial<TransactionWriteInput>;
      createdAt: string;
    }
  | {
      id: string;
      op: "delete";
      localId: string;
      serverId?: string;
      createdAt: string;
    };

export async function loadSyncQueue(): Promise<SyncQueueItem[]> {
  try {
    const raw = await AsyncStorage.getItem(QUEUE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as SyncQueueItem[];
  } catch {
    return [];
  }
}

export async function saveSyncQueue(items: SyncQueueItem[]): Promise<void> {
  try {
    await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(items));
  } catch {
    // ignore
  }
}

export async function enqueueSync(
  item:
    | Omit<Extract<SyncQueueItem, { op: "create" }>, "id" | "createdAt">
    | Omit<Extract<SyncQueueItem, { op: "update" }>, "id" | "createdAt">
    | Omit<Extract<SyncQueueItem, { op: "delete" }>, "id" | "createdAt">,
): Promise<SyncQueueItem[]> {
  const queue = await loadSyncQueue();
  const nextItem = {
    ...item,
    id: `q-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: new Date().toISOString(),
  } as SyncQueueItem;

  // Coalesce: delete cancels pending create for same localId
  if (nextItem.op === "delete") {
    const filtered = queue.filter(
      (q) => !(q.op === "create" && q.localId === nextItem.localId),
    );
    const stillNeedsDelete = !queue.some(
      (q) => q.op === "create" && q.localId === nextItem.localId,
    );
    const next = stillNeedsDelete
      ? [
          ...filtered.filter((q) => q.localId !== nextItem.localId),
          nextItem,
        ]
      : filtered.filter((q) => q.localId !== nextItem.localId);
    await saveSyncQueue(next);
    return next;
  }

  if (nextItem.op === "update") {
    const createIdx = queue.findIndex(
      (q) => q.op === "create" && q.localId === nextItem.localId,
    );
    if (createIdx >= 0) {
      const create = queue[createIdx] as Extract<SyncQueueItem, { op: "create" }>;
      const merged: SyncQueueItem = {
        ...create,
        payload: { ...create.payload, ...nextItem.payload },
      };
      const next = [...queue];
      next[createIdx] = merged;
      await saveSyncQueue(next);
      return next;
    }
  }

  const next = [...queue, nextItem];
  await saveSyncQueue(next);
  return next;
}

export function isLocalId(id: string) {
  return id.startsWith("local-");
}
