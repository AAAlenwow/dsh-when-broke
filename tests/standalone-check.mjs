// Standalone smoke: host contract works and registers exactly 4 uniquely-named tools.
import { apply, name } from "../lib/host.js";

const registered = [];
const ctx = { tools: { register: (t) => registered.push(t) }, logger: { info() {}, error(...a) { console.error(...a); } } };
await apply(ctx);

const EXPECTED = 4;
const names = registered.map((t) => t.name);
if (registered.length !== EXPECTED) {
  throw new Error(`${name}: expected ${EXPECTED} tools, got ${registered.length} (${names.join(", ")})`);
}
if (new Set(names).size !== names.length) {
  throw new Error(`${name}: duplicate tool names: ${names.join(", ")}`);
}
for (const t of registered) {
  if (typeof t.execute !== "function") throw new Error(`${name}: tool ${t.name} has no execute()`);
}
console.log(`standalone OK: ${name} → ${registered.length} tools (${names.join(", ")})`);
