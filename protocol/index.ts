// Module re-exports of the global BSV namespace, for consumers that can use
// normal imports (ui/, core/). See global.d.ts for why the source of truth is
// a global namespace.

export type Track = BSV.Track;
export type Scene = BSV.Scene;
export type Clip = BSV.Clip;
export type PlayingClip = BSV.PlayingClip;
export type ClipStatusFrame = BSV.ClipStatusFrame;
export type Snapshot = BSV.Snapshot;
export type Palette = BSV.Palette;
export type TransportState = BSV.TransportState;
export type TransportPatch = BSV.TransportPatch;
export type ApplyOp = BSV.ApplyOp;
export type SceneOp = BSV.SceneOp;
export type Role = BSV.Role;
export type DeviceState = BSV.DeviceState;
export type ChainDevice = BSV.ChainDevice;
export type RackChain = BSV.RackChain;
export type TrackDevices = BSV.TrackDevices;
export type ApplyResult = BSV.ApplyResult;
export type Request = BSV.Request;
export type RequestType = BSV.RequestType;
export type Event = BSV.Event;
export type EventType = BSV.EventType;
export type EventOf<K extends BSV.EventType> = BSV.EventOf<K>;

/** WebSocket path. Namespaced so Vite can proxy it in dev without colliding with `/`. */
export const WS_PATH = '/ws';
export const DEFAULT_PORT = 17800;
