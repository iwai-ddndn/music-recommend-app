import type { Service } from "../../types";
import type { PlayerAdapter } from "../types";
import { AppleMusicAdapter } from "./apple";
import { BandcampAdapter } from "./bandcamp";
import { PreviewAdapter } from "./preview";
import { SimulatedAdapter } from "./simulated";
import { SoundCloudAdapter } from "./soundcloud";

export type PlaybackKind = "full" | "preview";

/** Apple Music は接続（認可）済みならフル再生、未接続なら30秒プレビュー */
export function playbackKind(service: Service, appleAuthorized: boolean): PlaybackKind {
  return service === "apple" && !appleAuthorized ? "preview" : "full";
}

export function createAdapter(
  service: Service,
  ctx: { container: HTMLElement; simulate: boolean; appleAuthorized: boolean; isUserInitiated: () => boolean },
): PlayerAdapter {
  // 模擬再生は E2E 専用（NEXT_PUBLIC_PLAYER_MODE=simulated）
  if (ctx.simulate) return new SimulatedAdapter(service, ctx.container, ctx);
  switch (service) {
    case "apple":
      return ctx.appleAuthorized ? new AppleMusicAdapter() : new PreviewAdapter();
    case "soundcloud":
      return new SoundCloudAdapter(ctx.container);
    case "bandcamp":
      return new BandcampAdapter(ctx.container);
  }
}
