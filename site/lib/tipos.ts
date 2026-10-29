// Tipos del resumen clínico que arma el servidor y consumen los portales.
import type { Clave } from "./data";

export type { Clave };

export interface Examen {
  codigo: string | null;
  codigoOriginal: string | null;
  nombre: string;
  fecha: string;
  resultado: string;
  sistema: Clave;
  establecimiento: string;
  idLocal: string;
  valor?: number;
  unidad?: string;
  referencia?: string;
  interpretacion?: string;
  fuenteReferencia?: string;
  tipo?: string;
  estado?: string;
  fechaHora?: string;
  encuentro?: string;
  muestra?: string;
}

export interface Alerta {
  codigo: string;
  examen: string;
  fechaAnterior: string;
  lugarAnterior: string;
  sistemaAnterior: Clave;
  fechaRepeticion: string;
  lugarRepeticion: string;
  sistemaRepeticion: Clave;
  dias: number;
  ventana: number;
}

export type EstadoSistema = "ok" | "sin_registro" | "no_disponible";

export interface TrazaSistema {
  clave: Clave;
  peticiones: number;
  ms: number;
  estado: EstadoSistema;
  error: string | null;
  examenes?: number;
}

// Origen de un dato: el sistema que lo tiene, su establecimiento y, si existe, las fechas del registro.
export interface Fuente {
  clave: Clave;
  lugar: string;
  fecha?: string;
  estado?: string;
  fin?: string;
}

export interface Atencion {
  id: string;
  fecha: string;
  fechaHora: string;
  sistema: Clave;
  establecimiento: string;
  profesional: string;
  motivo: string;
  diagnostico: string;
  tipo: string;
  examenes: Examen[];
  medicamentos: string[];
  sintomas: string;
  signos: string;
  evaluacion: string;
  plan: string;
  seguimiento: string;
}

export interface Resumen {
  dni: string;
  nombre: string;
  sexo: string;
  edad: number;
  establecimientos: { clave: Clave; idLocal: string | null; estado: EstadoSistema }[];
  condiciones: { codigo: string; nombre: string; fuentes: Fuente[] }[];
  alergias: { sustancia: string; reaccion: string; fuentes: Fuente[] }[];
  medicamentos: { nombre: string; fuentes: Fuente[] }[];
  examenes: Examen[];
  repetidos: Alerta[];
  atenciones: Atencion[];
  traza: { total: number; sistemas: TrazaSistema[]; examenes: number; traducidos: number };
}
