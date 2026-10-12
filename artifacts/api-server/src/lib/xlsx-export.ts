import { deflateRawSync } from "node:zlib";
import type { ReportTable } from "./report-export";

/** True Office Open XML workbook, ZIP container; no third-party runtime dependency. */
function xml(value: string): string {
  return value.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&apos;").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g,"");
}
function columnName(n: number): string {
  let name="";
  for(let v=n+1;v>0;v=Math.floor((v-1)/26))name=String.fromCharCode(65+(v-1)%26)+name;
  return name;
}
function crc32(buffer: Buffer): number {
  let c=0xffffffff;
  for(const byte of buffer) {
    c^=byte;
    for(let i=0;i<8;i++)c=(c>>>1)^((c&1)?0xedb88320:0);
  }
  return (c^0xffffffff)>>>0;
}
function zip(entries: Array<[string,string]>): Buffer {
  const files:Buffer[]=[],central:Buffer[]=[];
  let offset=0;
  for(const [name,payload] of entries){
    const filename=Buffer.from(name,"utf8"),raw=Buffer.from(payload,"utf8"),data=deflateRawSync(raw);
    const crc=crc32(raw);
    const local=Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50,0);local.writeUInt16LE(20,4);local.writeUInt16LE(0x0800,6);
    local.writeUInt16LE(8,8);local.writeUInt32LE(crc,14);local.writeUInt32LE(data.length,18);
    local.writeUInt32LE(raw.length,22);local.writeUInt16LE(filename.length,26);
    files.push(local,filename,data);
    const cd=Buffer.alloc(46);
    cd.writeUInt32LE(0x02014b50,0);cd.writeUInt16LE(20,4);cd.writeUInt16LE(20,6);
    cd.writeUInt16LE(0x0800,8);cd.writeUInt16LE(8,10);cd.writeUInt32LE(crc,16);
    cd.writeUInt32LE(data.length,20);cd.writeUInt32LE(raw.length,24);
    cd.writeUInt16LE(filename.length,28);cd.writeUInt32LE(offset,42);
    central.push(cd,filename);
    offset+=local.length+filename.length+data.length;
  }
  const centralLength=central.reduce((n,b)=>n+b.length,0),end=Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50,0);
  end.writeUInt16LE(entries.length,8);end.writeUInt16LE(entries.length,10);
  end.writeUInt32LE(centralLength,12);end.writeUInt32LE(offset,16);
  return Buffer.concat([...files,...central,end]);
}
const stringCell=(ref:string,value:string,style=0): string =>
  '<c r="'+ref+'" t="inlineStr"'+(style?' s="'+style+'"':'')+'><is><t xml:space="preserve">'+xml(value)+'</t></is></c>';
const numberCell=(ref:string,value:number,style=0): string =>
  '<c r="'+ref+'"'+(style?' s="'+style+'"':'')+'><v>'+String(value)+'</v></c>';
export function toXlsx(table: ReportTable): Buffer {
  const numCols=table.columns.length, decimals=new Set((table.currencyColumns??table.decimalColumns??[]).map(c=>table.columns.indexOf(c)));
  const maxColumn=Math.max(1,numCols),lastCol=columnName(maxColumn-1);
  const rows:string[]=[];
  const addRow=(num:number,cells:string[])=>rows.push('<row r="'+num+'">'+cells.join("")+'</row>');
  addRow(1,[stringCell("A1","KASAPINK — "+table.title,1)]);
  addRow(2,[stringCell("A2",table.subtitle??"Laporan Kasapink ERP",2)]);
  let index=3;
  if(table.summary?.length){
    for(const summary of table.summary){addRow(index,[stringCell('A'+index,summary.label,2),stringCell('B'+index,summary.value,1)]);index++;}
  }
  if(table.note){addRow(index,[stringCell('A'+index,table.note,2)]);index++;}
  index++;
  const headerRow=index++;
  addRow(headerRow,table.columns.map((name,i)=>stringCell(columnName(i)+headerRow,name,3)));
  for(const values of table.rows){
    const line=index++;
    addRow(line,table.columns.map((_,i)=>{
      const value=values[i]??"";
      return typeof value==="number"&&Number.isFinite(value)
       ?numberCell(columnName(i)+line,value,decimals.has(i)?4:5)
       :stringCell(columnName(i)+line,String(value),line%2===0?6:0);
    }));
  }
  const endRow=Math.max(headerRow,index-1);
  const widths=table.columnWeights?.length===numCols?table.columnWeights:table.columns.map(n=>/Nama|Item|Keterangan|Validasi/i.test(n)?1.7:1);
  const cols='<cols>'+widths.map((w,i)=>'<col min="'+(i+1)+'" max="'+(i+1)+'" width="'+Math.min(48,Math.max(12,15*w))+'" customWidth="1"/>').join("")+'</cols>';
  const sheet='<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'+
   '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'+
   '<sheetViews><sheetView workbookViewId="0"><pane ySplit="'+headerRow+'" topLeftCell="A'+(headerRow+1)+'" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>'+
   '<sheetFormatPr defaultRowHeight="18"/>'+cols+'<sheetData>'+rows.join("")+'</sheetData>'+
   '<autoFilter ref="A'+headerRow+':'+lastCol+endRow+'"/>'+
   '<pageMargins left="0.3" right="0.3" top="0.4" bottom="0.4" header="0.2" footer="0.2"/>'+
   '</worksheet>';
  const styles='<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'+
  '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'+
  '<numFmts count="1"><numFmt numFmtId="164" formatCode="#,##0.00"/></numFmts>'+
  '<fonts count="3"><font><sz val="11"/><name val="Aptos"/><color rgb="FF40372B"/></font><font><b/><sz val="12"/><color rgb="FFFFFFFF"/></font><font><b/><sz val="11"/><color rgb="FF40372B"/></font></fonts>'+
  '<fills count="4"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF8A7650"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFECE7D1"/></patternFill></fill></fills>'+
  '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>'+
  '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'+
  '<cellXfs count="7"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/><xf numFmtId="0" fontId="0" fillId="3" borderId="0" xfId="0" applyFill="1"/><xf numFmtId="0" fontId="2" fillId="3" borderId="0" xfId="0" applyFill="1"/><xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="0" fillId="3" borderId="0" xfId="0" applyFill="1"/></cellXfs></styleSheet>';
  return zip([
    ["[Content_Types].xml",'<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>'],
    ["_rels/.rels",'<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'],
    ["xl/workbook.xml",'<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Laporan Kasapink" sheetId="1" r:id="rId1"/></sheets></workbook>'],
    ["xl/_rels/workbook.xml.rels",'<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>'],
    ["xl/styles.xml",styles],["xl/worksheets/sheet1.xml",sheet]
  ]);
}
