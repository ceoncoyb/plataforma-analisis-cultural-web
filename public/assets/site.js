const toggle = document.querySelector("[data-menu-toggle]");
const menu = document.querySelector("[data-menu]");
toggle?.addEventListener("click", () => {
  const open = menu?.classList.toggle("is-open") ?? false;
  toggle.setAttribute("aria-expanded", String(open));
});

const form = document.querySelector("#sandbox-form");
if (form) {
  const storageKey = "cultural-analysis-sandbox-v1";
  const unitList = document.querySelector("#unit-list");
  const result = document.querySelector("#sandbox-result");
  let units = [];
  try {
    units = JSON.parse(localStorage.getItem(storageKey) || "[]");
    if (!Array.isArray(units)) units = [];
  } catch { units = []; }

  function renderUnits() {
    unitList.replaceChildren();
    if (units.length === 0) {
      const empty = document.createElement("p");
      empty.className = "field-note";
      empty.textContent = "Aún no hay unidades. Añade un nombre y un localizador para empezar.";
      unitList.append(empty);
    }
    units.forEach((unit, index) => {
      const row = document.createElement("div");
      row.className = "unit-item";
      const copy = document.createElement("div");
      const title = document.createElement("strong");
      title.textContent = unit.label;
      const locator = document.createElement("span");
      locator.textContent = unit.locator + " · " + unit.modality;
      copy.append(title, locator);
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "unit-remove";
      remove.textContent = "Quitar";
      remove.setAttribute("aria-label", "Quitar " + unit.label);
      remove.addEventListener("click", () => { units.splice(index, 1); persist(); renderUnits(); });
      row.append(copy, remove);
      unitList.append(row);
    });
    document.querySelector("#unit-count").textContent = String(units.length);
  }
  function persist() {
    try { localStorage.setItem(storageKey, JSON.stringify(units)); }
    catch { /* The current session remains usable when browser storage is disabled. */ }
  }
  renderUnits();

  document.querySelector("#add-unit").addEventListener("click", () => {
    const label = document.querySelector("#unit-label").value.trim();
    const locator = document.querySelector("#unit-locator").value.trim();
    const modality = document.querySelector("#unit-modality").value;
    if (!label || !locator) {
      result.hidden = false;
      result.querySelector("p").textContent = "Completa el nombre de la unidad y su localizador para añadirla.";
      return;
    }
    units.push({ id: "UNIT-" + crypto.randomUUID().slice(0, 8).toUpperCase(), label, locator, modality });
    persist(); renderUnits();
    document.querySelector("#unit-label").value = "";
    document.querySelector("#unit-locator").value = "";
    document.querySelector("#unit-label").focus();
  });

  document.querySelector("#build-brief").addEventListener("click", () => {
    const title = document.querySelector("#study-title").value.trim();
    const question = document.querySelector("#study-question").value.trim();
    const field = document.querySelector("#study-field").value;
    if (!title || !question) {
      result.hidden = false;
      result.querySelector("p").textContent = "Añade el nombre del estudio y su pregunta para generar la ficha.";
      return;
    }
    const brief = {
      format: "research-project-brief",
      format_version: 1,
      generated_at: new Date().toISOString(),
      project: { title, field, question, units },
      note: "Ficha de orientación exportada desde una demo local. No es un expediente compatible ni importa datos a la Plataforma.",
    };
    result.hidden = false;
    result.querySelector("p").textContent = units.length + " unidades declaradas. No genera interpretaciones: deja visibles el alcance y el material que tú definiste.";
    result.querySelector("pre").textContent = JSON.stringify(brief, null, 2);
    result.dataset.json = JSON.stringify(brief, null, 2);
    result.scrollIntoView({ behavior: "smooth", block: "nearest" });
  });

  document.querySelector("#download-brief").addEventListener("click", () => {
    if (!result.dataset.json) { document.querySelector("#build-brief").click(); }
    if (!result.dataset.json) return;
    const blob = new Blob([result.dataset.json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "ficha-de-estudio-demo.json";
    link.click();
    URL.revokeObjectURL(url);
  });
  document.querySelector("#clear-demo").addEventListener("click", () => {
    units = []; persist(); renderUnits();
    form.reset();
    result.hidden = true; result.removeAttribute("data-json");
    result.querySelector("pre").textContent = "";
  });
}
