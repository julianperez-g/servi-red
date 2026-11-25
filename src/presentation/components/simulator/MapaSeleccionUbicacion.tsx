
"use client";

import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

type Props = {
  latitud: number;
  longitud: number;
  onCambiarUbicacion: (latitud: number, longitud: number) => void;
};

export default function MapaSeleccionUbicacion({
  latitud,
  longitud,
  onCambiarUbicacion,
}: Props) {
  const contenedorRef = useRef<HTMLDivElement>(null);
  const mapaRef = useRef<L.Map | null>(null);
  const marcadorRef = useRef<L.CircleMarker | null>(null);
  const callbackRef = useRef(onCambiarUbicacion);

  useEffect(() => {
    callbackRef.current = onCambiarUbicacion;
  }, [onCambiarUbicacion]);

  useEffect(() => {
    if (!contenedorRef.current || mapaRef.current) return;

    const mapa = L.map(contenedorRef.current, {
      center: [latitud, longitud],
      zoom: 13,
      zoomControl: true,
      // Dejar que la rueda desplace el formulario; usar los controles o pinza para zoom.
      scrollWheelZoom: false,
    });

    L.tileLayer(
      "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
      {
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 19,
      }
    ).addTo(mapa);

    const marcador = L.circleMarker([latitud, longitud], {
      radius: 10,
      color: "#ffffff",
      weight: 3,
      fillColor: "#2563eb",
      fillOpacity: 1,
    }).addTo(mapa);

    mapa.on("click", (evento: L.LeafletMouseEvent) => {
      const nuevaLatitud = Number(evento.latlng.lat.toFixed(6));
      const nuevaLongitud = Number(evento.latlng.lng.toFixed(6));

      marcador.setLatLng([nuevaLatitud, nuevaLongitud]);
      callbackRef.current(nuevaLatitud, nuevaLongitud);
    });

    mapaRef.current = mapa;
    marcadorRef.current = marcador;

    const ajuste = window.setTimeout(() => {
      mapa.invalidateSize();
    }, 150);

    return () => {
      window.clearTimeout(ajuste);
      mapa.remove();
      mapaRef.current = null;
      marcadorRef.current = null;
    };
    // El mapa se inicializa una sola vez.
    // Las coordenadas posteriores se sincronizan abajo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (
      !Number.isFinite(latitud) ||
      !Number.isFinite(longitud) ||
      !mapaRef.current ||
      !marcadorRef.current
    ) {
      return;
    }

    const posicion: L.LatLngExpression = [latitud, longitud];

    marcadorRef.current.setLatLng(posicion);
    mapaRef.current.panTo(posicion);
  }, [latitud, longitud]);

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200">
      <div
        ref={contenedorRef}
        className="h-[260px] w-full bg-slate-100"
        aria-label="Mapa para seleccionar la ubicación del incidente"
      />
      <p className="bg-slate-50 px-3 py-2 text-xs text-slate-500">
        Haz clic sobre el mapa para seleccionar la ubicación.
      </p>
    </div>
  );
}
