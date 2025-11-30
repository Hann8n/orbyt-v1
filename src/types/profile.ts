export interface OrbytProfileRecord {
  $type: 'com.getorbyt.profile';
  joinDate: string; // ISO string
  updatedAt: string; // ISO string
  colors?: {
    backgroundColor: string;
    textColor: string;
  } | null;
  subscribedChannels: string[]; // ordered URIs
  algorithmicFeedProvider?: string | null; // Feed URI or null for none
}
