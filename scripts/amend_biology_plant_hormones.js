// Scope-limited, idempotent correction: plant signalling must not require blood.
require('dotenv').config({override:true});
const {createClient}=require('@supabase/supabase-js');
const map=require('../src/data/aqaBiologyHigher.json');
const db=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY);
const clean=s=>s.trim().toLowerCase().replace(/[^a-z0-9]+/g,'_');
const scope=q=>q.eq('subject','Biology').eq('qualification','GCSE Higher').eq('exam_board','AQA');
async function main(){
  const n=map.nodes.find(n=>n.id==='plant_hormone');
  if(!n||!map.verified)throw new Error('Reviewed correction missing');
  const {error}=await db.from('knowledge_map_nodes').upsert({subject:'Biology',qualification:'GCSE Higher',exam_board:'AQA',node_key:n.id,label:n.label,subtopic:n.subtopic,theme:n.theme,difficulty:n.difficulty,concept_id:`biology:${clean(n.subtopic)}:${clean(n.label)}`},{onConflict:'subject,qualification,exam_board,node_key'});
  if(error)throw error;
  const keys=['plant_hormone','hormone','organism','reaction','auxin','gibberellin','ethene_ripen','ethene_divide'];
  const result=await scope(db.from('knowledge_map_nodes').select('id,node_key')).in('node_key',keys);
  if(result.error)throw result.error;
  if(result.data.length!==keys.length)throw new Error('Missing scoped endpoints');
  const ids=new Map(result.data.map(r=>[r.node_key,r.id]));
  const add=map.edges.filter(e=>e.from==='plant_hormone'||e.to==='plant_hormone');
  const inserted=await db.from('knowledge_map_edges').upsert(add.map(e=>({from_node_id:ids.get(e.from),to_node_id:ids.get(e.to),difficulty:e.difficulty})),{onConflict:'from_node_id,to_node_id'});
  if(inserted.error)throw inserted.error;
  const removed=await db.from('knowledge_map_edges').delete().eq('from_node_id',ids.get('hormone')).in('to_node_id',['auxin','gibberellin','ethene_ripen','ethene_divide'].map(k=>ids.get(k)));
  if(removed.error)throw removed.error;
  console.log('Plant-signalling foundation and four prerequisites corrected; no student progress modified.');
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
