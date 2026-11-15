
import MapaReportes from "@/presentation/components/map/MapaReportes";

export const metadata = {
  title: "Mapa de reportes | SERVI-RED",
  description:
    "Visualización geográfica de reportes ciudadanos sobre servicios públicos.",
};

export default function PaginaMapa() {
  return <MapaReportes />;
}
