"use client";

import { useEffect, useState } from "react";
import { Sun, CloudSun, CloudRain, Cloud } from "@phosphor-icons/react";

type Day = { name: string; temp: number; rain: number; forecast: string };

// Pick one monochrome icon from today's forecast text — no cartoon suns.
function wxIcon(forecast: string, rain: number) {
  const f = forecast.toLowerCase();
  if (rain >= 40 || /rain|shower|storm|drizzle/.test(f)) return <CloudRain size={24} />;
  if (/cloud|overcast/.test(f)) return /partly|mostly sunny|few/.test(f) ? <CloudSun size={24} /> : <Cloud size={24} />;
  if (/sun|clear|fair/.test(f)) return <Sun size={24} />;
  return <CloudSun size={24} />;
}

// Top-of-dashboard weather card. Auto-loads the NWS forecast (keyless, /api/weather) on mount and
// flags the next rain day so the crew knows before scheduling a pour. A nicety — stays silent on
// loading or error rather than cluttering the dashboard.
export default function WeatherBanner() {
  const [days, setDays] = useState<Day[] | null>(null);
  const [location, setLocation] = useState("");

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const d = await (await fetch("/api/weather")).json();
        if (live && d.ok && d.days?.length) {
          setDays(d.days);
          setLocation(d.location ?? "");
        }
      } catch {
        /* silent — the banner just doesn't render */
      }
    })();
    return () => { live = false; };
  }, []);

  if (!days || !days.length) return null;

  const today = days[0];

  return (
    <div className="wx-card">
      <div className="wx-today">
        <div className="wx-icon" aria-hidden>
          {wxIcon(today.forecast, today.rain)}
        </div>
        <div>
          <div className="wx-temp">{today.temp}°</div>
          {location && <div className="wx-city">{location}</div>}
        </div>
      </div>
      <div className="wx-days">
        {days.slice(1, 6).map((d) => (
          <div className={`wx-day${d.rain >= 40 ? " wet" : ""}`} key={d.name}>
            <div className="wx-day-name">{d.name}</div>
            <div className="wx-day-temp">{d.temp}°</div>
            <div className="wx-day-rain">{d.rain}%</div>
          </div>
        ))}
      </div>
    </div>
  );
}
