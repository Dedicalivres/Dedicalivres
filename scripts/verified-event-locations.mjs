import fs from 'node:fs';
const data=JSON.parse(fs.readFileSync(new URL('./event-publisher/verified-event-locations.json',import.meta.url),'utf8'));
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
export function verifiedLocation(eventId,old,fresh) {
  const p=data.events[eventId];
  const jobs=JSON.parse(process.env.PUBLICATION_JOBS||'[]');
  if(!p||!jobs.some(j=>j.id===p.job_id&&j.event_id===eventId&&j.reason===p.reason))return null;
  const address=fresh.location?.address||{};
  if(fresh.startDate!==p.date||fresh.endDate!==p.date||address.addressLocality!==p.city
      ||address.addressRegion!==p.region||address.addressCountry!==({France:'FR',Belgique:'BE'})[p.country]
      ||fresh.location?.name!==p.place||address.streetAddress!==p.street||address.postalCode!==p.postal
      ||(p.canonical&&(old.url!=='https://dedicalivres.fr/'+p.canonical||fresh.url!==old.url)))return null;
  return p;
}
export function authorizedOrganizerOmission(eventId,old,fresh) {
  const p=verifiedLocation(eventId,old,fresh);
  return Boolean(p?.unverified_organizer&&same(old.organizer,p.unverified_organizer)&&fresh.organizer===undefined);
}
