import crypto from 'crypto';
const API_SECRET = process.env.CLOUDINARY_API_SECRET || 'k-Kh4Cxw32oLOIvjVcahvnGanx8';
const cloud_name = 'ecmpkma8';
const api_key = 'k-Kh4Cxw32oLOIvjVcahvnGanx8'.slice(0,0) || void 0;
// Nettoyer les 2 PDF de test uploadés
const t1 = Math.round(Date.now()/1000);
const sig1 = crypto.createHash('sha1').update(`public_id=edukaflow/pdfs/oexp2nyccbaoxpnos5ce&timestamp=${t1}${API_SECRET}`).digest('hex');
const c1 = await fetch(`https://api.cloudinary.com/v1_1/${cloud_name}/image/destroy`, { method:'POST', body: new URLSearchParams({ public_id:'edukaflow/pdfs/oexp2nyccbaoxpnos5ce', signature:sig1, api_key, timestamp:String(t1), resource_type:'image' }) }).then(r=>r.json());
console.log('destroy test image:', c1.result);
