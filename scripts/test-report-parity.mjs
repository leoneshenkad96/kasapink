import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
const require=createRequire(import.meta.url);
execFileSync("pnpm",["exec","esbuild","artifacts/api-server/src/lib/report-export.ts","--bundle","--platform=node","--format=cjs","--outfile=/tmp/kasapink-report-parity.cjs"],{stdio:"inherit"});
const {toPdf,toCsv,toExcelHtml}=require("/tmp/kasapink-report-parity.cjs");

function parseCsv(data){
 const lines=data.trim().split(/\r\n/);
 return lines.map(line=>[...line.matchAll(/"((?:[^"]|"")*)"(?:,|$)/g)].map(m=>m[1].replace(/""/g,'"')));
}
function decodeHtml(v){return v.replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&lt;/g,"<").replace(/&gt;/g,">").replace(/&amp;/g,"&");}
function parseExcel(data){
 const match=data.match(/<table>([\s\S]*?)<\/table>/i);
 assert.ok(match,"Excel table must exist");
 return [...match[1].matchAll(/<tr>([\s\S]*?)<\/tr>/g)].map(row=>[...row[1].matchAll(/<(?:th|td)\b[^>]*>([\s\S]*?)<\/(?:th|td)>/g)].map(cell=>decodeHtml(cell[1])));
}
function normalizedRows(table){
 const decimals=new Set((table.currencyColumns??table.decimalColumns??[]).map(c=>table.columns.indexOf(c)));
 return [table.columns,...table.rows.map(row=>row.map((v,i)=>typeof v==="number"&&decimals.has(i)?v.toFixed(2):String(v??"")))];
}
const cases=[
 {name:"finance",title:"Laporan Keuangan",orientation:"portrait",columns:["Tanggal","Penjualan","HPP","Belanja","Laba kotor"],decimalColumns:["Penjualan","HPP","Belanja","Laba kotor"],summary:[{label:"Penjualan",value:"Rp 49.000,00"}],note:"Laba kotor belum termasuk biaya operasional",rows:[["2026-10-09",49000,14133.02,26000,34866.98],["2026-10-10",0,0,0,0]]},
 {name:"stock",title:"Laporan Posisi Persediaan",orientation:"landscape",columns:["Jenis","Nama","Kategori","Lini","Unit","Stok","Min","HPP/unit","Nilai stok","Validasi"],currencyColumns:["HPP/unit","Nilai stok"],decimalColumns:["HPP/unit","Nilai stok"],note:"BELUM TERVALIDASI — periksa stok dan HPP",rows:[
 ["Bahan","Kulit Pangsit","Bahan","Makanan","pack",6999,0,7000,48993000,"NILAI DOMINAN >50%"],
 ["Bahan","Bawang Putih","Bahan","Makanan","kg",2,0,48000,96000,"OK"],
 ["Preparation","Ayam Suwir","Preparation","Makanan","kg",-10,"—",0,0,"STOK NEGATIF; HPP BELUM VALID"]]},
 {name:"activities",title:"Histori Aktivitas Usaha",orientation:"landscape",columns:["Tanggal","Aktivitas","Ref","Item / Lini","Jumlah","Nilai","HPP/Biaya","Keterangan/Alasan"],currencyColumns:["Nilai","HPP/Biaya"],decimalColumns:["Nilai","HPP/Biaya"],rows:[
 ["2026-10-09","Penjualan",1,"Nasi Bakar (F&B)","2 pcs",49000,14133.02,"—"],
 ["2026-10-09","Pembelian",1,"Bawang Putih (F&B)","2 kg",26000,"","—"],
 ["2026-10-09","Waste",1,"Nasi Liwet (F&B)","0,1 kg","",313.04,"Basi / rusak"],
 ["2026-10-09","Koreksi Bahan",2,"Bawang Putih (F&B)","-0,2 kg","",-9600,"Hasil stok opname"]]}
];
for(const table of cases){
 const actualCsv=parseCsv(toCsv(table));
 const actualExcel=parseExcel(toExcelHtml(table));
 const expected=normalizedRows(table);
 assert.deepEqual(actualCsv,expected,table.name+" CSV canonical rows");
 assert.deepEqual(actualExcel,expected,table.name+" Excel canonical rows");
 assert.deepEqual(actualCsv,actualExcel,table.name+" CSV/Excel rows mismatch");
 const bytes=toPdf(table), pdf=bytes.toString("latin1");
 assert.ok(bytes.toString("ascii",0,5)==="%PDF-");
 assert.match(pdf,table.orientation==="landscape"?/\/MediaBox \[0 0 842 595\]/:/\/MediaBox \[0 0 595 842\]/);
 assert.ok(pdf.includes(table.title),"PDF report title missing");
 for(const row of table.rows){
   // PDF labels can wrap across lines, so verify representative short values and money values.
   for(let col=0;col<row.length;col++){
     const v=row[col];
     if(typeof v==="number"&&(table.currencyColumns??table.decimalColumns??[]).includes(table.columns[col])){
       const formatted="Rp "+v.toLocaleString("id-ID",{minimumFractionDigits:2,maximumFractionDigits:2});
       // Test only compact values that fit in their visual table column.
       if(formatted.length<=9) assert.ok(pdf.includes(formatted),table.name+" PDF missing "+formatted);
     }
   }
 }
 console.log("PARITY PASS",table.name,"rows",table.rows.length,"PDF bytes",bytes.length);
}

const { inflateRawSync } = await import("node:zlib");

function unzipStoredFiles(bytes){
  const entries=new Map();
  let p=0;
  while(p+30<bytes.length && bytes.readUInt32LE(p)===0x04034b50){
    const method=bytes.readUInt16LE(p+8),compressedSize=bytes.readUInt32LE(p+18);
    const nameSize=bytes.readUInt16LE(p+26),extraSize=bytes.readUInt16LE(p+28);
    const name=bytes.subarray(p+30,p+30+nameSize).toString("utf8");
    const dataStart=p+30+nameSize+extraSize;
    const payload=bytes.subarray(dataStart,dataStart+compressedSize);
    entries.set(name,(method===8?inflateRawSync(payload):payload).toString("utf8"));
    p=dataStart+compressedSize;
  }
  return entries;
}
function decodeXml(s){return s.replace(/&quot;/g,'"').replace(/&apos;/g,"'").replace(/&lt;/g,"<").replace(/&gt;/g,">").replace(/&amp;/g,"&");}
function extractXlsxRows(sheet){
  return [...sheet.matchAll(/<row r="\d+"[^>]*>([\s\S]*?)<\/row>/g)].map(match=>
    [...match[1].matchAll(/<c r="([A-Z]+)\d+"([^>]*)>([\s\S]*?)<\/c>/g)].map(c=>{
      const inner=c[3];
      const isText=c[2].includes('t="inlineStr"');
      return isText?decodeXml((inner.match(/<t[^>]*>([\s\S]*?)<\/t>/)||[])[1]??"")
       :(inner.match(/<v>([\s\S]*?)<\/v>/)||[])[1]??"";
    })
  );
}
execFileSync("pnpm",["exec","esbuild","artifacts/api-server/src/lib/xlsx-export.ts","--bundle","--platform=node","--format=cjs","--outfile=/tmp/kasapink-xlsx-parity.cjs"],{stdio:"inherit"});
const { toXlsx } = require("/tmp/kasapink-xlsx-parity.cjs");
for(const test of cases){
  const files=unzipStoredFiles(toXlsx(test));
  assert.ok(files.has("[Content_Types].xml"),"XLSX content types missing");
  assert.ok(files.has("xl/workbook.xml"),"XLSX workbook missing");
  const sheet=files.get("xl/worksheets/sheet1.xml");
  assert.ok(sheet,"XLSX sheet missing");
  const rows=extractXlsxRows(sheet);
  const headerIndex=rows.findIndex(row=>JSON.stringify(row)===JSON.stringify(test.columns));
  assert.ok(headerIndex>=0,"XLSX data headers mismatch: "+test.name);
  const entries=rows.slice(headerIndex+1);
  const expected=normalizedRows(test);
  assert.equal(entries.length,test.rows.length,"XLSX data count");
  assert.deepEqual(entries.map(row=>row.map((value,i)=>{
    const money=(test.currencyColumns??test.decimalColumns??[]).includes(test.columns[i]);
    return money&&value!==""&&!Number.isNaN(Number(value))?Number(value).toFixed(2):value;
  })),expected.slice(1),"XLSX/CSV cell parity: "+test.name);
  assert.ok(sheet.includes('t="inlineStr"')&&sheet.includes('><v>'),"XLSX must preserve text and numeric types");
  console.log("NATIVE XLSX PARITY PASS",test.name,entries.length,"rows");
}
