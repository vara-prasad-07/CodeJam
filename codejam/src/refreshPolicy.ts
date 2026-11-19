// Chat delivery stays on Nexconn's WebSocket. Only repository/room metadata polls.
export class RefreshPolicy {
 private roomsAt = 0;
 private detailsAt = new Map<string, number>();
 private presenceAt = new Map<string, number>();
 private retryAt = 0;
 private failures = 0;

 constructor(private readonly now = Date.now) {}

 get canPoll() { return this.now() >= this.retryAt; }
 get roomsDue() { return this.now() >= this.roomsAt; }
 detailsDue(roomId: string) { return this.now() >= (this.detailsAt.get(roomId) ?? 0); }
 presenceDue(roomId: string) { return this.now() >= (this.presenceAt.get(roomId) ?? 0); }

 roomsLoaded() { this.roomsAt = this.now() + 60000; }
 detailsLoaded(roomId: string) { this.detailsAt.set(roomId, this.now() + 30000); }
 presenceSent(roomId: string) { this.presenceAt.set(roomId, this.now() + 30000); }
 succeeded() { this.failures = 0; this.retryAt = 0; }

 failed(error: { status?: number; message?: string; code?: string; retryAfterMs?: number }) {
  if (error.status !== 429 && !(error.status && error.status >= 500 && error.status <= 599) && error.status !== 0) { return; }
  const quota = error.code === 'FIRESTORE_RESOURCE_EXHAUSTED' || /RESOURCE_EXHAUSTED|Firestore.*quota/i.test(error.message || '');
  const delay = Math.min((quota ? 600000 : 60000) * 2 ** Math.min(this.failures++, 5), 1800000);
  this.retryAt = Math.max(this.retryAt, this.now() + Math.max(delay, error.retryAfterMs || 0));
 }

 reset() {
  this.roomsAt = 0;
  this.detailsAt.clear();
  this.presenceAt.clear();
  this.succeeded();
 }
}
