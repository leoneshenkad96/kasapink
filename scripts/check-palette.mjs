import {readFile} from "node:fs/promises";
const css=await readFile(new URL("../artifacts/erp-rumahan-emak/src/index.css",import.meta.url),"utf8");const app=await readFile(new URL("../artifacts/erp-rumahan-emak/src/App.tsx",import.meta.url),"utf8");
for(const color of ["#8A7650","#8E977D","#ECE7D1","#DBCEA5","#40372B","#655942"])if(!css.includes(color))throw Error("Missing earth tone "+color);
for(const color of ["#f2bfd2","#fdcee0","#f8e7ed","#f9f5f6","#613248"])if(css.toLowerCase().includes(color))throw Error("Legacy blush "+color);
if(app.includes("ShoppingBasket")||app.includes("/kasapink-logo-web.png"))throw Error("Legacy icon/logo reference");
console.log("Kasapink earth tone palette audit passed.");
