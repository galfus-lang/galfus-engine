import type { RoomMarker, TourConfig } from './types.ts';

function escapeXml(unsafe: string | number): string {
  return String(unsafe)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function renderCompanionPanelSvg(
  tour: TourConfig,
  currentRoom: RoomMarker,
  elapsedSecs: number,
  isPaused: boolean,
  activeBinding = 'Bun / FFI'
): string {
  const totalDuration = tour.duration;
  const progressRatio = Math.max(0.0, Math.min(1.0, elapsedSecs / totalDuration));
  const progressPercent = Math.round(progressRatio * 100);
  const progressBarWidth = Math.max(6, Math.round(progressRatio * 440));

  const roomIdx = currentRoom.roomIndex + 1;
  const totalRooms = tour.rooms.length;

  const telemetryLines = Object.entries(currentRoom.telemetry)
    .slice(0, 4)
    .map(
      ([key, val], idx) =>
        `<tspan x="${idx < 2 ? 34 : 260}" y="${156 + (idx % 2) * 20}">▸ ${escapeXml(key)}: <tspan fill="#38BDF8" font-weight="bold">${escapeXml(val)}</tspan></tspan>`
    )
    .join('');

  const statusBadge = isPaused
    ? '<rect x="390" y="20" width="80" height="24" rx="6" fill="#DC2626"/><text x="430" y="36" font-family="sans-serif" font-size="11" font-weight="bold" fill="#FFFFFF" text-anchor="middle">PAUSED</text>'
    : '<rect x="390" y="20" width="80" height="24" rx="6" fill="#059669"/><text x="430" y="36" font-family="sans-serif" font-size="11" font-weight="bold" fill="#FFFFFF" text-anchor="middle">LIVE TOUR</text>';

  const safeTitle = escapeXml(tour.title);
  const safeBinding = escapeXml(activeBinding);
  const safeCategory = escapeXml(currentRoom.category);
  const safeRoomName = escapeXml(currentRoom.name);
  const safeRoomDesc = escapeXml(currentRoom.description);

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 240" width="500" height="240">
  <defs>
    <linearGradient id="cardBg" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#1E293B"/>
      <stop offset="100%" stop-color="#0F172A"/>
    </linearGradient>
    <linearGradient id="neonBar" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#06B6D4"/>
      <stop offset="50%" stop-color="#3B82F6"/>
      <stop offset="100%" stop-color="#8B5CF6"/>
    </linearGradient>
  </defs>

  <!-- Panel Card Outer Frame -->
  <rect x="8" y="8" width="484" height="224" rx="14" fill="url(#cardBg)" stroke="#38BDF8" stroke-width="2"/>

  <!-- Top Accent Glowing Strip -->
  <path d="M 22 8 L 478 8" stroke="#38BDF8" stroke-width="3" stroke-linecap="round"/>

  <!-- Header -->
  <text x="28" y="36" font-family="sans-serif" font-size="16" font-weight="bold" fill="#FFFFFF">${safeTitle}</text>
  <rect x="230" y="22" width="90" height="20" rx="4" fill="#334155"/>
  <text x="275" y="36" font-family="sans-serif" font-size="10" font-weight="bold" fill="#38BDF8" text-anchor="middle">${safeBinding}</text>
  ${statusBadge}

  <!-- Category & Room Name -->
  <rect x="28" y="50" width="130" height="18" rx="4" fill="#0284C7"/>
  <text x="93" y="63" font-family="sans-serif" font-size="10" font-weight="bold" fill="#FFFFFF" text-anchor="middle">${safeCategory}</text>
  <text x="170" y="65" font-family="sans-serif" font-size="14" font-weight="bold" fill="#F8FAFC">Room ${roomIdx}/${totalRooms}: ${safeRoomName}</text>
  <text x="28" y="86" font-family="sans-serif" font-size="12" fill="#E2E8F0">${safeRoomDesc}</text>

  <!-- Progress Bar Container -->
  <rect x="28" y="98" width="444" height="14" rx="7" fill="#334155" stroke="#475569" stroke-width="1"/>
  <rect x="28" y="98" width="${progressBarWidth}" height="14" rx="7" fill="url(#neonBar)"/>
  <text x="472" y="124" font-family="sans-serif" font-size="11" font-weight="bold" fill="#94A3B8" text-anchor="end">${progressPercent}% (${elapsedSecs.toFixed(1)}s / ${totalDuration}s)</text>

  <!-- Telemetry Card Box -->
  <rect x="24" y="132" width="452" height="52" rx="8" fill="#1E293B" stroke="#475569" stroke-width="1.5"/>
  <text font-family="monospace" font-size="11" fill="#CBD5E1">
    ${telemetryLines}
  </text>

  <!-- Controls Legend Footer -->
  <text x="28" y="210" font-family="sans-serif" font-size="11" fill="#94A3B8">[Space]: Pause/Resume  |  [←/→]: Prev/Next Room  |  [R]: Restart  |  [Esc]: Exit</text>
</svg>`;
}
