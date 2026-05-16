interface CurrentUserLike {
  did?: string | null;
  handle?: string | null;
}

export function isCurrentUser(
  profileDid?: string,
  profileHandle?: string,
  currentUser?: CurrentUserLike | null
): boolean {
  if (!profileDid || !currentUser) return false;
  return profileDid === currentUser.did || profileHandle === currentUser.handle;
}
