import type { Service } from "../../types";
import type { PlayerAdapter } from "../types";
import { AppleMusicAdapter } from "./apple";
import { BandcampAdapter } from "./bandcamp";
import { SimulatedAdapter } from "./simulated";
import { SoundCloudAdapter } from "./soundcloud";

export function createAdapter(
  service: Service,
  ctx: { container: HTMLElement; simulate: boolean; isUserInitiated: () => boolean },
): PlayerAdapter {
  if (ctx.simulate) return new SimulatedAdapter(service, ctx.container, ctx);
  switch (service) {
    case "apple":
      return new AppleMusicAdapter();
    case "soundcloud":
      return new SoundCloudAdapter(ctx.container);
    case "bandcamp":
      return new BandcampAdapter(ctx.container);
  }
}
