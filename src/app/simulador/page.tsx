import SimuladorCiudadano from "@/presentation/components/simulator/SimuladorCiudadano";

export const metadata = {
  title: "Simulador ciudadano | SERVI-RED",
  description:
    "Simulador académico de reportes ciudadanos de servicios públicos.",
};

export default function PaginaSimulador() {
  return <SimuladorCiudadano />;
}