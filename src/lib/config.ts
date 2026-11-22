import raw from "../../config/app-config.json";
import type { Service } from "./types";

export type AppConfig = {
  scoring: {
    defaultCuratorWeight: number;
    followMultiplier: number;
    repeatStep: number;
    repeatCap: number;
    halfLifeDays: number;
    topCurators: number;
    obscurityScale: number;
    defaultDepth: number;
    pitchBoostPerMatch: number;
    pitchBoostCap: number;
    pitchBaseHeat: number;
  };
  queue: {
    size: number;
    maxPerArtist: number;
    serendipitySlots: number;
    excludeWindowDays: number;
    completeThreshold: number;
  };
  collect: {
    maxQueryLength: number;
    maxResultsPerPage: number;
    maxPagesPerGroup: number;
    costPerPostReadUsd: number;
    targetDomains: string[];
    shortenerDomains: string[];
  };
  popularity: { refreshDays: number };
  curators: { recentWindowDays: number; recentTracksShown: number };
  campaigns: {
    minReferenceArtists: number;
    maxReferenceArtists: number;
    commentMaxLength: number;
  };
  player: { servicePriority: Service[] };
};

export const appConfig = raw as unknown as AppConfig;
