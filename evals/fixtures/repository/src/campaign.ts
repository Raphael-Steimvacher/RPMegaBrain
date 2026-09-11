export interface Campaign { id: string; date: string }
// Fixture sintética; comportamento intencionalmente incompleto para futuros evals.
export function sortCampaigns(items: Campaign[]): Campaign[] { return [...items]; }
