import { describe, expect, it } from "vitest";
import { FaceletCube } from "../analysis/facelets";
import { STANDARD_SCHEME, netOf } from "../vision/cubeNet";
import { START_SCHEME, fromStartPosition } from "./orientation";

describe("start position", () => {
  it("puts white on the bottom and green in front", () => {
    const net = netOf(FaceletCube.solved().apply(fromStartPosition("")), STANDARD_SCHEME);
    for (const face of ["U", "D", "F", "B", "R", "L"] as const) expect(net[face]).toEqual(Array(9).fill(START_SCHEME[face]));
    expect([START_SCHEME.D, START_SCHEME.F]).toEqual(["W", "G"]);
  });

  it("turns the faces of the start position", () => {
    // R from the start position turns the orange face (right side with white down, green front).
    const net = netOf(FaceletCube.solved().apply(fromStartPosition("R")), STANDARD_SCHEME);
    expect(net.R).toEqual(Array(9).fill("O"));
    expect(net.F[2]).toBe("W");
  });
});
