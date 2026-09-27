import { geoAlbersUsa, geoPath } from "d3-geo";
import { feature } from "topojson-client";
import atlas from "us-atlas/states-10m.json";
import { FIPS_TO_POSTAL } from "./fips";

export type StateShape = {
  postal: string;
  name: string;
  d: string;
};

type TopologyObject = Parameters<typeof feature>[1];

export function stateShapes(): StateShape[] {
  const topology = atlas as unknown as { objects: { states: TopologyObject } };
  const collection = feature(atlas as never, topology.objects.states) as unknown as {
    features: { id?: string | number; properties?: { name?: string } }[];
  };
  const projection = geoAlbersUsa().translate([480, 300]).scale(1100);
  const path = geoPath(projection);
  const shapes: StateShape[] = [];
  for (const shape of collection.features) {
    const postal = FIPS_TO_POSTAL[String(shape.id ?? "").padStart(2, "0")];
    const d = path(shape as never);
    if (!postal || !d) continue;
    shapes.push({ postal, name: shape.properties?.name ?? postal, d });
  }
  return shapes;
}
