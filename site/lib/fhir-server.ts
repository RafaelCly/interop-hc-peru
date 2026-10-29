// Los tres sistemas FHIR simulados. Se construyen una vez por instancia del servidor, de forma determinista.
// Solo los lee el servidor (portal y portada); no se exponen por HTTP.
import { construirDataset, type Clave } from "./data";

const dataset = construirDataset();

export const stores = dataset.stores;
export const PACIENTES = dataset.pacientes as {
  dni: string;
  nombre: string;
  sistemas: Clave[];
  consentimiento: boolean;
  titulo?: string;
  muestra?: string;
}[];
