import AsyncStorage from "@react-native-async-storage/async-storage";
import type { Profile } from "../types";
import { userStoragePrefix } from "./userStorage";

export type AuthSnapshot = {
  profile: Profile;
  subscriptionActive: boolean;
  isSuperAdmin: boolean;
  savedAt: string;
};

export function authSnapshotKey(userId: string) {
  return `${userStoragePrefix(userId)}.auth`;
}

export function isSubscriptionActiveLocal(profile: Profile | null | undefined): boolean {
  if (!profile?.subscription_expires_at) return false;
  return new Date(profile.subscription_expires_at).getTime() > Date.now();
}

export async function loadAuthSnapshot(
  userId: string,
): Promise<AuthSnapshot | null> {
  if (!userId) return null;
  try {
    const raw = await AsyncStorage.getItem(authSnapshotKey(userId));
    if (!raw) return null;
    return JSON.parse(raw) as AuthSnapshot;
  } catch {
    return null;
  }
}

export async function saveAuthSnapshot(
  userId: string,
  snapshot: Omit<AuthSnapshot, "savedAt">,
): Promise<void> {
  if (!userId) return;
  try {
    const payload: AuthSnapshot = {
      ...snapshot,
      savedAt: new Date().toISOString(),
    };
    await AsyncStorage.setItem(authSnapshotKey(userId), JSON.stringify(payload));
  } catch {
    // ignore
  }
}

export async function clearAuthSnapshot(userId: string): Promise<void> {
  if (!userId) return;
  try {
    await AsyncStorage.removeItem(authSnapshotKey(userId));
  } catch {
    // ignore
  }
}
