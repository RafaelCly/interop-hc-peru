const ts = require("typescript");
const fs = require("fs");
require.extensions[".ts"] = function (module, filename) {
  const source = fs.readFileSync(filename, "utf8");
  const js = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  module._compile(js, filename);
};
const assert = require("assert");
const { construirDataset, SISTEMAS, TIPOS } = require("./lib/data.ts");
const { SEDES_SJL } = require("./lib/establecimientos-sjl.ts");
const { EXAMENES } = require("./lib/catalogo-clinico.ts");
const { stores, pacientes } = construirDataset();
assert(pacientes.length === 24, "24 pacientes");
assert(SEDES_SJL.length >= 30, "directorio SJL");
assert(Object.keys(EXAMENES).length >= 20, "exámenes");
let total = 0,
  ex = 0;
for (const [clave, st] of Object.entries(stores)) {
  for (const [id, tipos] of st.recursos) {
    assert(tipos.Encounter.length, "cada paciente debe tener al menos una atención");
    total += tipos.Encounter.length;
    ex += tipos.Observation.length + tipos.DiagnosticReport.length;
    const encIds = new Set(tipos.Encounter.map((x) => x.id));
    for (const o of [...tipos.Observation, ...tipos.DiagnosticReport]) {
      assert(encIds.has(o.encounter.reference.split("/")[1]), "examen debe relacionarse a un encuentro");
      assert(o.performer[0].display.includes("simulad"), "fuente sintética");
      if (o.resourceType === "Observation") {
        assert(o.valueQuantity.system === "http://unitsofmeasure.org");
        assert(o.referenceRange?.[0]?.text);
      }
    }
    for (const med of tipos.MedicationStatement) {
      assert(encIds.has(med.context.reference.split("/")[1]), "medicación relacionada a atención");
    }
  }
}
assert(total > ex / 5, "registros");
console.log(
  `OK: ${pacientes.length} pacientes, ${SEDES_SJL.length} sedes referenciales, ${Object.keys(EXAMENES).length} exámenes, ${total} atenciones, ${ex} resultados.`,
);
