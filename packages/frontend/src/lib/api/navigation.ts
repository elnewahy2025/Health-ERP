import { apiClient } from './client';

export interface NavFavorite {
  id: string;
  path: string;
  label: string;
  position: number;
}

export interface RecentPage {
  path: string;
  label: string;
  visitedAt: string;
}

export const navigationApi = {
  async favorites(): Promise<NavFavorite[]> {
    const r = await apiClient.get('/navigation/favorites');
    return (r.data?.data ?? []) as NavFavorite[];
  },

  async addFavorite(path: string, label: string): Promise<void> {
    await apiClient.post('/navigation/favorites', { path, label });
  },

  async removeFavorite(id: string): Promise<void> {
    await apiClient.delete(`/navigation/favorites/${id}`);
  },

  async recentPages(): Promise<RecentPage[]> {
    const r = await apiClient.get('/navigation/visits');
    return (r.data?.data ?? []) as RecentPage[];
  },

  async logVisit(path: string, label: string): Promise<void> {
    await apiClient.post('/navigation/visits', { path, label });
  },
};
