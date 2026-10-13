import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const base = resolve("artifacts/erp-rumahan-emak");
const src = readFileSync(resolve(base,"src/App.tsx"),"utf8");
const css = readFileSync(resolve(base,"src/index.css"),"utf8");
const file = resolve(base,"public/kasapink-login-illustration-earthtone.webp");
const issues=[];
if(!src.includes('src="/kasapink-login-illustration-earthtone.webp"')) issues.push("Login does not reference approved earth-tone illustration");
if(src.includes('src="/kasapink-login-illustration.png"')) issues.push("Legacy pink login illustration is still referenced");
if(!css.includes("Login art: edge-to-edge asset")) issues.push("Borderless responsive login art CSS not found");
let w=0,h=0;
try {
 const b=readFileSync(file);
 if(b.toString("ascii",0,4)!=="RIFF"||b.toString("ascii",8,12)!=="WEBP") throw Error("invalid WebP container");
 const kind=b.toString("ascii",12,16);
 if(kind==="VP8 ") {w=b.readUInt16LE(26)&0x3fff;h=b.readUInt16LE(28)&0x3fff;}
 else if(kind==="VP8L"){ const n=b.readUInt32LE(21);w=(n&0x3fff)+1;h=((n>>14)&0x3fff)+1; }
 else if(kind==="VP8X"){w=b.readUIntLE(24,3)+1;h=b.readUIntLE(27,3)+1;}
 else throw Error("unsupported WebP type "+kind);
 if(w!==1448||h!==1086) issues.push("Approved illustration expected 1448x1086; got "+w+"x"+h);
 if(b.length<20000) issues.push("Illustration unexpectedly small: "+b.length+" bytes");
}catch(e){issues.push("Unable to validate WebP: "+e.message);}
if(issues.length){ console.error("LOGIN QA FAILED\n- "+issues.join("\n- "));process.exitCode=1;}
else console.log("LOGIN QA PASSED: WebP "+w+"x"+h+", correct JSX reference, borderless CSS");
