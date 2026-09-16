const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const crypto = require('crypto');
const { validate } = require('./build_aqa_biology_map');
for (const test of ['test_aqa_biology.js','test_biology_lesson_flow.js']) execFileSync(process.execPath,[path.join(__dirname,test)],{stdio:'inherit'});
const target=path.join(__dirname,'../src/data/aqaBiologyHigher.json');
const map=JSON.parse(fs.readFileSync(target,'utf8'));
const structural=validate(map);
const byId=new Map(map.nodes.map(n=>[n.id,n]));
const sources=require('./aqa_biology_8461_sources.json');
const headings=[...new Set(sources.sources.flatMap(s=>[...s.text.matchAll(/^4\.\d+\.\d+(?:\.\d+)?(?= )/gm)].map(m=>m[0])))];
const leaves=headings.filter(h=>!headings.some(other=>other.startsWith(h+'.')));
const report={
  specification:'AQA 8461 separate Biology, GCSE Higher',sourceUrls:map.sourceUrls,revision:map.revision,
  nodes:map.nodes.length,edges:map.edges.length,roots:structural.roots,
  crossTopicEdges:map.edges.filter(e=>byId.get(e.from).theme!==byId.get(e.to).theme).length,
  sourceSectionsCovered:leaves,practicals:Array.from({length:10},(_,i)=>i+1),
  review:'Official-source review plus automated source-section coverage, DAG/topological order, atomic metadata, practical-layer and live-service integration checks. A bounded API audit was also reviewed; its closing prose summary was truncated, but all structured finding arrays were recovered.',
  auditDecisions:[
    'Applied the substantive missing WS/MS skills, subcellular estimation, gene-to-history link, artery-to-CHD link and stimulation-to-IVF-stress link.',
    'Narrowed broad source references and connected practical evaluations to their specific procedural steps.',
    'Rejected recommendations to merge independently testable microscope properties or complementary base-pair facts: the requested atomicity takes precedence.',
    'Rejected Foundation/Combined leakage findings: this map is ingested and served only as Biology / GCSE Higher / AQA (8461); it is never used for Foundation or Combined Science.',
    'Rejected a proposed environmental-distribution prerequisite for the definition of biodiversity: a specification cross-reference is not automatically a learning prerequisite.',
    'Did not add generic umbrella lessons for content already decomposed into atomic nodes.',
    'Completed additional manual splits for digestive-enzyme production sites, eye/seedling applications, nuclear control, stem-cell renewal and experimental steps.'
  ],
  limitations:'Structural coverage tests verify source-section representation, not an infallible guarantee of semantic completeness. Runtime recall validation checks explicit taught-point coverage; generated question quality still depends on the model following the scoped prompt.',
  budget:require('./aqa_biology_budget').load()
};
map.verified=true;
fs.writeFileSync(target,JSON.stringify(map,null,2));
report.sha256=crypto.createHash('sha256').update(fs.readFileSync(target)).digest('hex');
fs.writeFileSync(path.join(__dirname,'aqa_biology_build/release-review.json'),JSON.stringify(report,null,2));
console.log(`Release reviewed: ${map.revision}; ${map.nodes.length} nodes; ${map.edges.length} edges; ${report.crossTopicEdges} cross-topic edges; ${leaves.length} source subsections.`);
