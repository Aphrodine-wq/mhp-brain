// Google Maps embed of the business — the "GMB embed" that actually exists. No API key
// needed; renders the business card (name, rating, address, directions) from the place query.
export default function GmbMap() {
  const q = encodeURIComponent("North Mississippi Home Professionals, Oxford, MS");
  return (
    <div className="gmb-card">
      <iframe
        title="North Mississippi Home Professionals on Google Maps"
        src={`https://www.google.com/maps?q=${q}&output=embed`}
        loading="lazy"
        referrerPolicy="no-referrer-when-downgrade"
      />
    </div>
  );
}
