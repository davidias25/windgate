const fs = require('fs');

async function main() {
  const res = await fetch('https://portalunico.siscomex.gov.br/ttce/main-INFJA4SZ.js');
  const t = await res.text();

  console.log(t.slice(396500, 398500));
}

main().catch(console.error);
