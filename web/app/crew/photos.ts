// Crew headshots (resized copies of the marketing site's team photos in public/crew/).
// Keyed by full name as it appears in the crew table.
const PHOTOS: Record<string, string> = {
  "Rick Burge": "/crew/rick.jpg",
  "Josh Harris": "/crew/josh.jpg",
  "Jason Yant": "/crew/jason.jpg",
  "Walt Burge": "/crew/walt.jpg",
  "Patton Brock Burge": "/crew/brock.jpg",
  "Michael Todd Murphy": "/crew/todd.jpg",
  "Sandi Woods": "/crew/sandi.jpg",
};

export function crewPhoto(name: string): string | null {
  return PHOTOS[name] ?? null;
}
