import type { PathCommand, PathFollowConfig } from '../../sdk/typescript/galfus.ts';

export interface RoomRecipe {
  primaryColor?: [number, number, number, number];
  secondaryColor?: [number, number, number, number];
  accentColor?: [number, number, number, number];
  features?: string[];
  paramA?: number;
  paramB?: number;
}

export interface RoomMarker {
  id: string;
  roomIndex: number;
  name: string;
  category: string;
  startTime: number;
  duration: number;
  focusPoint: [number, number, number];
  cameraPoint: [number, number, number];
  description: string;
  telemetry: Record<string, string | number>;
  recipe: RoomRecipe;
}

export interface TourConfig {
  title: string;
  version: string;
  duration: number;
  defaultSeed: number;
  loopPolicy: 'loop' | 'once';
  cameraPositionPath: {
    config: PathFollowConfig;
    commands: PathCommand[];
  };
  cameraLookTargetPath: {
    config: PathFollowConfig;
    commands: PathCommand[];
  };
  rooms: RoomMarker[];
}
