import assert from 'node:assert/strict';
import fs from 'node:fs';
import {publishedDuplicateGroups} from './territorial-quality.mjs';

const base={id:'kept',title:'Salon du Livre',city:'Saint-Malo',country_code:'FR',start_date:'2026-10-10',end_date:'2026-10-11',type:'salon',image_url:'https://r2.example/event-images/kept.webp',validated:true,rejected:false,created_at:'2026-09-01T10:00:00Z'};
const duplicate={...base,id:'removed',title:'SALON DU LIVRE',city:'Saint Malo',image_url:'https://r2.example/event-images/removed.webp'};
const otherDate={...base,id:'other-date',start_date:'2026-10-12',end_date:'2026-10-13'};
const pending={...base,id:'pending',validated:false};
const rejected={...base,id:'rejected',rejected:true};
const unrelated={...base,id:'unrelated',title:'Rencontre avec une autrice'};

const groups=publishedDuplicateGroups([base,duplicate,otherDate,pending,rejected,unrelated]);
assert.equal(groups.length,1,'Deux fiches publiées identiques doivent être signalées');
assert.deepEqual(groups[0].map(event=>event.id),['kept','removed']);
assert.ok(!groups.flat().some(event=>event.id==='other-date'),'Une autre date ne doit pas être regroupée');
assert.ok(!groups.flat().some(event=>event.id==='pending'),'Une fiche non publiée ne doit pas entrer dans ce cas ciblé');

const panel=fs.readFileSync('admin-territorial-quality.js','utf8');
const deletion=fs.readFileSync('admin-event-deletion.js','utf8');
const shell=fs.readFileSync('admin-shell.js','utf8');
const html=fs.readFileSync('admin-v11.html','utf8');
assert.match(panel,/Doublon potentiel · décision humaine requise/);
for(const label of ['Titre','Ville / pays','Dates','Type','Statut','Création','ID'])assert.ok(panel.includes(label),`Comparaison manquante : ${label}`);
assert.ok(panel.includes('e.image_url'),'La comparaison doit montrer l’image existante');
assert.ok(panel.includes('data-event-detail'),'La sélection doit ouvrir exactement la fiche choisie');
assert.ok(panel.includes('Aucune suppression automatique'));
assert.ok(!panel.includes('.delete('),'Le signalement ne doit jamais lancer une suppression');
assert.ok(deletion.includes('.from("events")')&&deletion.includes('.eq("id", normalizedId)'),'La suppression reste limitée à l’ID sélectionné');
assert.ok(deletion.includes('event_authors_presence')&&deletion.includes('effect: "block"'),'Les présences auteurs doivent bloquer la suppression');
assert.ok(!deletion.includes('storage.from')&&!deletion.includes('image_url'),'La suppression ne doit jamais effacer une image R2');
assert.ok(html.includes('Un précontrôle des relations et deux confirmations sont requis.'));
assert.ok(html.includes('id="v11-event-delete-confirmation"'));
assert.ok(shell.includes('String(item.id) !== String(event.id)'),'Seule la fiche supprimée doit disparaître de la liste locale');
assert.ok(shell.includes('await context.refresh()'),'Le catalogue doit être relu après suppression');

console.log('ADMIN_EVENT_DUPLICATES_OK');
