export type ReactionShape = {
  value: string;
  sender?: { did?: string };
  createdAt?: string;
};

export function groupReactions(
  reactions: ReactionShape[] | undefined,
  currentUserDid: string | undefined
): Array<{ value: string; count: number; includesMe: boolean }> {
  if (!reactions?.length) return [];
  const map = new Map<string, { count: number; includesMe: boolean }>();
  for (const r of reactions) {
    const v = r.value ?? '';
    if (!v) continue;
    const prev = map.get(v);
    const isMe = !!currentUserDid && r.sender?.did === currentUserDid;
    if (prev) {
      prev.count += 1;
      prev.includesMe = prev.includesMe || isMe;
    } else {
      map.set(v, { count: 1, includesMe: isMe });
    }
  }
  return Array.from(map.entries()).map(([value, { count, includesMe }]) => ({
    value,
    count,
    includesMe,
  }));
}
