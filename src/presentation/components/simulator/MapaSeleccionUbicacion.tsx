"use client";

import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { MAX_VERTICES, normalizarArea, puntoEnArea, type AreaAfectada } from "@/domain/value_objects/cobertura";

type Props = {
  latitud: number;
  longitud: number;
  onCambiarUbicacion: (latitud: number, longitud: number) => void;
  areaAfectada?: AreaAfectada | null;
  onCambiarArea?: (area: AreaAfectada | null) => void;
  onEstadoDibujo?: (activo: boolean) => void;
};

export default function MapaSeleccionUbicacion({ latitud, longitud, onCambiarUbicacion, areaAfectada = null, onCambiarArea, onEstadoDibujo }: Props) {
  const contenedorRef = useRef<HTMLDivElement>(null);
  const mapaRef = useRef<L.Map | null>(null);
  const marcadorRef = useRef<L.CircleMarker | null>(null);
  const capaRef = useRef<L.LayerGroup | null>(null);
  const callbackRef = useRef({ onCambiarUbicacion, areaAfectada, onEstadoDibujo });
  const modoRef = useRef(false);
  const [dibujando, setDibujando] = useState(false);
  const [vertices, setVertices] = useState<number[][]>([]);
  const [error, setError] = useState("");

  useEffect(() => { callbackRef.current = { onCambiarUbicacion, areaAfectada, onEstadoDibujo }; }, [onCambiarUbicacion, areaAfectada, onEstadoDibujo]);
  useEffect(() => {
    if (!contenedorRef.current || mapaRef.current) return;
    const mapa = L.map(contenedorRef.current, { center: [latitud, longitud], zoom: 13, zoomControl: true, scrollWheelZoom: false, doubleClickZoom: false });
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors', maxZoom: 19,
    }).addTo(mapa);
    marcadorRef.current = L.circleMarker([latitud, longitud], { radius: 10, color: "#fff", weight: 3, fillColor: "#2563eb", fillOpacity: 1 }).addTo(mapa);
    capaRef.current = L.layerGroup().addTo(mapa);
    mapa.on("click", (event: L.LeafletMouseEvent) => {
      const lat = Number(event.latlng.lat.toFixed(6)), lng = Number(event.latlng.lng.toFixed(6));
      if (modoRef.current) {
        setVertices((actual) => actual.length < MAX_VERTICES ? [...actual, [lng, lat]] : actual);
      } else {
        callbackRef.current.onCambiarUbicacion(lat, lng);
        setError(callbackRef.current.areaAfectada && !puntoEnArea(callbackRef.current.areaAfectada, lat, lng)
          ? "Mueve el punto dentro del área dibujada antes de enviar." : "");
      }
    });
    mapaRef.current = mapa;
    const resize = new ResizeObserver(() => mapa.invalidateSize());
    resize.observe(contenedorRef.current);
    return () => { resize.disconnect(); mapa.remove(); mapaRef.current = null; marcadorRef.current = null; capaRef.current = null; callbackRef.current.onEstadoDibujo?.(false); };
    // Solo se crea una instancia; los valores posteriores se sincronizan en otros efectos.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!Number.isFinite(latitud) || !Number.isFinite(longitud)) return;
    marcadorRef.current?.setLatLng([latitud, longitud]);
    mapaRef.current?.panTo([latitud, longitud], { animate: false });
  }, [latitud, longitud]);

  useEffect(() => {
    const capa = capaRef.current;
    if (!capa) return;
    capa.clearLayers();
    if (areaAfectada && !dibujando) L.geoJSON(areaAfectada, { style: { color: "#7c3aed", fillOpacity: 0.18, className: "area-afectada" }, interactive: false }).addTo(capa);
    if (dibujando && vertices.length) {
      const puntos = vertices.map(([lng, lat]) => [lat, lng] as L.LatLngTuple);
      L.polyline(puntos, { color: "#7c3aed", dashArray: "5 5", interactive: false }).addTo(capa);
      puntos.forEach((p) => L.circleMarker(p, { radius: 4, color: "#7c3aed", interactive: false }).addTo(capa));
    }
  }, [vertices, areaAfectada, dibujando]);

  function modo(valor: boolean) { modoRef.current = valor; setDibujando(valor); onEstadoDibujo?.(valor); setError(""); }
  function terminar() {
    try {
      const area = normalizarArea({ type: "Polygon", coordinates: [[...vertices, vertices[0]]] });
      onCambiarArea?.(area); modo(false); setVertices([]);
      if (area && !puntoEnArea(area, latitud, longitud)) setError("Área guardada. Marca el punto del incidente dentro del contorno antes de enviar.");
    } catch (e) { setError(e instanceof Error ? e.message : "Área inválida."); }
  }

  return <div className="overflow-hidden rounded-xl border border-slate-200">
    {onCambiarArea && <div className="space-y-2 bg-violet-50 p-3 text-xs text-violet-950">
      <p className="font-semibold">Área afectada estimada (opcional)</p>
      <div className="flex flex-wrap gap-2">
        <button type="button" aria-pressed={!dibujando} onClick={() => { setVertices([]); modo(false); }} className="rounded-lg border border-slate-300 bg-white px-3 py-2">{dibujando ? "Cancelar dibujo" : "Marcar punto"}</button>
        <button type="button" aria-pressed={dibujando} onClick={() => { modo(true); setVertices([]); }} className="rounded-lg bg-violet-700 px-3 py-2 text-white">Dibujar área</button>
        {dibujando && <>
          <button type="button" disabled={vertices.length < 3} onClick={terminar} className="rounded-lg bg-emerald-700 px-3 py-2 text-white disabled:opacity-40">Terminar área</button>
          <button type="button" disabled={!vertices.length} onClick={() => setVertices((p) => p.slice(0, -1))} className="rounded-lg border bg-white px-3 py-2 disabled:opacity-40">Deshacer punto</button>
        </>}
        {(areaAfectada || vertices.length > 0) && <button type="button" onClick={() => { onCambiarArea(null); setVertices([]); modo(false); }} className="rounded-lg border bg-white px-3 py-2">Borrar área</button>}
      </div>
      <p role="status">{dibujando ? `Toca los vértices del contorno: ${vertices.length}/${MAX_VERTICES}. Termina con al menos tres.` : areaAfectada ? "Área dibujada. La superficie en m² se calcula en el servidor al enviar." : "Sin área estimada. Puedes dejarla sin dato si desconoces su extensión."}</p>
      <p>El contorno debe incluir el punto azul. No es la cobertura geográfica de la empresa.</p>
      {error && <p role="alert" className="font-semibold text-red-800">{error}</p>}
    </div>}
    <div ref={contenedorRef} className="h-[260px] w-full bg-slate-100" aria-label="Mapa para seleccionar la ubicación del incidente" />
    <p className="bg-slate-50 px-3 py-2 text-xs text-slate-500">{dibujando ? "Modo dibujo: cada clic o toque añade un vértice." : "Haz clic o toca el mapa para seleccionar el punto del incidente."} Usa + / − para el zoom.</p>
  </div>;
}
