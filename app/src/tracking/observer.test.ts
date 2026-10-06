import { describe, expect, it } from "vitest";
import type { Reading } from "../vision/classifier";
import { FaceObserver } from "./observer";

const face = (c: Reading): Reading[] => Array(9).fill(c);

describe("FaceObserver", () => {
  it("emits once the face is stable, and again only when it changes", () => {
    const o = new FaceObserver(3);
    expect(o.push(face("G"))).toBeNull();
    expect(o.push(face("G"))).toBeNull();
    expect(o.push(face("G"))).not.toBeNull();
    expect(o.push(face("G"))).toBeNull(); // same face
    const turned = face("G");
    turned[0] = turned[1] = turned[2] = "R";
    o.push(turned);
    o.push(turned);
    expect(o.push(turned)?.slice(0, 3)).toEqual([2, 2, 2].map(() => expect.any(Number)));
  });

  it("does not emit while the readings flicker (mid-turn)", () => {
    const o = new FaceObserver(3);
    const a = face("G");
    const b = face("G");
    b.fill("R", 0, 6);
    for (let i = 0; i < 6; i++) expect(o.push(i % 2 ? a : b)).toBeNull();
  });

  it("keeps stickers hidden by a hand as unknown", () => {
    const o = new FaceObserver(3);
    const hidden = face("G");
    hidden[4] = hidden[5] = "?";
    o.push(hidden);
    o.push(hidden);
    const obs = o.push(hidden)!;
    expect(obs[4]).toBeNull();
    expect(obs[0]).not.toBeNull();
  });
});
