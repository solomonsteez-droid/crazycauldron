import fs from "node:fs";
import { PNG } from "pngjs";
const [, , src, out, c0, r0, c1, r1] = process.argv;
const COLS = 42, ROWS = 24, SCALE = 44;
const img = PNG.sync.read(fs.readFileSync(src));
const cw = img.width / COLS, ch = img.height / ROWS;
const x0 = Math.floor(c0 * cw), y0 = Math.floor(r0 * ch);
const x1 = Math.floor(c1 * cw), y1 = Math.floor(r1 * ch);
const w = (c1 - c0) * SCALE, h = (r1 - r0) * SCALE;
const dst = new PNG({ width: w, height: h });
for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
  const sx = Math.min(img.width - 1, x0 + Math.floor((x / w) * (x1 - x0)));
  const sy = Math.min(img.height - 1, y0 + Math.floor((y / h) * (y1 - y0)));
  const si = (sy * img.width + sx) * 4, di = (y * w + x) * 4;
  dst.data[di] = img.data[si]; dst.data[di+1] = img.data[si+1];
  dst.data[di+2] = img.data[si+2]; dst.data[di+3] = 255;
}
const line = (x, y, r, g, b) => { if (x<0||y<0||x>=w||y>=h) return; const i=(y*w+x)*4; dst.data[i]=r; dst.data[i+1]=g; dst.data[i+2]=b; };
for (let c = 0; c <= c1 - c0; c++) for (let y = 0; y < h; y++) line(c * SCALE, y, 255, 60, 60);
for (let r = 0; r <= r1 - r0; r++) for (let x = 0; x < w; x++) line(x, r * SCALE, 255, 60, 60);
const G = {0:["111","101","101","101","111"],1:["010","110","010","010","111"],2:["111","001","111","100","111"],3:["111","001","111","001","111"],4:["101","101","111","001","001"],5:["111","100","111","001","111"],6:["111","100","111","101","111"],7:["111","001","010","010","010"],8:["111","101","111","101","111"],9:["111","101","111","001","111"]};
const stamp=(t,ax,ay)=>{let cx=ax;for(const ch2 of t){const g=G[ch2];if(!g)continue;for(let gy=0;gy<5;gy++)for(let gx=0;gx<3;gx++){if(g[gy][gx]!=="1")continue;for(let py=0;py<2;py++)for(let px=0;px<2;px++)line(cx+gx*2+px,ay+gy*2+py,255,255,0);}cx+=8;}};
for (let c = 0; c < c1 - c0; c++) stamp(String(Number(c0) + c), c * SCALE + 3, 3);
for (let r = 0; r < r1 - r0; r++) stamp(String(Number(r0) + r), 3, r * SCALE + 14);
fs.writeFileSync(out, PNG.sync.write(dst));
console.log(out, `${w}x${h} cells ${c0}-${c1} x ${r0}-${r1}`);
