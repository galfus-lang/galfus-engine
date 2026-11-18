import type { RoomMarker, TourConfig } from './types.ts';

export interface UiQuadDesc {
  rect: [number, number, number, number];
  backgroundColor?: [number, number, number, number];
  borderColor?: [number, number, number, number];
  borderWidth?: [number, number, number, number];
  borderRadius?: [number, number, number, number];
  zLayer?: number;
}

export interface UiTextDesc {
  position: [number, number];
  fontSize: number;
  color?: [number, number, number, number];
  text: string;
  zLayer?: number;
}

export interface CompanionUiDesc {
  quads: UiQuadDesc[];
  texts: UiTextDesc[];
}

export function renderCompanionPanelUi(
  tour: TourConfig,
  currentRoom: RoomMarker,
  elapsedSecs: number,
  isPaused: boolean,
  activeBinding = 'Bun / FFI'
): CompanionUiDesc {
  const totalDuration = tour.duration;
  const progressRatio = Math.max(0.0, Math.min(1.0, elapsedSecs / totalDuration));
  const progressPercent = Math.round(progressRatio * 100);
  const progressBarWidth = Math.max(6, Math.round(progressRatio * 444));

  const roomIdx = currentRoom.roomIndex + 1;
  const totalRooms = tour.rooms.length;

  const quads: UiQuadDesc[] = [];
  const texts: UiTextDesc[] = [];

  // 1. Outer Card Background
  quads.push({
    rect: [8, 8, 484, 224],
    backgroundColor: [0.06, 0.09, 0.16, 0.95],
    borderColor: [0.22, 0.74, 0.97, 1.0],
    borderWidth: [2, 2, 2, 2],
    borderRadius: [14, 14, 14, 14]
  });

  // 2. Top Accent Glow Strip
  quads.push({
    rect: [22, 8, 456, 3],
    backgroundColor: [0.22, 0.74, 0.97, 1.0],
    borderRadius: [1.5, 1.5, 1.5, 1.5]
  });

  // 3. Header Title
  texts.push({
    position: [28, 20],
    fontSize: 16,
    color: [1.0, 1.0, 1.0, 1.0],
    text: tour.title
  });

  // 4. Binding Badge
  quads.push({
    rect: [230, 18, 90, 20],
    backgroundColor: [0.2, 0.25, 0.33, 1.0],
    borderRadius: [4, 4, 4, 4]
  });
  texts.push({
    position: [240, 22],
    fontSize: 10,
    color: [0.22, 0.74, 0.97, 1.0],
    text: activeBinding
  });

  // 5. Status Badge
  const statusBg: [number, number, number, number] = isPaused
    ? [0.86, 0.15, 0.15, 1.0]
    : [0.02, 0.59, 0.41, 1.0];
  quads.push({
    rect: [390, 18, 80, 22],
    backgroundColor: statusBg,
    borderRadius: [6, 6, 6, 6]
  });
  texts.push({
    position: [isPaused ? 408 : 402, 22],
    fontSize: 11,
    color: [1.0, 1.0, 1.0, 1.0],
    text: isPaused ? 'PAUSED' : 'LIVE TOUR'
  });

  // 6. Category Badge
  quads.push({
    rect: [28, 48, 120, 18],
    backgroundColor: [0.01, 0.52, 0.78, 1.0],
    borderRadius: [4, 4, 4, 4]
  });
  texts.push({
    position: [34, 50],
    fontSize: 10,
    color: [1.0, 1.0, 1.0, 1.0],
    text: currentRoom.category
  });

  // 7. Room Name & Description
  texts.push({
    position: [160, 50],
    fontSize: 14,
    color: [0.97, 0.98, 0.99, 1.0],
    text: `Room ${roomIdx}/${totalRooms}: ${currentRoom.name}`
  });
  texts.push({
    position: [28, 74],
    fontSize: 12,
    color: [0.89, 0.91, 0.94, 1.0],
    text: currentRoom.description
  });

  // 8. Progress Bar Container & Fill
  quads.push({
    rect: [28, 96, 444, 14],
    backgroundColor: [0.2, 0.25, 0.33, 1.0],
    borderColor: [0.28, 0.33, 0.41, 1.0],
    borderWidth: [1, 1, 1, 1],
    borderRadius: [7, 7, 7, 7]
  });
  quads.push({
    rect: [28, 96, progressBarWidth, 14],
    backgroundColor: [0.23, 0.51, 0.96, 1.0],
    borderRadius: [7, 7, 7, 7]
  });
  texts.push({
    position: [330, 114],
    fontSize: 11,
    color: [0.58, 0.64, 0.72, 1.0],
    text: `${progressPercent}% (${elapsedSecs.toFixed(1)}s / ${totalDuration}s)`
  });

  // 9. Telemetry Card Box
  quads.push({
    rect: [24, 132, 452, 52],
    backgroundColor: [0.12, 0.16, 0.23, 1.0],
    borderColor: [0.28, 0.33, 0.41, 1.0],
    borderWidth: [1, 1, 1, 1],
    borderRadius: [8, 8, 8, 8]
  });

  const telemetryEntries = Object.entries(currentRoom.telemetry).slice(0, 4);
  for (let idx = 0; idx < telemetryEntries.length; idx++) {
    const [key, val] = telemetryEntries[idx]!;
    const posX = idx < 2 ? 34 : 250;
    const posY = 140 + (idx % 2) * 20;
    texts.push({
      position: [posX, posY],
      fontSize: 11,
      color: [0.8, 0.84, 0.88, 1.0],
      text: `▸ ${key}: ${val}`
    });
  }

  // 10. Controls Legend Footer
  texts.push({
    position: [28, 198],
    fontSize: 11,
    color: [0.58, 0.64, 0.72, 1.0],
    text: '[Space]: Pause/Resume  |  [←/→]: Prev/Next Room  |  [R]: Restart  |  [Esc]: Exit'
  });

  return { quads, texts };
}
