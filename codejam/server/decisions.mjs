const documentId = /^[\w-]{1,200}$/;
const newId = /^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i;
const linkKinds = new Set(['pr', 'issue', 'commit']);

function fail(status, message) {
 throw Object.assign(new Error(message), {status});
}

function requireId(value, pattern = documentId) {
 if (typeof value !== 'string' || !pattern.test(value)) { fail(400, 'Invalid decision or discussion ID.'); }
 return value;
}

function decisionText(body, requireRationale) {
 const title = typeof body.title === 'string' ? body.title.trim() : '';
 if (!title || title.length > 100) { fail(400, 'Enter a decision title of 1–100 characters.'); }
 if (typeof body.text !== 'string' || body.text.length > 12000) { fail(400, 'Use at most 12,000 characters for the rationale.'); }
 const text = body.text.trim();
 if (requireRationale && !text) { fail(400, 'Add the reason for this decision.'); }
 return {title, text};
}

function implementationUrl(value) {
 if (typeof value === 'string' && value.length <= 2048 && URL.canParse(value)) {
  const url = new URL(value);
  if (url.protocol === 'https:' && !url.username && !url.password) { return url.href; }
 }
 fail(400, 'Enter an HTTPS implementation link without embedded credentials.');
}

export function hasDecisionHistory(pin) {
 return pin.status === 'superseded' || Boolean(pin.replacesIds?.length);
}

// Invoked only after the room membership and session-scope checks.
export async function updateDecision({store, collection, mutate, user, body}) {
 const pins = collection('pins');
 const id = requireId(body.id);
 const now = new Date().toISOString();

 if (body.action === 'propose') {
  requireId(id, newId);
  const fields = decisionText(body, false);
  const discussionId = requireId(body.discussionId);
  const discussion = await store.get(collection('discussions'), discussionId);
  if (!discussion) { fail(404, 'Choose a discussion in this room.'); }
  const pin = await mutate(pins, id, existing => {
   if (existing) {
    const original = existing.originalProposal || existing;
    if (existing.pinnedById === user.id && existing.discussionId === discussionId && existing.proposedAt
      && original.title === fields.title && original.text === fields.text) { return existing; }
    fail(409, 'This proposal ID is already in use.');
   }
   return {id, ...fields, status:'proposed', discussionId, source:discussion.source, proposedAt:now,
    createdAt:now, pinnedBy:user.name, pinnedById:user.id};
  });
  return {pin};
 }

 if (body.action === 'replace') {
  const creating = body.newId !== undefined;
  const targetId = creating ? requireId(body.newId, newId) : requireId(body.replacementId);
  if (targetId === id) { fail(400, 'Choose a different replacement decision.'); }
  const [old, target] = await Promise.all([store.get(pins,id), store.get(pins,targetId)]);
  if (!old) { fail(404, 'Decision not found in this room.'); }
  if (old.replacedById === targetId && target) { return {pin:target}; }
  if ((old.status || 'accepted') !== 'accepted') { fail(409, 'Only a current accepted decision can be replaced.'); }
  let successor;
  if (creating) {
   if (target) { fail(409, 'The replacement ID is already in use.'); }
   successor = {id:targetId, ...decisionText(body,true), status:'accepted', source:old.source,
    discussionId:old.discussionId || '', createdAt:now, pinnedBy:user.name, pinnedById:user.id};
  } else {
   if (!target) { fail(404, 'Replacement decision not found in this room.'); }
   if ((target.status || 'accepted') !== 'accepted') { fail(409, 'Choose an accepted replacement decision.'); }
   successor = target;
  }
  successor = {...successor, replacesIds:[...(successor.replacesIds || []), id]};
  // Both endpoints of the history link must change together, including across backend instances.
  await store.putTogether(pins, [
   {value:{...old, status:'superseded', replacedById:targetId, supersededAt:now, supersededBy:user.name}, version:old._version},
   {value:successor, version:target?._version ?? null},
  ]);
  return {pin:successor};
 }

 if (!['accept','addLink','removeLink'].includes(body.action)) { fail(400, 'Unknown decision action.'); }
 const pin = await mutate(pins, id, current => {
  if (!current) { fail(404, 'Decision not found in this room.'); }
  if (body.action === 'accept') {
   const fields = decisionText(body, true);
   if (current.proposedAt && current.status === 'accepted' && current.title === fields.title && current.text === fields.text) { return current; }
   if (current.status !== 'proposed') { fail(409, 'This decision is no longer a proposal.'); }
   const changed = fields.title !== current.title || fields.text !== current.text;
   return {...current, ...fields, status:'accepted', acceptedAt:now, acceptedBy:user.name, acceptedById:user.id,
    ...(changed ? {originalProposal:{title:current.title, text:current.text}} : {})};
  }
  const url = implementationUrl(body.url);
  const links = current.implementationLinks || [];
  if (body.action === 'removeLink') { return {...current, implementationLinks:links.filter(link => link.url !== url)}; }
  if (!linkKinds.has(body.kind)) { fail(400, 'Choose pull request, issue, or commit.'); }
  const existing = links.find(link => link.url === url);
  if (existing?.kind === body.kind) { return current; }
  if (existing) { return {...current, implementationLinks:links.map(link => link.url === url ? {kind:body.kind, url} : link)}; }
  return {...current, implementationLinks:[...links, {kind:body.kind, url}]};
 });
 return {pin};
}
