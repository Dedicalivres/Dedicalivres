// Pure isolated prototype. No authentication, media verification, storage or writes.
// Server adapters MUST supply trusted state, identity, permissions and verified metadata.
export const MAX_BYTES=10000000, MAX_SECONDS=120;
const id=v=>typeof v==="string"&&/^[a-zA-Z0-9_-]{1,80}$/.test(v);
const text=v=>typeof v==="string"?v.trim():"";
const safe=v=>v.replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
export function checkAudioMetadata(m){
 return !!m&&m.mediaVerified===true&&["audio/mpeg","audio/mp4"].includes(m.mime)&&
 Number.isSafeInteger(m.bytes)&&m.bytes>0&&m.bytes<=MAX_BYTES&&
 Number.isFinite(m.seconds)&&m.seconds>0&&m.seconds<=MAX_SECONDS&&
 /^[a-f0-9]{64}$/.test(m.sha256||"")&&text(m.transcript).length>0&&text(m.transcript).length<=6000;
}
export function publicAudioHtml(author,record,{enabled=false}={}){
 // Only called with server-projected public records; never raw submissions.
 if(enabled!==true||author?.validated!==true||author.published!==true||author.merged_into||
 !id(author.id)||record?.authorId!==author.id||!id(record.id)||record.status!=="published"||
 record.consentActive!==true||record.humanApproved!==true||!checkAudioMetadata(record))return "";
 const seconds=Math.ceil(record.seconds),duration=Math.floor(seconds/60)+":"+String(seconds%60).padStart(2,"0");
 // Same-origin revocable endpoint, never a direct R2 or caller-supplied URL.
 const src="/media/author-audio/"+encodeURIComponent(author.id)+"/"+encodeURIComponent(record.id);
 return '<section class="author-audio" aria-label="Présentation audio"><h2>Écouter ma présentation</h2><p>'+duration+'</p><audio controls preload="none" aria-label="Présentation audio de l’auteur"><source src="'+src+'" type="'+record.mime+'"></audio><details><summary>Lire la transcription</summary><p>'+safe(text(record.transcript))+'</p></details></section>';
}
// Plan only, NOT a persisted decision. Authentication and ownership must be verified server-side.
// Separate approval and publication; withdrawal must revoke access immediately.
export function planAudioAction({state,actor,action,targetId,expectedRevision,reason,consent=false}={}){
 const fail=code=>({ok:false,code,publicationAllowed:false});
 if(!state||!Number.isSafeInteger(state.revision)||state.revision!==expectedRevision||!id(state.authorId))return fail("stale_or_invalid");
 if(!actor?.authenticated||!id(actor.id)||!id(targetId))return fail("unauthorized");
 const admin=actor.role==="admin", owner=actor.role==="author"&&actor.authorId===state.authorId;
 if(!admin&&!owner)return fail("unauthorized");
 const record=state.records?.find(r=>r.id===targetId&&r.authorId===state.authorId);
 if(!record)return fail("missing");
 const note=text(reason);if(note.length>1000)return fail("reason_too_long");
 let next,active=state.activeId??null;
 if(action==="submit"&&owner&&record.status==="draft"&&consent===true&&checkAudioMetadata(record)){next="pending";}
 else if(action==="approve"&&admin&&record.status==="pending"&&record.consentActive===true&&checkAudioMetadata(record)&&note){next="approved";}
 else if(action==="request_information"&&admin&&record.status==="pending"&&note){next="needs_information";}
 else if(action==="reject"&&admin&&record.status==="pending"&&note){next="rejected";}
 else if(action==="publish"&&admin&&record.status==="approved"&&record.consentActive===true&&record.humanApproved===true&&checkAudioMetadata(record)&&note){next="published";active=record.id;}
 else if(action==="withdraw"&&(admin||owner)&&["pending","approved","published","needs_information","draft"].includes(record.status)&&note){next="withdrawn";if(active===record.id)active=null;}
 else return fail("transition_denied");
 return {ok:true,status:"plan_only",action,targetId,expectedRevision,nextStatus:next,nextActiveId:active,previousActiveId:state.activeId??null,publicationAllowed:false};
}
