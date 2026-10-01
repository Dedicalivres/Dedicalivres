import fs from "node:fs";
import path from "node:path";

const directory = "evenement";
const marker = '<script src="/tracking-v4.js?v=p1-static-1"></script>';
const scripts = `<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
<script src="/config.js?v=shared-client-1"></script>
${marker}`;
let updated = 0;

for (const name of fs.readdirSync(directory).filter((file) => file.endsWith(".html") && file !== "index.html")) {
  const file = path.join(directory, name);
  const html = fs.readFileSync(file, "utf8");
  if (html.includes(marker)) continue;
  if (!html.includes("</body>")) throw new Error(`Page événement sans </body> : ${file}`);
  fs.writeFileSync(file, html.replace("</body>", `${scripts}\n</body>`));
  updated += 1;
}

console.log(`PASS instrumentation événements statiques : ${updated} page(s) mise(s) à jour`);
