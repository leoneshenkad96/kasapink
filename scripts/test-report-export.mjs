import assert from "node:assert/strict";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
const require=createRequire(import.meta.url);
execFileSync("pnpm",["exec","esbuild","artifacts/api-server/src/lib/report-export.ts","--bundle","--platform=node","--format=cjs","--outfile=/tmp/kasapink-report-export.cjs"],{stdio:"inherit"});
const {toPdf}=require("/tmp/kasapink-report-export.cjs");
const cases=[
 {id:"finance",orientation:"portrait",columns:["Tanggal","Penjualan","HPP","Belanja","Laba kotor"],decimalColumns:["Penjualan","HPP","Belanja","Laba kotor"],summary:[{label:"Penjualan",value:"Rp 325.000,00"},{label:"HPP",value:"Rp 155.000,00"},{label:"Belanja",value:"Rp 80.000,00"},{label:"Laba kotor",value:"Rp 170.000,00"}],note:"Laba kotor tidak termasuk biaya operasional.",rows:Array.from({length:45},(_,i)=>["2026-10-01",120000+i,40000+i,25000,80000])},
 {id:"stock",orientation:"landscape",columns:["Jenis","Nama","Kategori","Lini","Unit","Stok","Minimum","HPP/unit","Nilai stok"],decimalColumns:["HPP/unit","Nilai stok"],columnWeights:[.9,1.8,1.2,.95,.6,.7,.7,1.15,1.25],note:"Posisi stok saat laporan dibuat.",rows:Array.from({length:85},(_,i)=>[i%2?"Preparation":"Bahan",i%2?"Nasi Liwet":"Bawang Putih","Makanan","Makanan","kg",8.7,2,3130.43,27234.74])},
 {id:"transactions",orientation:"landscape",columns:["Tanggal","Jenis","Ref","Item/Kategori","Qty","Nilai","HPP/Biaya","Keterangan"],decimalColumns:["Nilai","HPP/Biaya"],columnWeights:[1,1.15,.48,1.8,.65,1.1,1.15,1.65],note:"Belanja, penjualan, waste dan koreksi stok.",rows:Array.from({length:110},(_,i)=>["2026-10-01",["Penjualan","Waste","Biaya operasional","Koreksi prep"][i%4],i+1,"Bahan Bawang Putih",1,12000,8000,"Pengujian laporan huruf é – œ"])}
];
await mkdir("/tmp/kasapink-report-qa",{recursive:true});
for(const c of cases){
 const pdf=toPdf({...c,title:"Kasapink "+c.id,subtitle:"Periode 2026-10-01 sampai 2026-10-31 (WIB)"});
 assert.equal(pdf.toString("ascii",0,5),"%PDF-");
 const text=pdf.toString("latin1");
 assert.match(text,/\/Type \/Page/);
 assert.match(text,/\(KASAPINK  \/  CATATAN USAHA\)/,"Brand header must be rendered");
 assert.match(text,/\b100\s+\d+\s+Td \(KASAPINK  \/  CATATAN USAHA\)/,"Brand text must start at x=100pt next to left logo");
 assert.match(text,c.orientation==="landscape"?/\/MediaBox \[0 0 842 595\]/:/\/MediaBox \[0 0 595 842\]/);
 assert.match(text,/Dihasilkan|Laporan dibuat otomatis/);
 assert.ok((text.match(/\/Type \/Page /g)||[]).length>=2,"multiple pages expected");
 await writeFile("/tmp/kasapink-report-qa/"+c.id+".pdf",pdf);
 console.log(c.id,pdf.length,"bytes", (text.match(/\/Type \/Page /g)||[]).length,"pages");
}
