const fs=require('fs');
const stems=(s)=>String(s).toLowerCase().replace(/[^a-z ]+/g,' ').split(/\s+/).filter(w=>w.length>2&&!['the','and','for','from','with','are','its','that'].includes(w)).map(w=>w.slice(0,6));
const norm=(s)=>' '+String(s).toLowerCase().replace(/[^a-z0-9]+/g,' ').trim()+' ';
const ids=process.argv.slice(2);
ids.forEach(id=>{const spec=JSON.parse(fs.readFileSync('out3/'+id+'.json','utf8'));const st=spec.stages[0];const all=st.steps.filter(s=>s.type==='ask'||s.type==='read');
console.log('\n=== '+id,st.name,'| given',(st.given||[]).join(','));
st.steps.forEach((s,i)=>{ if(s.type!=='ask') return; const later=all.slice(all.indexOf(s)).map(x=>x.term);
 let bad=false; later.forEach(t=>{const lab=(spec.terms[t]||{}).label||'';const ls=stems(lab);['right','wrong'].forEach(k=>{const os=stems(s[k]); if(ls.length&&os.length<=ls.length+2&&ls.every(w=>os.includes(w))) bad=true;}); if(lab.length>=5) ['q','right','wrong','hint'].forEach(k=>{if(norm(s[k]).includes(norm(lab))) bad=true;});});
 if(bad) console.log(`#${i+1} term=${s.term}[${spec.terms[s.term].label}]\n  q: ${s.q}\n  +: ${s.right}\n  -: ${s.wrong}\n  hint: ${s.hint}\n  pre: ${s.pre}`);});});
