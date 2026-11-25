"use client";
import { useEffect, useMemo, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { normalizarArea, type AreaAfectada } from "@/domain/value_objects/cobertura";

export default function MapaAreaAfectada({ area }: { area: AreaAfectada }) {
  const contenedor = useRef<HTMLDivElement>(null);
  const valida = useMemo(() => { try { return normalizarArea(area); } catch { return null; } }, [area]);
  useEffect(() => {
    if (!contenedor.current || !valida) return;
    const map = L.map(contenedor.current, { scrollWheelZoom: false });
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' }).addTo(map);
    const capa = L.geoJSON(valida, { style: { color: "#7c3aed", fillOpacity: 0.2, className: "area-afectada" } }).addTo(map);
    map.fitBounds(capa.getBounds(), { padding: [20, 20], maxZoom: 17 });
    const resize = new ResizeObserver(() => map.invalidateSize()); resize.observe(contenedor.current);
    return () => { resize.disconnect(); map.remove(); };
  }, [valida]);
  if (!valida) return <p className="text-xs text-slate-500">Área no disponible.</p>;
  return <div ref={contenedor} aria-label="Mapa del área afectada estimada" className="isolate mt-3 h-64 w-full rounded-xl border border-violet-200" />;
}
