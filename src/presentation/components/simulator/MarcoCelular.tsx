import type { ReactNode } from "react";

type Props = {
  etiqueta: string;
  children: ReactNode;
};

export default function MarcoCelular({ etiqueta, children }: Props) {
  return (
    <section
      aria-label={etiqueta}
      className="isolate mx-auto flex h-[min(760px,85dvh)] w-full min-w-0 max-w-[430px] flex-col overflow-hidden rounded-[36px] border-[7px] border-slate-900 bg-white shadow-xl"
    >
      <div aria-hidden="true" className="shrink-0 pb-2 pt-3">
        <div className="mx-auto h-2 w-24 rounded-full bg-slate-900" />
      </div>

      <div
        role="region"
        aria-label="Contenido desplazable del formulario"
        tabIndex={0}
        className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-y-contain px-5 pb-7 pt-4 [scrollbar-gutter:stable] [scrollbar-width:thin] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-slate-400 sm:px-7"
      >
        {children}
      </div>

      <div className="shrink-0 border-t border-slate-100 px-4 pb-2 pt-2 text-center">
        <p className="text-[10px] text-slate-500">Desplázate dentro del celular</p>
        <div aria-hidden="true" className="mx-auto mt-2 h-1 w-24 rounded-full bg-slate-300" />
      </div>
    </section>
  );
}
