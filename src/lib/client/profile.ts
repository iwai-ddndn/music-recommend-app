"use client";

// 端末に持つプロフィール（好み・好きなアーティスト・聴いた曲・深さ）。
// ログイン不要で最初から自分向けの選曲にするため localStorage に保存し、ログイン時にサーバーの好みと統合する。
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { appConfig } from "../config";
import {
  applyEvent,
  emptyTaste,
  seedTaste,
  suggestCurators,
  userTags,
  type TagVector,
  type Taste,
  type TasteEvent,
} from "../scoring/taste";

type ProfileState = {
  hydrated: boolean;
  onboarded: boolean;
  scenes: string[];
  taste: Taste;
  /** 好きなアーティスト名（推薦キャンペーンのマッチングに使う） */
  favorites: string[];
  /** 完聴・スキップした曲（次のキューから外す） */
  heard: string[];
  depth: number;
  completeOnboarding(input: {
    scenes: string[];
    anchors: { name: string; tags: TagVector }[];
    curators: { id: string; tags: TagVector }[];
  }): void;
  skipOnboarding(): void;
  learn(e: TasteEvent, trackId: string): void;
  setTaste(t: Taste): void;
  dropSoftFollow(curatorId: string): void;
  setDepth(d: number): void;
  setFavorites(names: string[]): void;
  restart(): void;
};

export const useProfile = create<ProfileState>()(
  persist(
    (set) => ({
      hydrated: false,
      onboarded: false,
      scenes: [],
      taste: emptyTaste(),
      favorites: [],
      heard: [],
      depth: appConfig.scoring.defaultDepth,
      completeOnboarding({ scenes, anchors, curators }) {
        set((s) => {
          const seeded = seedTaste(
            { ...s.taste, seeds: {} },
            { scenes, anchors: anchors.map((a) => a.tags) },
            appConfig.taste,
          );
          // 好みに合う目利きを仮フォローする
          const softFollows = suggestCurators(
            userTags(seeded, appConfig.taste),
            curators,
            appConfig.taste.softFollowCount,
          );
          return {
            onboarded: true,
            scenes,
            taste: { ...seeded, softFollows },
            favorites: [...new Set([...s.favorites, ...anchors.map((a) => a.name)])],
          };
        });
      },
      skipOnboarding() {
        set({ onboarded: true });
      },
      learn(e, trackId) {
        set((s) => ({
          taste: applyEvent(s.taste, e, appConfig.taste),
          heard:
            e.kind === "save"
              ? s.heard
              : [...new Set([...s.heard, trackId])].slice(-appConfig.taste.recentExcludeMax),
        }));
      },
      setTaste(taste) {
        set({ taste });
      },
      dropSoftFollow(curatorId) {
        set((s) => ({ taste: { ...s.taste, softFollows: s.taste.softFollows.filter((id) => id !== curatorId) } }));
      },
      setDepth(depth) {
        set({ depth });
      },
      setFavorites(favorites) {
        set({ favorites });
      },
      restart() {
        set({ onboarded: false });
      },
    }),
    {
      name: "profile-v1",
      skipHydration: true,
      partialize: ({ onboarded, scenes, taste, favorites, heard, depth }) => ({
        onboarded,
        scenes,
        taste,
        favorites,
        heard,
        depth,
      }),
      onRehydrateStorage: () => () => {
        useProfile.setState({ hydrated: true });
      },
    },
  ),
);
