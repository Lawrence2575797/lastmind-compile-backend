// Integration test with an in-memory database and API stub: no paid API calls
// and no student-account writes. Exercises actual generation/cache/note code.
require('dotenv').config({ override: true });
const assert = require('node:assert/strict');
const map = require('../src/data/aqaBiologyHigher.json');
const objective = map.nodes.find(n=>n.id==='osmosis');
const row = {id:'test-osmosis',node_key:objective.id,label:objective.label,subtopic:objective.subtopic,subject:'Biology',qualification:'GCSE Higher',exam_board:'AQA'};
const question = {questionText:'Define osmosis, including its direction and membrane requirement.',markScheme:'Require water moving from dilute to concentrated solution through a partially permeable membrane.',modality:'writing',answerInputType:'words',testedPointIds:['water','direction','membrane']};
const valid = {atomicConceptId:'osmosis',explanation:'Osmosis is the net movement of water from a dilute to a more concentrated solution through a partially permeable membrane.',taughtPoints:[{id:'water',text:'Water moves.'},{id:'direction',text:'Dilute to concentrated.'},{id:'membrane',text:'A partially permeable membrane is required.'}],practiceQuestion:question,recallChecks:Array.from({length:4},()=>({...question,format:'free_text'}))};
const tables = {knowledge_map_nodes:[row],knowledge_map_edges:[],knowledge_map_node_lessons:[],knowledge_map_node_notes:[],knowledge_map_node_note_edits:[]};
const writes = [], calls = [];
const db = require('../dist/services/supabaseAdmin').supabaseAdmin;
db.from = table => {
  assert.ok(Object.hasOwn(tables,table), 'Unexpected DB access: '+table);
  const filters = [];
  const query = {
    select(){return this;}, eq(k,v){filters.push(x=>x[k]===v);return this;}, in(k,vs){filters.push(x=>vs.includes(x[k]));return this;},
    maybeSingle(){return Promise.resolve({data:tables[table].filter(x=>filters.every(f=>f(x)))[0] || null,error:null});},
    upsert(value){writes.push(table);const key=table==='knowledge_map_node_lessons'||table==='knowledge_map_node_notes'?'node_id':'id';const i=tables[table].findIndex(x=>x[key]===value[key]);if(i<0)tables[table].push(value);else tables[table][i]=value;return Promise.resolve({error:null});},
    then(resolve,reject){return Promise.resolve({data:tables[table].filter(x=>filters.every(f=>f(x))),error:null}).then(resolve,reject);}
  }; return query;
};
let generated = valid;
require('../dist/services/claudeClient').callClaudeJSON = async args => {calls.push(args);return JSON.stringify(generated);};
const {generateAndCacheNodeLesson} = require('../dist/services/lessonGenerationService');
const {getNodeNoteForUser} = require('../dist/services/knowledgeMapNotesService');
async function main(){
  const result = await generateAndCacheNodeLesson(row.id,'test-user');
  assert.equal(result.atomicConceptId,'osmosis');
  assert.match(calls[0].systemPrompt,/Practical rule 17/);
  assert.match(calls[0].userContent,/aqa.org.uk/);
  assert.equal(tables.knowledge_map_node_lessons.length,1);
  const note = await getNodeNoteForUser(row.id,'test-user');
  assert.equal(note.heading,objective.label);
  assert.match(note.paragraphs.join(' '),/partially permeable/);
  const before=writes.length;
  generated={...valid,practiceQuestion:{...question,testedPointIds:['water']}};
  const oldError=console.error;
  try { console.error=()=>{}; await assert.rejects(()=>generateAndCacheNodeLesson(row.id,'test-user'),/omits a taught point/); }
  finally { console.error=oldError; }
  assert.equal(writes.length,before,'Invalid lesson must not replace cache or notes');
  assert.ok(writes.every(t=>t==='knowledge_map_node_lessons'||t==='knowledge_map_node_notes'));
  // Exercise the real untracked handler. It must use the stored mark scheme
  // and must not write any progress/scheduling rows.
  require('../dist/services/claudeClient').callClaudeJSON=async args=>{calls.push(args);return JSON.stringify({correct:true,feedback:'Correct.'});};
  const router=require('../dist/routes/knowledgeMap').default;
  const route=router.stack.find(s=>s.route?.path==='/knowledge-map-v2/node/:nodeId/untracked-submit').route;
  let response;
  const res={status(){return this;},json(value){response=value;return this;}};
  await route.stack[route.stack.length-1].handle({params:{nodeId:row.id},body:{answer:'Water moves from dilute to concentrated solution through a partially permeable membrane.'},userId:'test-user'},res);
  assert.equal(response.correct,true);
  assert.match(calls.at(-1).userContent,/Require water moving/);
  assert.equal(writes.length,before,'Untracked answers must not write progress');
  const cachedRoute=router.stack.find(s=>s.route?.path==='/knowledge-map-v2/node/:nodeId/lesson').route;
  const previousCalls=calls.length;
  await cachedRoute.stack[cachedRoute.stack.length-1].handle({params:{nodeId:row.id},userId:'test-user'},res);
  assert.equal(response.atomicConceptId,'osmosis');
  assert.equal(calls.length,previousCalls,'A cached feed/Untracked lesson must not cost another API call');
  const pagination=require('../dist/services/supabasePagination');
  pagination.selectAllRows=async table=>table==='concept_reviews'?[]:tables[table];
  pagination.selectRowsByIdChunked=async(table,columns,key,ids)=>tables[table].filter(r=>ids.includes(r[key]));
  require('../dist/services/folderSyncService').listUserFolders=async()=>[{data:{subject:'Biology',qualification:'GCSE Higher',examBoard:'AQA'}}];
  require('../dist/services/subjectResolution').resolveSubjectTriple=async(subject,qualification,examBoard)=>({subject,qualification,examBoard});
  const index=await require('../dist/services/knowledgeMapNotesService').getNotesIndexForUser('test-user');
  const noteEntry=index.subjects[0].themes.flatMap(t=>t.subtopics.flatMap(s=>s.nodes))[0];
  assert.equal(noteEntry.hasNotes,true,'Generated lesson must appear in subject notes');
  assert.equal(noteEntry.encoded,false,'Notes availability must not mark an Untracked lesson learned');
  assert.equal(calls.length,previousCalls,'Opening Biology notes must not call AI for ordering');
  console.log('PASS: live generation code validates complete recall, caches the lesson, produces its subject note, rejects incomplete checks, and grades Untracked using stored answers without progress writes.');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
