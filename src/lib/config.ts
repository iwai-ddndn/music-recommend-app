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
    maxPerLeadCurator: number;
    rerankKeepNext: number;
  };
  taste: {
    boostMax: number;
    confidenceSignals: number;
    softFollowMultiplier: number;
    softFollowCount: number;
    curatorMultiplierMin: number;
    curatorMultiplierMax: number;
    seedWeight: number;
    anchorWeight: number;
    seedFloor: number;
    tagMin: number;
    tagMax: number;
    events: Record<"save" | "complete" | "fastSkip" | "skip", { tag: number; curator: number }>;
    fastSkipSec: number;
    eventDecay: number;
    halfLifeDays: number;
    trackTagsMax: number;
    profileShrinkMentions: number;
    recentExcludeMax: number;
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
