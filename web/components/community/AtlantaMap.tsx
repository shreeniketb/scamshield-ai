"use client";

import { useEffect, useRef, useState } from "react";
import type { FeatureCollection, Point } from "geojson";
import {
  GeoJSONSource,
  LngLatBounds,
  Map,
  NavigationControl,
  setWorkerUrl,
  type ExpressionSpecification,
  type MapMouseEvent,
} from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { ZipView } from "@/lib/communityView";

type AtlantaMapProps = {
  zips: ZipView[];
  highlighted: string[];
  activeZip: string | null;
  onHoverZip: (zip: string | null) => void;
};

function collection(zips: ZipView[]): FeatureCollection<Point> {
  return {
    type: "FeatureCollection",
    features: zips.map((zip) => ({
      type: "Feature",
      id: zip.zip,
      properties: {
        zip: zip.zip,
        neighborhood: zip.neighborhood,
        reports: zip.reports,
        topCampaign: zip.topCampaign,
      },
      geometry: { type: "Point", coordinates: [zip.lon, zip.lat] },
    })),
  };
}

function radiusPaint(reports: number[]): ExpressionSpecification | number {
  if (reports.length === 0) return 8;
  const min = Math.min(...reports);
  const max = Math.max(...reports);
  if (max <= min) return 16;
  const mid = Math.round((min + max) / 2);
  const stops = [...new Set([min, mid, max])].sort((a, b) => a - b);
  const radii = stops.length === 2 ? [9, 26] : [8, 16, 28];
  const expression: (string | number | string[])[] = ["interpolate", ["linear"], ["get", "reports"]];
  stops.forEach((stop, index) => {
    expression.push(stop, radii[index] ?? 28);
  });
  return expression as ExpressionSpecification;
}

function legendStops(reports: number[]) {
  if (reports.length === 0) return [];
  const min = Math.min(...reports);
  const max = Math.max(...reports);
  if (max <= min) return [{ reports: max, size: 16 }];
  const mid = Math.round((min + max) / 2);
  const stops = [...new Set([min, mid, max])].sort((a, b) => a - b);
  const radii = stops.length === 2 ? [9, 26] : [8, 16, 28];
  return stops.map((count, index) => ({ reports: count, size: radii[index] ?? 28 }));
}

export function AtlantaMap({ zips, highlighted, activeZip, onHoverZip }: AtlantaMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<Map | null>(null);
  const onHoverRef = useRef(onHoverZip);
  const zipsRef = useRef(zips);
  onHoverRef.current = onHoverZip;
  zipsRef.current = zips;
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const legend = legendStops(zips.map((zip) => zip.reports));
  const active = zips.find((zip) => zip.zip === activeZip) ?? null;

  useEffect(() => {
    const container = containerRef.current;
    if (!container || mapRef.current) return;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    setWorkerUrl("/maplibre/maplibre-gl-worker.mjs");
    const map = new Map({
      container,
      style: "https://tiles.openfreemap.org/styles/liberty",
      center: [-84.39, 33.77],
      zoom: 10,
      cooperativeGestures: true,
      fadeDuration: reduceMotion ? 0 : 180,
    });
    map.addControl(new NavigationControl({ showCompass: false }), "top-right");
    const timer = window.setTimeout(() => setFailed(true), 8000);
    map.on("load", () => {
      window.clearTimeout(timer);
      setFailed(false);
      map.addSource("zips", {
        type: "geojson",
        promoteId: "zip",
        data: collection(zipsRef.current),
      });
      map.addLayer({
        id: "zip-circles",
        type: "circle",
        source: "zips",
        paint: {
          "circle-color": [
            "case",
            ["boolean", ["feature-state", "active"], false],
            "#0F5257",
            "#3D8F8A",
          ],
          "circle-radius": 12,
          "circle-opacity": ["case", ["boolean", ["feature-state", "dim"], false], 0.28, 0.92],
          "circle-stroke-width": ["case", ["boolean", ["feature-state", "active"], false], 3, 1.5],
          "circle-stroke-color": "#ffffff",
          "circle-opacity-transition": { duration: reduceMotion ? 0 : 180 },
          "circle-stroke-width-transition": { duration: reduceMotion ? 0 : 180 },
          "circle-color-transition": { duration: reduceMotion ? 0 : 180 },
        },
      });
      map.on("mousemove", (event: MapMouseEvent) => {
        const features = map.queryRenderedFeatures(event.point, { layers: ["zip-circles"] });
        const zip = features[0]?.properties?.zip;
        if (typeof zip === "string") {
          map.getCanvas().style.cursor = "pointer";
          onHoverRef.current(zip);
        } else {
          map.getCanvas().style.cursor = "";
        }
      });
      map.getCanvas().addEventListener("mouseleave", () => {
        map.getCanvas().style.cursor = "";
        onHoverRef.current(null);
      });
      setReady(true);
    });
    mapRef.current = map;
    const observer = new ResizeObserver(() => map.resize());
    observer.observe(container);
    return () => {
      window.clearTimeout(timer);
      observer.disconnect();
      map.remove();
      mapRef.current = null;
      setReady(false);
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const source = map.getSource("zips") as GeoJSONSource | undefined;
    source?.setData(collection(zips));
    map.setPaintProperty("zip-circles", "circle-radius", radiusPaint(zips.map((zip) => zip.reports)));
    if (zips.length > 0) {
      const bounds = new LngLatBounds();
      zips.forEach((zip) => bounds.extend([zip.lon, zip.lat]));
      map.fitBounds(bounds, { padding: 56, maxZoom: 11.2, duration: 0 });
    }
  }, [ready, zips]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const lit = new Set(highlighted);
    const dimming = lit.size > 0;
    zips.forEach((zip) => {
      map.setFeatureState(
        { source: "zips", id: zip.zip },
        { active: lit.has(zip.zip), dim: dimming && !lit.has(zip.zip) },
      );
    });
  }, [ready, zips, highlighted]);

  function onKeyDown(event: React.KeyboardEvent) {
    if (zips.length === 0) return;
    if (!["ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp"].includes(event.key)) return;
    event.preventDefault();
    const index = Math.max(
      0,
      zips.findIndex((zip) => zip.zip === activeZip),
    );
    const step = event.key === "ArrowRight" || event.key === "ArrowDown" ? 1 : -1;
    const next = zips[(index + step + zips.length) % zips.length];
    if (next) onHoverZip(next.zip);
  }

  return (
    <div>
      <div
        className="atlanta-map relative h-[420px] overflow-hidden rounded-[12px] bg-paper lg:h-[480px]"
        tabIndex={0}
        role="application"
        aria-label="Atlanta map. Arrow keys move between ZIP codes with 5 or more reports."
        onKeyDown={onKeyDown}
      >
        <div ref={containerRef} className="h-full w-full" />
        {!ready && !failed ? (
          <div className="absolute inset-0 animate-pulse bg-line" aria-hidden="true" />
        ) : null}
        {failed && !ready ? (
          <div className="absolute inset-0 overflow-auto bg-paper p-4">
            <p className="font-medium">The map tiles didn’t load.</p>
            <ul className="mt-3 space-y-2 text-sm">
              {zips.map((zip) => (
                <li key={zip.zip}>
                  {zip.neighborhood} · ZIP {zip.zip} · {zip.reports} reports · {zip.topCampaign}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        {active ? (
          <div
            role="status"
            aria-live="polite"
            className="pointer-events-none absolute left-3 top-3 max-w-[15rem] rounded-card bg-surface px-3 py-2 shadow-card"
          >
            <p className="font-medium text-ink">{active.neighborhood}</p>
            <p className="text-sm text-muted">ZIP {active.zip}</p>
            <p className="text-sm tabular-nums text-ink">{active.reports.toLocaleString("en-US")} reports</p>
            <p className="text-sm text-ink">{active.topCampaign}</p>
          </div>
        ) : null}
      </div>

      <div className="mt-4 flex flex-wrap items-end gap-4" aria-hidden="true">
        {legend.map((stop) => (
          <div key={stop.reports} className="flex items-center gap-2">
            <span
              className="inline-block rounded-full border border-white bg-[#3D8F8A]"
              style={{ width: stop.size, height: stop.size }}
            />
            <span className="text-sm tabular-nums text-muted">{stop.reports.toLocaleString("en-US")}</span>
          </div>
        ))}
        <p className="text-sm text-muted">Circle size is reports</p>
      </div>
      <ul className="sr-only">
        {zips.map((zip) => (
          <li key={zip.zip}>
            {zip.neighborhood}, ZIP {zip.zip}, {zip.reports} reports, top campaign {zip.topCampaign}
          </li>
        ))}
      </ul>
      <p className="mt-3 text-sm text-muted">
        OpenFreeMap. Neighbourhoods appear after 5 reports in this range. Hover a campaign to light its ZIP codes.
      </p>
    </div>
  );
}
